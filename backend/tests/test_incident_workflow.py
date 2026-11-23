from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Action, AuditLog, IncidentAsset, IncidentAssignment, IncidentStatus
from app.services.sla_service import calculate_sla_status


def create_incident(context, reporter_headers):
    response = context["client"].post(
        "/incidents",
        headers=reporter_headers,
        json={
            "title": "Suspicious payroll sign-in",
            "description": "An employee submitted credentials to a suspicious payroll page.",
            "type_id": context["incident_type"].type_id,
            "severity_id": context["medium"].severity_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def assign(context, admin_headers, incident_id):
    response = context["client"].post(
        "/assignments",
        headers=admin_headers,
        json={
            "incident_id": incident_id,
            "analyst_id": context["analyst_user"].user_id,
            "role": "Primary Analyst",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_incident_creation_creates_audit_record(context, reporter_headers):
    body = create_incident(context, reporter_headers)
    assert body["status"] == "Open"
    record = context["db"].scalar(
        select(AuditLog).where(
            AuditLog.incident_id == body["incident_id"],
            AuditLog.action_type == "INCIDENT_CREATED",
        )
    )
    assert record is not None


def test_incident_assignment_updates_status_workload_and_history(
    context, admin_headers
):
    assignment = assign(context, admin_headers, context["incident"].incident_id)
    context["db"].refresh(context["incident"])
    context["db"].refresh(context["analyst"])
    assert assignment["analyst_id"] == context["analyst_user"].user_id
    assert context["incident"].status == IncidentStatus.ASSIGNED
    assert context["analyst"].workload == 1
    assert context["db"].scalar(select(IncidentAssignment).where(IncidentAssignment.assignment_id == assignment["assignment_id"]))


def test_open_incident_cannot_be_marked_assigned_without_assignment(
    context, admin_headers
):
    response = context["client"].patch(
        f"/incidents/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"status": "Assigned"},
    )
    assert response.status_code == 409
    assert "Create an analyst assignment" in response.json()["detail"]


def test_assigned_analyst_can_make_only_valid_status_transition(
    context, admin_headers, analyst_headers
):
    assign(context, admin_headers, context["incident"].incident_id)
    valid = context["client"].patch(
        f"/incidents/{context['incident'].incident_id}",
        headers=analyst_headers,
        json={"status": "Under Investigation"},
    )
    assert valid.status_code == 200, valid.text
    invalid = context["client"].patch(
        f"/incidents/{context['incident'].incident_id}",
        headers=analyst_headers,
        json={"status": "Resolved"},
    )
    assert invalid.status_code == 409


def test_asset_association_uses_junction_table(context, admin_headers):
    response = context["client"].post(
        f"/assets/{context['asset'].asset_id}/incidents/{context['incident'].incident_id}",
        headers=admin_headers,
        json={"impact_type": "Credentials targeted"},
    )
    assert response.status_code == 201, response.text
    link = context["db"].get(
        IncidentAsset, (context["incident"].incident_id, context["asset"].asset_id)
    )
    assert link.impact_type == "Credentials targeted"
    affected = context["client"].get(
        f"/assets/{context['asset'].asset_id}/incidents", headers=admin_headers
    )
    assert affected.status_code == 200, affected.text
    assert affected.json()[0]["incident_id"] == context["incident"].incident_id


def test_assigned_analyst_adds_investigation_action(
    context, admin_headers, analyst_headers
):
    assign(context, admin_headers, context["incident"].incident_id)
    response = context["client"].post(
        f"/actions/incident/{context['incident'].incident_id}",
        headers=analyst_headers,
        json={"description": "Blocked the malicious sender domain."},
    )
    assert response.status_code == 201, response.text
    assert context["db"].scalar(
        select(Action).where(Action.action_id == response.json()["action_id"])
    )


def test_sla_calculation_uses_severity_table_values(context):
    incident = context["incident"]
    incident.severity = context["critical"]
    incident.reported_date = datetime.now(timezone.utc) - timedelta(hours=2)
    incident.assignments = []
    result = calculate_sla_status(incident)
    assert result["response_breached"] is True
    assert result["resolution_breached"] is False
    assert 5.9 < result["remaining_resolution_hours"] < 6.1


def test_report_dashboard_and_csv_export(context, admin_headers):
    dashboard = context["client"].get("/reports/dashboard", headers=admin_headers)
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["total_incidents"] == 1
    assert dashboard.json()["incidents_by_status"] == [{"label": "Open", "count": 1}]
    exported = context["client"].get("/reports/incidents.csv", headers=admin_headers)
    assert exported.status_code == 200, exported.text
    assert "Baseline phishing report" in exported.text
    assert "Phishing" in exported.text
    assert "Test Reporter" in exported.text
