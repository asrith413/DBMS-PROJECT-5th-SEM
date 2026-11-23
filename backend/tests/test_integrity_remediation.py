import csv
import io
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Action,
    Asset,
    Incident,
    IncidentAsset,
    IncidentThreatActor,
    ThreatActor,
)
from app.services.sla_service import calculate_sla_status


def create_asset(context, headers, *, name, ip_address):
    response = context["client"].post(
        "/assets",
        headers=headers,
        json={
            "name": name,
            "type": "Test endpoint",
            "ip_address": ip_address,
            "department": "Security",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_threat_actor(context, headers, *, alias):
    response = context["client"].post(
        "/threat-actors",
        headers=headers,
        json={
            "alias": alias,
            "description": "Threat actor created for an integrity regression test.",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def assign_incident(context, headers, incident_id):
    response = context["client"].post(
        "/assignments",
        headers=headers,
        json={
            "incident_id": incident_id,
            "analyst_id": context["analyst_user"].user_id,
            "role": "Primary Analyst",
        },
    )
    assert response.status_code == 201, response.text


def security_log_payload(incident_id, description):
    return {
        "incident_id": incident_id,
        "source": "Regression Sensor",
        "event_type": "integrity_check",
        "source_ip": "198.51.100.20",
        "destination_ip": "10.1.1.25",
        "severity": "High",
        "description": description,
        "metadata": {"test": True},
    }


def test_asset_deletion_rejects_historical_links_without_losing_data(
    context, admin_headers
):
    unused = create_asset(
        context,
        admin_headers,
        name="Unused regression asset",
        ip_address="192.0.2.10",
    )
    deleted = context["client"].delete(
        f"/assets/{unused['asset_id']}", headers=admin_headers
    )
    assert deleted.status_code == 200, deleted.text
    assert context["db"].scalar(
        select(Asset.asset_id).where(Asset.asset_id == unused["asset_id"])
    ) is None

    incident_id = context["incident"].incident_id
    asset_id = context["asset"].asset_id
    linked = context["client"].post(
        f"/assets/{asset_id}/incidents/{incident_id}",
        headers=admin_headers,
        json={"impact_type": "Credentials exposed"},
    )
    assert linked.status_code == 201, linked.text

    rejected = context["client"].delete(
        f"/assets/{asset_id}", headers=admin_headers
    )
    assert rejected.status_code == 409, rejected.text
    assert context["db"].scalar(
        select(Asset.asset_id).where(Asset.asset_id == asset_id)
    ) == asset_id
    assert context["db"].get(IncidentAsset, (incident_id, asset_id)) is not None


def test_threat_actor_deletion_rejects_historical_links_without_losing_data(
    context, admin_headers
):
    unused = create_threat_actor(
        context, admin_headers, alias="Unused Regression Actor"
    )
    deleted = context["client"].delete(
        f"/threat-actors/{unused['actor_id']}", headers=admin_headers
    )
    assert deleted.status_code == 200, deleted.text
    assert context["db"].scalar(
        select(ThreatActor.actor_id).where(
            ThreatActor.actor_id == unused["actor_id"]
        )
    ) is None

    linked_actor = create_threat_actor(
        context, admin_headers, alias="Linked Regression Actor"
    )
    incident_id = context["incident"].incident_id
    actor_id = linked_actor["actor_id"]
    linked = context["client"].post(
        f"/threat-actors/{actor_id}/incidents/{incident_id}",
        headers=admin_headers,
    )
    assert linked.status_code == 201, linked.text

    rejected = context["client"].delete(
        f"/threat-actors/{actor_id}", headers=admin_headers
    )
    assert rejected.status_code == 409, rejected.text
    assert context["db"].scalar(
        select(ThreatActor.actor_id).where(ThreatActor.actor_id == actor_id)
    ) == actor_id
    assert (
        context["db"].get(IncidentThreatActor, (incident_id, actor_id))
        is not None
    )


def test_database_restricts_linked_parent_deletion_even_without_router_checks(
    context
):
    db = context["db"]
    incident_id = context["incident"].incident_id
    asset_id = context["asset"].asset_id
    actor = ThreatActor(
        alias="Direct FK Restriction Actor",
        description="Validates database-level restrictive deletion.",
    )
    db.add(actor)
    db.flush()
    db.add_all(
        [
            IncidentAsset(
                incident_id=incident_id,
                asset_id=asset_id,
                impact_type="Restriction test",
            ),
            IncidentThreatActor(incident_id=incident_id, actor_id=actor.actor_id),
        ]
    )
    db.commit()

    db.delete(context["asset"])
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.get(Asset, asset_id) is not None
    assert db.get(IncidentAsset, (incident_id, asset_id)) is not None

    linked_actor = db.get(ThreatActor, actor.actor_id)
    db.delete(linked_actor)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.get(ThreatActor, actor.actor_id) is not None
    assert db.get(IncidentThreatActor, (incident_id, actor.actor_id)) is not None


def test_incident_severity_patch_returns_fresh_severity_and_sla(
    context, admin_headers
):
    response = context["client"].patch(
        f"/incidents/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"severity_id": context["critical"].severity_id},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["severity"] == {
        "severity_id": context["critical"].severity_id,
        "level": "Critical",
        "response_sla_hours": 1,
        "resolution_sla_hours": 8,
    }
    reported_at = datetime.fromisoformat(body["reported_date"])
    if reported_at.tzinfo is None:
        reported_at = reported_at.replace(tzinfo=timezone.utc)
    response_deadline = datetime.fromisoformat(body["sla"]["response_deadline"])
    resolution_deadline = datetime.fromisoformat(
        body["sla"]["resolution_deadline"]
    )
    assert response_deadline - reported_at == timedelta(hours=1)
    assert resolution_deadline - reported_at == timedelta(hours=8)


def test_used_severity_sla_cannot_rewrite_historical_deadlines(
    context, admin_headers
):
    response = context["client"].patch(
        f"/severity/{context['medium'].severity_id}",
        headers=admin_headers,
        json={"resolution_sla_hours": 96},
    )
    assert response.status_code == 409, response.text
    context["db"].refresh(context["medium"])
    assert context["medium"].resolution_sla_hours == 72


@pytest.mark.parametrize(
    ("resource", "required_fields"),
    [
        (
            "incident",
            ("title", "description", "type_id", "severity_id", "status"),
        ),
        ("incident_type", ("name", "description")),
        (
            "severity",
            ("level", "response_sla_hours", "resolution_sla_hours"),
        ),
        ("asset", ("name", "type", "department")),
        ("threat_actor", ("alias", "description")),
        ("user", ("name", "email", "role", "password")),
    ],
    ids=("incident", "incident-type", "severity", "asset", "threat-actor", "user"),
)
def test_patch_rejects_explicit_null_required_fields_and_empty_objects(
    context, admin_headers, resource, required_fields
):
    endpoints = {
        "incident": f"/incidents/{context['incident'].incident_id}",
        "incident_type": f"/incident-types/{context['incident_type'].type_id}",
        "severity": f"/severity/{context['medium'].severity_id}",
        "asset": f"/assets/{context['asset'].asset_id}",
        "user": f"/users/{context['reporter'].user_id}",
    }
    if resource == "threat_actor":
        actor = create_threat_actor(
            context, admin_headers, alias="PATCH Validation Actor"
        )
        endpoint = f"/threat-actors/{actor['actor_id']}"
    else:
        endpoint = endpoints[resource]

    for field in required_fields:
        response = context["client"].patch(
            endpoint, headers=admin_headers, json={field: None}
        )
        assert response.status_code == 422, (
            f"{resource}.{field} accepted null: {response.text}"
        )

    empty = context["client"].patch(
        endpoint, headers=admin_headers, json={}
    )
    assert empty.status_code == 422, f"{resource} accepted an empty PATCH"


def test_nullable_patch_fields_follow_their_schema(context, admin_headers):
    asset_response = context["client"].patch(
        f"/assets/{context['asset'].asset_id}",
        headers=admin_headers,
        json={"ip_address": None},
    )
    assert asset_response.status_code == 200, asset_response.text
    assert asset_response.json()["ip_address"] is None

    user_response = context["client"].patch(
        f"/users/{context['reporter'].user_id}",
        headers=admin_headers,
        json={"department": None},
    )
    assert user_response.status_code == 200, user_response.text
    assert user_response.json()["department"] is None


def test_whitespace_only_incident_title_and_action_payloads_are_rejected(
    context, admin_headers, reporter_headers
):
    valid_incident = {
        "title": "Valid incident title",
        "description": "A sufficiently detailed incident description.",
        "type_id": context["incident_type"].type_id,
        "severity_id": context["medium"].severity_id,
    }
    for field in ("title", "description"):
        payload = {**valid_incident, field: " \t\n "}
        response = context["client"].post(
            "/incidents", headers=reporter_headers, json=payload
        )
        assert response.status_code == 422, (
            f"Incident {field} accepted whitespace: {response.text}"
        )

    title_response = context["client"].patch(
        f"/incidents/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"title": " \t\n "},
    )
    assert title_response.status_code == 422, title_response.text

    action_response = context["client"].post(
        f"/actions/incident/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"description": " \t\n "},
    )
    assert action_response.status_code == 422, action_response.text


def test_resolved_and_closed_incidents_are_immutable_except_for_closing(
    context, admin_headers, analyst_headers
):
    client = context["client"]
    db = context["db"]
    incident_id = context["incident"].incident_id
    asset_id = context["asset"].asset_id
    assign_incident(context, admin_headers, incident_id)

    extra_asset = create_asset(
        context,
        admin_headers,
        name="Post-resolution asset",
        ip_address="192.0.2.20",
    )
    linked_asset = client.post(
        f"/assets/{asset_id}/incidents/{incident_id}",
        headers=analyst_headers,
        json={"impact_type": "Authentication data exposed"},
    )
    assert linked_asset.status_code == 201, linked_asset.text

    linked_actor = create_threat_actor(
        context, admin_headers, alias="Linked Lifecycle Actor"
    )
    extra_actor = create_threat_actor(
        context, admin_headers, alias="Post-resolution Actor"
    )
    actor_link = client.post(
        f"/threat-actors/{linked_actor['actor_id']}/incidents/{incident_id}",
        headers=analyst_headers,
    )
    assert actor_link.status_code == 201, actor_link.text

    action = client.post(
        f"/actions/incident/{incident_id}",
        headers=analyst_headers,
        json={"description": "Captured evidence before resolving the case."},
    )
    assert action.status_code == 201, action.text
    action_id = action.json()["action_id"]

    inserted_log = client.post(
        "/security-logs",
        headers=analyst_headers,
        json=security_log_payload(
            incident_id, "Evidence captured before resolving the case."
        ),
    )
    assert inserted_log.status_code == 201, inserted_log.text

    edited_title = "Verified lifecycle incident"
    title_edit = client.patch(
        f"/incidents/{incident_id}",
        headers=admin_headers,
        json={"title": edited_title},
    )
    assert title_edit.status_code == 200, title_edit.text
    assert title_edit.json()["title"] == edited_title

    for new_status in ("Under Investigation", "In Progress", "Resolved"):
        transition = client.patch(
            f"/incidents/{incident_id}",
            headers=analyst_headers,
            json={"status": new_status},
        )
        assert transition.status_code == 200, transition.text
        assert transition.json()["status"] == new_status

    blocked_action = client.post(
        f"/actions/incident/{incident_id}",
        headers=analyst_headers,
        json={"description": "This action must not be recorded."},
    )
    assert blocked_action.status_code == 409, blocked_action.text

    blocked_assignment = client.post(
        "/assignments",
        headers=admin_headers,
        json={
            "incident_id": incident_id,
            "analyst_id": context["analyst_user"].user_id,
            "role": "Duplicate after resolution",
        },
    )
    assert blocked_assignment.status_code == 409, blocked_assignment.text
    assert "Resolved or closed" in blocked_assignment.json()["detail"]

    blocked_asset_add = client.post(
        f"/assets/{extra_asset['asset_id']}/incidents/{incident_id}",
        headers=analyst_headers,
        json={"impact_type": "Must not be linked"},
    )
    assert blocked_asset_add.status_code == 409, blocked_asset_add.text
    blocked_asset_remove = client.delete(
        f"/assets/{asset_id}/incidents/{incident_id}",
        headers=analyst_headers,
    )
    assert blocked_asset_remove.status_code == 409, blocked_asset_remove.text

    blocked_actor_add = client.post(
        f"/threat-actors/{extra_actor['actor_id']}/incidents/{incident_id}",
        headers=analyst_headers,
    )
    assert blocked_actor_add.status_code == 409, blocked_actor_add.text
    blocked_actor_remove = client.delete(
        f"/threat-actors/{linked_actor['actor_id']}/incidents/{incident_id}",
        headers=analyst_headers,
    )
    assert blocked_actor_remove.status_code == 409, blocked_actor_remove.text

    blocked_log = client.post(
        "/security-logs",
        headers=analyst_headers,
        json=security_log_payload(
            incident_id, "This log must not be inserted after resolution."
        ),
    )
    assert blocked_log.status_code == 409, blocked_log.text

    blocked_title = client.patch(
        f"/incidents/{incident_id}",
        headers=admin_headers,
        json={"title": "This title must not be stored"},
    )
    assert blocked_title.status_code == 409, blocked_title.text
    blocked_reopen = client.patch(
        f"/incidents/{incident_id}",
        headers=analyst_headers,
        json={"status": "In Progress"},
    )
    assert blocked_reopen.status_code == 409, blocked_reopen.text

    assert list(
        db.scalars(
            select(Action.action_id).where(Action.incident_id == incident_id)
        ).all()
    ) == [action_id]
    assert db.get(IncidentAsset, (incident_id, asset_id)) is not None
    assert (
        db.get(IncidentAsset, (incident_id, extra_asset["asset_id"])) is None
    )
    assert (
        db.get(
            IncidentThreatActor,
            (incident_id, linked_actor["actor_id"]),
        )
        is not None
    )
    assert (
        db.get(
            IncidentThreatActor,
            (incident_id, extra_actor["actor_id"]),
        )
        is None
    )
    assert db.scalar(
        select(Incident.title).where(Incident.incident_id == incident_id)
    ) == edited_title
    assert context["collection"].count_documents({"incident_id": incident_id}) == 1

    closed = client.patch(
        f"/incidents/{incident_id}",
        headers=analyst_headers,
        json={"status": "Closed"},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "Closed"

    after_closed = client.patch(
        f"/incidents/{incident_id}",
        headers=analyst_headers,
        json={"status": "Resolved"},
    )
    assert after_closed.status_code == 409, after_closed.text


def test_sla_states_for_timely_late_and_active_incidents(context):
    incident = context["incident"]
    now = datetime.now(timezone.utc)

    incident.reported_date = now - timedelta(hours=2)
    incident.resolved_date = now - timedelta(hours=1)
    timely = calculate_sla_status(incident, now=now)
    assert timely["state"] == "Completed"
    assert timely["remaining_resolution_hours"] == 0.0
    assert timely["sla_breached"] is False

    incident.reported_date = now - timedelta(hours=80)
    incident.resolved_date = now - timedelta(hours=1)
    late = calculate_sla_status(incident, now=now)
    assert late["state"] == "Breached"
    assert late["sla_breached"] is True

    incident.reported_date = now - timedelta(hours=1)
    incident.resolved_date = None
    active = calculate_sla_status(incident, now=now)
    assert active["state"] == "Active"
    assert active["remaining_resolution_hours"] >= 0


def test_csv_export_neutralizes_spreadsheet_formula_text(context, admin_headers):
    incident_id = context["incident"].incident_id
    for formula in ("=1+1", "+1+1", "-1+1", "@SUM(A1:A2)"):
        context["incident"].title = formula
        context["db"].commit()

        response = context["client"].get(
            "/reports/incidents.csv", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        rows = {
            int(row["incident_id"]): row
            for row in csv.DictReader(io.StringIO(response.text))
        }
        assert rows[incident_id]["title"] == f"'{formula}"
