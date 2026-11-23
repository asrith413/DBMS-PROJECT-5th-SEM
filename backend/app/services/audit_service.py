import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event, select, text
from sqlalchemy.orm import Session

from app.models import AuditLog


GENESIS_HASH = "0" * 64
AUDIT_CHAIN_LOCK_KEY = 0x43494D5341554449
_SQLITE_AUDIT_LOCK = threading.Lock()
_SQLITE_LOCK_FLAG = "cims_audit_chain_lock"


@event.listens_for(Session, "after_transaction_end")
def _release_sqlite_audit_lock(db: Session, transaction: Any) -> None:
    if transaction.parent is None and db.info.pop(_SQLITE_LOCK_FLAG, False):
        _SQLITE_AUDIT_LOCK.release()


def _acquire_audit_chain_lock(db: Session) -> None:
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        # Held by PostgreSQL until this transaction commits or rolls back.
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": AUDIT_CHAIN_LOCK_KEY},
        )
    elif dialect == "sqlite" and not db.info.get(_SQLITE_LOCK_FLAG):
        # SQLite has no advisory locks; retain this fallback until transaction end.
        _SQLITE_AUDIT_LOCK.acquire()
        db.info[_SQLITE_LOCK_FLAG] = True


def _normalized_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds")


def canonical_record_data(
    incident_id: int,
    performed_by: int,
    action_type: str,
    action_data: dict[str, Any],
    timestamp: datetime,
) -> str:
    payload = {
        "action_data": action_data,
        "action_type": action_type,
        "incident_id": incident_id,
        "performed_by": performed_by,
        "timestamp": _normalized_timestamp(timestamp),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def calculate_hash(previous_hash: str, canonical_data: str) -> str:
    return hashlib.sha256(f"{previous_hash}{canonical_data}".encode("utf-8")).hexdigest()


def create_audit_log(
    db: Session,
    *,
    incident_id: int,
    performed_by: int,
    action_type: str,
    action_data: dict[str, Any],
    timestamp: datetime | None = None,
) -> AuditLog:
    _acquire_audit_chain_lock(db)
    last_record = db.scalar(
        select(AuditLog).order_by(AuditLog.log_id.desc()).limit(1).with_for_update()
    )
    previous_hash = last_record.hash if last_record else GENESIS_HASH
    record_timestamp = timestamp or datetime.now(timezone.utc)
    canonical_data = canonical_record_data(
        incident_id, performed_by, action_type, action_data, record_timestamp
    )
    record = AuditLog(
        incident_id=incident_id,
        performed_by=performed_by,
        action_type=action_type,
        action_data=action_data,
        prev_hash=previous_hash,
        hash=calculate_hash(previous_hash, canonical_data),
        timestamp=record_timestamp,
    )
    db.add(record)
    db.flush()
    return record


def verify_audit_chain(db: Session) -> dict[str, Any]:
    records = db.scalars(
        select(AuditLog).order_by(AuditLog.log_id.asc())
    ).all()
    expected_previous = GENESIS_HASH
    for position, record in enumerate(records, start=1):
        canonical_data = canonical_record_data(
            record.incident_id,
            record.performed_by,
            record.action_type,
            record.action_data,
            record.timestamp,
        )
        expected_hash = calculate_hash(expected_previous, canonical_data)
        if record.prev_hash != expected_previous or record.hash != expected_hash:
            return {
                "integrity_valid": False,
                "records_checked": position,
                "first_invalid_log_id": record.log_id,
            }
        expected_previous = record.hash
    return {
        "integrity_valid": True,
        "records_checked": len(records),
        "first_invalid_log_id": None,
    }
