from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.dependencies import AdminOrAnalyst, CurrentUser, DatabaseSession
from app.models import Action, Incident
from app.schemas.resources import ActionCreate, ActionRead
from app.services.audit_service import create_audit_log
from app.services.permission_service import (
    load_incident_for_update,
    require_active_incident,
    require_assigned_analyst_or_admin,
)


router = APIRouter(prefix="/actions", tags=["Actions"])


@router.post("/incident/{incident_id}", response_model=ActionRead, status_code=status.HTTP_201_CREATED)
def create_action(
    incident_id: int,
    payload: ActionCreate,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> Action:
    incident = load_incident_for_update(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    action = Action(
        incident_id=incident_id,
        performed_by=current_user.user_id,
        description=payload.description.strip(),
    )
    db.add(action)
    db.flush()
    create_audit_log(
        db,
        incident_id=incident_id,
        performed_by=current_user.user_id,
        action_type="ACTION_ADDED",
        action_data={"action_id": action.action_id, "description": action.description},
    )
    db.commit()
    db.refresh(action)
    return action


@router.get("/incident/{incident_id}", response_model=list[ActionRead])
def list_actions(
    incident_id: int, current_user: AdminOrAnalyst, db: DatabaseSession
) -> list[Action]:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    query = (
        select(Action)
        .options(joinedload(Action.performer))
        .where(Action.incident_id == incident_id)
        .order_by(Action.action_date)
    )
    return list(db.scalars(query).all())
