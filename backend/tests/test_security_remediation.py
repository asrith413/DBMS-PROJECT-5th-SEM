from datetime import datetime, timedelta, timezone

import jwt
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.config import Settings, settings
from app.models import (
    Action,
    Asset,
    IncidentAsset,
    IncidentAssignment,
    IncidentThreatActor,
    ThreatActor,
    User,
)
from tests.conftest import TEST_PASSWORD


STRONG_JWT_SECRET = "x7G!2pQ#9Lm$4Vz@8Nc%6Tk&3Hs*5Wr!1Yb#7Df@2Kq"


def user_count(context) -> int:
    return context["db"].scalar(select(func.count()).select_from(User)) or 0


def admin_token_claims(context) -> dict[str, object]:
    issued_at = datetime.now(timezone.utc)
    return {
        "sub": str(context["admin"].user_id),
        "role": context["admin"].role.value,
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=5),
    }


def test_settings_rejects_missing_jwt_secret_without_env_file(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "secret",
    [
        "short-secret",
        "replace-with-this-placeholder-secret-1234567890",
        "Ab1!" * 16,
    ],
    ids=["short", "placeholder", "repetitive"],
)
def test_settings_rejects_insecure_jwt_secrets(secret):
    with pytest.raises(ValidationError):
        Settings(jwt_secret_key=secret, _env_file=None)


def test_settings_accepts_strong_jwt_secret():
    configured = Settings(jwt_secret_key=STRONG_JWT_SECRET, _env_file=None)

    assert configured.jwt_secret_key == STRONG_JWT_SECRET


def test_normal_login_token_still_works(context, admin_headers):
    response = context["client"].get("/auth/me", headers=admin_headers)

    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == context["admin"].user_id


def test_password_whitespace_is_preserved_during_registration(context):
    password = "  Password-With-Spaces-123!  "
    registered = context["client"].post(
        "/auth/register",
        json={
            "name": "Whitespace Password User",
            "email": "whitespace.password@cims.edu",
            "password": password,
            "department": "Security",
        },
    )
    assert registered.status_code == 201, registered.text

    exact_login = context["client"].post(
        "/auth/login",
        data={"username": "whitespace.password@cims.edu", "password": password},
    )
    trimmed_login = context["client"].post(
        "/auth/login",
        data={
            "username": "whitespace.password@cims.edu",
            "password": password.strip(),
        },
    )
    assert exact_login.status_code == 200, exact_login.text
    assert trimmed_login.status_code == 401


def test_token_signed_with_wrong_key_cannot_access_users(context):
    token = jwt.encode(
        admin_token_claims(context),
        "N4!different-signing-key$8wZ2qP7mL5cR9xT1",
        algorithm=settings.jwt_algorithm,
    )

    response = context["client"].get(
        "/users", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize("missing_claim", ["sub", "role", "iat", "exp"])
def test_token_missing_required_claim_cannot_access_users(context, missing_claim):
    claims = admin_token_claims(context)
    claims.pop(missing_claim)
    token = jwt.encode(
        claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )

    response = context["client"].get(
        "/users", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {
            "name": "Missing Email",
            "password": TEST_PASSWORD,
            "role": "REPORTER",
        },
        {
            "name": "Null Email",
            "email": None,
            "password": TEST_PASSWORD,
            "role": "REPORTER",
        },
        {
            "name": "Invalid Email",
            "email": "not-an-email",
            "password": TEST_PASSWORD,
            "role": "REPORTER",
        },
    ],
    ids=["missing", "null", "invalid"],
)
def test_invalid_user_create_email_does_not_add_user(
    context, admin_headers, payload
):
    before = user_count(context)

    response = context["client"].post(
        "/users", headers=admin_headers, json=payload
    )

    assert response.status_code == 422
    assert user_count(context) == before


def test_duplicate_user_email_does_not_add_user(context, admin_headers):
    before = user_count(context)

    response = context["client"].post(
        "/users",
        headers=admin_headers,
        json={
            "name": "Duplicate Reporter",
            "email": context["reporter"].email.upper(),
            "password": TEST_PASSWORD,
            "role": "REPORTER",
        },
    )

    assert response.status_code == 409
    assert user_count(context) == before


def test_null_user_email_patch_preserves_stored_email(context, admin_headers):
    reporter_id = context["reporter"].user_id
    original_email = context["reporter"].email

    response = context["client"].patch(
        f"/users/{reporter_id}", headers=admin_headers, json={"email": None}
    )

    stored_email = context["db"].scalar(
        select(User.email).where(User.user_id == reporter_id)
    )
    assert response.status_code == 422
    assert stored_email == original_email


