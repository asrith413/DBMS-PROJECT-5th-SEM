from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.dependencies import AdminOrAnalyst, AdminUser, DatabaseSession
from app.models import Analyst, Incident, IncidentAssignment, IncidentStatus, Role
from app.schemas.resources import AssignmentCreate, AssignmentRead
from app.services.audit_service import create_audit_log
from app.services.permission_service import require_assigned_analyst_or_admin


router = APIRouter(prefix="/assignments", tags=["Assignments"])


def assignment_response(item: IncidentAssignment) -> AssignmentRead:
    return AssignmentRead(
        assignment_id=item.assignment_id,
        incident_id=item.incident_id,
        analyst_id=item.analyst_id,
        assigned_date=item.assigned_date,
        role=item.role,
        analyst_name=item.analyst.user.name,
    )


@router.post("", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def assign_incident(
    payload: AssignmentCreate,
    current_admin: AdminUser,
    db: DatabaseSession,
) -> AssignmentRead:
    incident = db.scalar(
        select(Incident)
        .where(Incident.incident_id == payload.incident_id)
        .with_for_update(of=Incident)
    )
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if incident.status in (IncidentStatus.RESOLVED, IncidentStatus.CLOSED):
        raise HTTPException(status_code=409, detail="Resolved or closed incidents cannot be assigned.")
    analyst = db.scalar(
        select(Analyst)
        .options(joinedload(Analyst.user))
        .where(Analyst.user_id == payload.analyst_id)
        .with_for_update(of=Analyst)
    )
    if analyst is None:
        raise HTTPException(status_code=404, detail="Analyst not found.")
    duplicate = db.scalar(
        select(IncidentAssignment.assignment_id).where(
            IncidentAssignment.incident_id == payload.incident_id,
            IncidentAssignment.analyst_id == payload.analyst_id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Analyst is already assigned to this incident.")

    assignment = IncidentAssignment(
        incident_id=incident.incident_id,
        analyst_id=analyst.user_id,
        role=payload.role.strip(),
    )
    db.add(assignment)
    analyst.workload += 1
    old_status = incident.status
    if incident.status == IncidentStatus.OPEN:
        incident.status = IncidentStatus.ASSIGNED
    try:
        db.flush()
        create_audit_log(
            db,
            incident_id=incident.incident_id,
            performed_by=current_admin.user_id,
            action_type="INCIDENT_ASSIGNED",
            action_data={
                "analyst_id": analyst.user_id,
                "analyst_name": analyst.user.name,
                "role": assignment.role,
                "old_status": old_status.value,
                "new_status": incident.status.value,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Unable to create assignment.") from None
    db.refresh(assignment)
    return assignment_response(assignment)


@router.get("", response_model=list[AssignmentRead])
def list_assignments(
    current_user: AdminOrAnalyst, db: DatabaseSession
) -> list[AssignmentRead]:
    query = select(IncidentAssignment).options(
        joinedload(IncidentAssignment.analyst).joinedload(Analyst.user)
    )
    if current_user.role == Role.ANALYST:
        query = query.where(IncidentAssignment.analyst_id == current_user.user_id)
    query = query.order_by(IncidentAssignment.assigned_date.desc())
    return [assignment_response(item) for item in db.scalars(query).all()]


@router.get("/incident/{incident_id}", response_model=list[AssignmentRead])
def list_incident_assignments(
    incident_id: int, current_user: AdminOrAnalyst, db: DatabaseSession
) -> list[AssignmentRead]:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    query = (
        select(IncidentAssignment)
        .options(joinedload(IncidentAssignment.analyst).joinedload(Analyst.user))
        .where(IncidentAssignment.incident_id == incident_id)
        .order_by(IncidentAssignment.assigned_date)
    )
    return [assignment_response(item) for item in db.scalars(query).all()]
