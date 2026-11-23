from pathlib import Path

from sqlalchemy import select

from app.ml.classifier import train_model
from app.models import AuditLog
from app.services.audit_service import (
    GENESIS_HASH,
    calculate_hash,
    canonical_record_data,
    verify_audit_chain,
)


def test_mongodb_log_insertion_and_retrieval(context, admin_headers):
    payload = {
        "incident_id": context["incident"].incident_id,
        "source": "Email Gateway",
        "event_type": "phishing_url",
        "source_ip": "198.51.100.10",
        "destination_ip": "10.1.1.25",
        "severity": "High",
        "description": "Credential harvesting URL was blocked.",
        "metadata": {"blocked": True},
    }
    created = context["client"].post(
        "/security-logs", headers=admin_headers, json=payload
    )
    assert created.status_code == 201, created.text
    response = context["client"].get(
        f"/security-logs?incident_id={context['incident'].incident_id}&source=Email%20Gateway",
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()[0]["log_id"] == created.json()["log_id"]


def test_audit_hash_generation_is_deterministic(context):
    record = context["db"].scalar(select(AuditLog).order_by(AuditLog.log_id))
    canonical = canonical_record_data(
        record.incident_id,
        record.performed_by,
        record.action_type,
        record.action_data,
        record.timestamp,
    )
    assert calculate_hash(GENESIS_HASH, canonical) == record.hash
    assert len(record.hash) == 64


def test_audit_chain_verification_endpoint(context, admin_headers):
    response = context["client"].get("/audit/verify", headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {
        "integrity_valid": True,
        "records_checked": 1,
        "first_invalid_log_id": None,
    }


def test_audit_tampering_is_detected(context):
    record = context["db"].scalar(select(AuditLog).order_by(AuditLog.log_id))
    record.action_type = "TAMPERED"
    context["db"].commit()
    result = verify_audit_chain(context["db"])
    assert result["integrity_valid"] is False
    assert result["first_invalid_log_id"] == record.log_id


def test_severity_classifier_trains_and_predicts_all_classes(tmp_path: Path):
    model = train_model(tmp_path / "test_severity_model.joblib")
    assert set(model.classes_) == {"Low", "Medium", "High", "Critical"}
    prediction = model.predict(
        ["Malware destructive ransomware encrypting production servers and deleting data"]
    )[0]
    assert prediction in model.classes_
    assert (tmp_path / "test_severity_model.joblib").exists()


def test_severity_suggestion_api_is_advisory(context, reporter_headers):
    response = context["client"].post(
        "/incidents/suggest-severity",
        headers=reporter_headers,
        json={
            "title": "Ransomware spreading across servers",
            "description": "Multiple production servers are encrypting files and services are unavailable.",
            "incident_type": "Malware",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["suggested_severity"] in {"Low", "Medium", "High", "Critical"}
    assert "Academic prototype" in response.json()["disclaimer"]
