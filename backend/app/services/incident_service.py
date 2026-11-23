from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Analyst, Incident, IncidentStatus
from app.schemas.incidents import IncidentDetail, IncidentRead
from app.services.audit_service import create_audit_log
from app.services.sla_service import calculate_sla_status


VALID_STATUS_TRANSITIONS: dict[IncidentStatus, IncidentStatus] = {
    IncidentStatus.OPEN: IncidentStatus.ASSIGNED,
    IncidentStatus.ASSIGNED: IncidentStatus.UNDER_INVESTIGATION,
    IncidentStatus.UNDER_INVESTIGATION: IncidentStatus.IN_PROGRESS,
    IncidentStatus.IN_PROGRESS: IncidentStatus.RESOLVED,
    IncidentStatus.RESOLVED: IncidentStatus.CLOSED,
}


def change_incident_status(
    db: Session,
    incident: Incident,
    new_status: IncidentStatus,
    performed_by: int,
) -> None:
    old_status = incident.status
    if old_status == new_status:
        return
    expected = VALID_STATUS_TRANSITIONS.get(old_status)
    if expected != new_status:
        expected_text = expected.value if expected else "no further status"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid status transition. From {old_status.value}, expected {expected_text}.",
        )
    if new_status == IncidentStatus.ASSIGNED and not incident.assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create an analyst assignment to move an Open incident to Assigned.",
        )

    incident.status = new_status
    if new_status == IncidentStatus.RESOLVED:
        incident.resolved_date = datetime.now(timezone.utc)
        analyst_ids = sorted({item.analyst_id for item in incident.assignments})
        if analyst_ids:
            analysts = db.scalars(
                select(Analyst)
                .where(Analyst.user_id.in_(analyst_ids))
                .order_by(Analyst.user_id)
                .with_for_update()
            ).all()
            for analyst in analysts:
                analyst.workload = max(0, analyst.workload - 1)

    create_audit_log(
        db,
        incident_id=incident.incident_id,
        performed_by=performed_by,
        action_type=("INCIDENT_RESOLVED" if new_status == IncidentStatus.RESOLVED else "STATUS_CHANGED"),
        action_data={"old_status": old_status.value, "new_status": new_status.value},
    )


def serialize_incident(
    incident: Incident,
    *,
    include_details: bool = False,
    include_sensitive_details: bool = True,
) -> IncidentRead | IncidentDetail:
    base_data = {
        "incident_id": incident.incident_id,
        "title": incident.title,
        "description": incident.description,
        "status": incident.status,
        "reported_date": incident.reported_date,
        "resolved_date": incident.resolved_date,
        "incident_type": incident.incident_type,
        "severity": incident.severity,
        "reporter": incident.reporter,
        "sla": calculate_sla_status(incident),
    }
    if not include_details:
        return IncidentRead.model_validate(base_data)

    if not include_sensitive_details:
        base_data.update(
            {"assignments": [], "assets": [], "actions": [], "threat_actors": []}
        )
        return IncidentDetail.model_validate(base_data)

    base_data.update(
        {
            "assignments": [
                {
                    "assignment_id": assignment.assignment_id,
                    "incident_id": assignment.incident_id,
                    "analyst_id": assignment.analyst_id,
                    "assigned_date": assignment.assigned_date,
                    "role": assignment.role,
                    "analyst_name": assignment.analyst.user.name,
                }
                for assignment in sorted(
                    incident.assignments, key=lambda item: item.assigned_date
                )
            ],
            "assets": incident.asset_links,
            "actions": sorted(incident.actions, key=lambda item: item.action_date),
            "threat_actors": incident.threat_actor_links,
        }
    )
    return IncidentDetail.model_validate(base_data)