def test_reporter_is_forbidden_from_privileged_endpoints(
    context, reporter_headers
):
    endpoints = (
        "/analysts",
        "/assets",
        "/users",
        "/assignments",
        f"/actions/incident/{context['incident'].incident_id}",
        "/threat-actors",
        "/audit",
        "/audit/verify",
        "/reports/dashboard",
        "/security-logs",
    )

    statuses = {
        endpoint: context["client"].get(endpoint, headers=reporter_headers).status_code
        for endpoint in endpoints
    }

    assert statuses == dict.fromkeys(endpoints, 403)


def test_analyst_is_forbidden_from_admin_endpoints(context, analyst_headers):
    endpoints = (
        "/analysts",
        "/users",
        "/audit",
        "/audit/verify",
        "/reports/dashboard",
    )

    statuses = {
        endpoint: context["client"].get(endpoint, headers=analyst_headers).status_code
        for endpoint in endpoints
    }

    assert statuses == dict.fromkeys(endpoints, 403)


def test_analyst_asset_inventory_is_limited_to_assigned_incidents(
    context, admin_headers, analyst_headers
):
    client = context["client"]
    assert client.get("/assets", headers=analyst_headers).json() == []

    assignment = client.post(
        "/assignments",
        headers=admin_headers,
        json={
            "incident_id": context["incident"].incident_id,
            "analyst_id": context["analyst_user"].user_id,
            "role": "Primary Analyst",
        },
    )
    assert assignment.status_code == 201, assignment.text
    link = client.post(
        f"/assets/{context['asset'].asset_id}/incidents/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"impact_type": "Assigned incident asset"},
    )
    assert link.status_code == 201, link.text

    unrelated = Asset(
        name="Unrelated Internal Asset",
        type="Server",
        ip_address="192.0.2.90",
        department="Operations",
    )
    context["db"].add(unrelated)
    context["db"].commit()

    response = client.get("/assets", headers=analyst_headers)
    assert response.status_code == 200, response.text
    assert [item["asset_id"] for item in response.json()] == [context["asset"].asset_id]
    assert client.get(
        f"/assets/{context['asset'].asset_id}", headers=analyst_headers
    ).status_code == 200
    assert client.get(
        f"/assets/{unrelated.asset_id}", headers=analyst_headers
    ).status_code == 404


def test_admin_can_access_admin_endpoints(context, admin_headers):
    endpoints = (
        "/analysts",
        "/users",
        "/audit",
        "/audit/verify",
        "/reports/dashboard",
    )

    statuses = {
        endpoint: context["client"].get(endpoint, headers=admin_headers).status_code
        for endpoint in endpoints
    }

    assert statuses == dict.fromkeys(endpoints, 200)


def test_reporter_incident_detail_hides_sensitive_relations(
    context, reporter_headers
):
    db = context["db"]
    incident_id = context["incident"].incident_id
    threat_actor = ThreatActor(
        alias="Regression Actor",
        description="Actor linked to the regression incident.",
    )
    db.add(threat_actor)
    db.flush()

    assignment = IncidentAssignment(
        incident_id=incident_id,
        analyst_id=context["analyst_user"].user_id,
        role="Primary Analyst",
    )
    asset_link = IncidentAsset(
        incident_id=incident_id,
        asset_id=context["asset"].asset_id,
        impact_type="Credentials targeted",
    )
    action = Action(
        incident_id=incident_id,
        performed_by=context["admin"].user_id,
        description="Reviewed the malicious message.",
    )
    threat_link = IncidentThreatActor(
        incident_id=incident_id,
        actor_id=threat_actor.actor_id,
    )
    db.add_all([assignment, asset_link, action, threat_link])
    db.commit()

    assert db.get(IncidentAssignment, assignment.assignment_id) is not None
    assert db.get(IncidentAsset, (incident_id, context["asset"].asset_id)) is not None
    assert db.get(Action, action.action_id) is not None
    assert db.get(IncidentThreatActor, (incident_id, threat_actor.actor_id)) is not None

    response = context["client"].get(
        f"/incidents/{incident_id}", headers=reporter_headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["assignments"] == []
    assert body["assets"] == []
    assert body["actions"] == []
    assert body["threat_actors"] == []
