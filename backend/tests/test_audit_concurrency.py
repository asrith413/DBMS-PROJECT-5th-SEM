from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import URL
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database.seed import seed_relational_data
from app.models import (
    AuditLog,
    Incident,
    IncidentAsset,
    IncidentStatus,
    IncidentThreatActor,
    IncidentType,
    Role,
    Severity,
    User,
)
from app.models.base import Base
from app.services import audit_service
from app.services.audit_service import GENESIS_HASH, create_audit_log, verify_audit_chain


AUDIT_RECORD_COUNT = 12


@pytest.fixture()
def sqlite_sessions(tmp_path: Path):
    engine = create_engine(
        URL.create("sqlite", database=str(tmp_path / "audit-regression.sqlite3")),
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )
    yield session_factory
    engine.dispose()


def _create_minimum_incident(session_factory) -> tuple[int, int]:
    with session_factory() as db:
        reporter = User(
            name="Audit Reporter",
            email="audit-reporter@example.test",
            password_hash="unused-test-password-hash",
            role=Role.REPORTER,
            department="Security",
        )
        incident_type = IncidentType(
            name="Audit regression",
            description="Incident type used by audit regression tests.",
        )
        severity = Severity(
            level="Medium",
            response_sla_hours=8,
            resolution_sla_hours=24,
        )
        db.add_all([reporter, incident_type, severity])
        db.flush()

        incident = Incident(
            title="Concurrent audit writes",
            description="Minimum incident required by the audit foreign keys.",
            type_id=incident_type.type_id,
            severity_id=severity.severity_id,
            reported_by=reporter.user_id,
            status=IncidentStatus.OPEN,
            reported_date=datetime.now(timezone.utc),
        )
        db.add(incident)
        db.flush()
        identifiers = (incident.incident_id, reporter.user_id)
        db.commit()
        return identifiers


def _append_audit_record(
    session_factory, incident_id: int, user_id: int, sequence: int
) -> int:
    with session_factory() as db:
        record = create_audit_log(
            db,
            incident_id=incident_id,
            performed_by=user_id,
            action_type="CONCURRENT_APPEND",
            action_data={"sequence": sequence},
        )
        db.commit()
        return record.log_id


def test_concurrent_sqlite_audit_appends_preserve_the_chain(sqlite_sessions):
    incident_id, user_id = _create_minimum_incident(sqlite_sessions)

    with ThreadPoolExecutor(max_workers=AUDIT_RECORD_COUNT) as executor:
        futures = [
            executor.submit(
                _append_audit_record,
                sqlite_sessions,
                incident_id,
                user_id,
                sequence,
            )
            for sequence in range(AUDIT_RECORD_COUNT)
        ]
        completed, pending = wait(futures, timeout=30)

    assert not pending
    assert len(completed) == AUDIT_RECORD_COUNT
    assert all(future.exception() is None for future in futures)
    appended_log_ids = [future.result() for future in futures]

    with sqlite_sessions() as db:
        records = db.scalars(
            select(AuditLog).order_by(AuditLog.log_id.asc())
        ).all()
        verification = verify_audit_chain(db)

    log_ids = [record.log_id for record in records]
    assert len(records) == AUDIT_RECORD_COUNT
    assert log_ids == sorted(appended_log_ids)
    assert all(left < right for left, right in zip(log_ids, log_ids[1:]))
    assert records[0].prev_hash == GENESIS_HASH
    assert all(
        current.prev_hash == previous.hash
        for previous, current in zip(records, records[1:])
    )
    assert verification == {
        "integrity_valid": True,
        "records_checked": len(records),
        "first_invalid_log_id": None,
    }


def test_rolled_back_sqlite_audit_append_releases_fallback_lock(sqlite_sessions):
    incident_id, user_id = _create_minimum_incident(sqlite_sessions)

    with sqlite_sessions() as db:
        with pytest.raises(IntegrityError):
            create_audit_log(
                db,
                incident_id=incident_id + 100_000,
                performed_by=user_id,
                action_type="INVALID_APPEND",
                action_data={"expected": "foreign-key failure"},
            )
        db.rollback()

    assert audit_service._SQLITE_AUDIT_LOCK.acquire(blocking=False)
    audit_service._SQLITE_AUDIT_LOCK.release()

    appended_log_id = _append_audit_record(
        sqlite_sessions, incident_id, user_id, sequence=1
    )
    with sqlite_sessions() as db:
        records = db.scalars(
            select(AuditLog).order_by(AuditLog.log_id.asc())
        ).all()
        verification = verify_audit_chain(db)

    assert [record.log_id for record in records] == [appended_log_id]
    assert records[0].prev_hash == GENESIS_HASH
    assert verification["integrity_valid"] is True
    assert verification["records_checked"] == len(records)


def test_seeded_audit_chain_matches_relational_state(sqlite_sessions):
    with sqlite_sessions() as db:
        seed_result = seed_relational_data(db)
        records = db.scalars(
            select(AuditLog).order_by(AuditLog.log_id.asc())
        ).all()
        incidents = db.scalars(
            select(Incident).order_by(Incident.incident_id.asc())
        ).all()
        asset_links = db.scalars(select(IncidentAsset)).all()
        threat_actor_links = db.scalars(select(IncidentThreatActor)).all()
        verification = verify_audit_chain(db)

    assert seed_result["incidents"] == len(incidents)
    assert records
    assert verification == {
        "integrity_valid": True,
        "records_checked": len(records),
        "first_invalid_log_id": None,
    }
    assert all(
        previous.timestamp <= current.timestamp
        for previous, current in zip(records, records[1:])
    )

    status_action_types = {
        "INCIDENT_CREATED",
        "INCIDENT_ASSIGNED",
        "STATUS_CHANGED",
        "INCIDENT_RESOLVED",
    }
    for incident in incidents:
        status_events = [
            record
            for record in records
            if record.incident_id == incident.incident_id
            and record.action_type in status_action_types
        ]
        assert status_events

        reconstructed_status = None
        for record in status_events:
            if record.action_type == "INCIDENT_CREATED":
                assert reconstructed_status is None
                reconstructed_status = record.action_data["status"]
            else:
                assert record.action_data["old_status"] == reconstructed_status
                reconstructed_status = record.action_data["new_status"]

        assert reconstructed_status == incident.status.value

    asset_audit_links = {
        (record.incident_id, record.action_data.get("asset_id"))
        for record in records
        if record.action_type == "ASSET_ASSOCIATED"
    }
    threat_actor_audit_links = {
        (record.incident_id, record.action_data.get("actor_id"))
        for record in records
        if record.action_type == "THREAT_ACTOR_ASSOCIATED"
    }

    assert asset_links
    assert threat_actor_links
    assert {
        (link.incident_id, link.asset_id) for link in asset_links
    } <= asset_audit_links
    assert {
        (link.incident_id, link.actor_id) for link in threat_actor_links
    } <= threat_actor_audit_links
