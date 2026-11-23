from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import AdminOrAnalyst, AdminUser, DatabaseSession
from app.models import Incident, IncidentThreatActor, ThreatActor
from app.schemas.common import Message
from app.schemas.resources import ThreatActorCreate, ThreatActorRead, ThreatActorUpdate
from app.services.audit_service import create_audit_log
from app.services.permission_service import (
    load_incident_for_update,
    require_active_incident,
    require_assigned_analyst_or_admin,
)


router = APIRouter(prefix="/threat-actors", tags=["Threat Actors"])


@router.get("", response_model=list[ThreatActorRead])
def list_threat_actors(_: AdminOrAnalyst, db: DatabaseSession) -> list[ThreatActor]:
    return list(db.scalars(select(ThreatActor).order_by(ThreatActor.alias)).all())


@router.post("", response_model=ThreatActorRead, status_code=status.HTTP_201_CREATED)
def create_threat_actor(
    payload: ThreatActorCreate, _: AdminUser, db: DatabaseSession
) -> ThreatActor:
    actor = ThreatActor(alias=payload.alias.strip(), description=payload.description.strip())
    db.add(actor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Threat actor alias already exists.") from None
    db.refresh(actor)
    return actor


@router.patch("/{actor_id}", response_model=ThreatActorRead)
def update_threat_actor(
    actor_id: int,
    payload: ThreatActorUpdate,
    _: AdminUser,
    db: DatabaseSession,
) -> ThreatActor:
    actor = db.get(ThreatActor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail="Threat actor not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(actor, field, value.strip())
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Threat actor alias already exists.") from None
    db.refresh(actor)
    return actor


@router.post("/{actor_id}/incidents/{incident_id}", response_model=Message, status_code=201)
def associate_threat_actor(
    actor_id: int,
    incident_id: int,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> Message:
    incident = load_incident_for_update(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    actor = db.get(ThreatActor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail="Threat actor not found.")
    if db.get(IncidentThreatActor, (incident_id, actor_id)):
        raise HTTPException(status_code=409, detail="Threat actor is already linked.")
    db.add(IncidentThreatActor(incident_id=incident_id, actor_id=actor_id))
    create_audit_log(
        db,
        incident_id=incident_id,
        performed_by=current_user.user_id,
        action_type="THREAT_ACTOR_ASSOCIATED",
        action_data={"actor_id": actor_id, "alias": actor.alias},
    )
    db.commit()
    return Message(message="Threat actor associated with incident.")


@router.delete("/{actor_id}/incidents/{incident_id}", response_model=Message)
def remove_threat_actor_association(
    actor_id: int,
    incident_id: int,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> Message:
    incident = load_incident_for_update(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    link = db.get(IncidentThreatActor, (incident_id, actor_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Threat actor association not found.")
    db.delete(link)
    create_audit_log(
        db,
        incident_id=incident_id,
        performed_by=current_user.user_id,
        action_type="THREAT_ACTOR_REMOVED",
        action_data={"actor_id": actor_id},
    )
    db.commit()
    return Message(message="Threat actor association removed.")


@router.delete("/{actor_id}", response_model=Message)
def delete_threat_actor(actor_id: int, _: AdminUser, db: DatabaseSession) -> Message:
    actor = db.get(ThreatActor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail="Threat actor not found.")
    if db.scalar(
        select(IncidentThreatActor.incident_id)
        .where(IncidentThreatActor.actor_id == actor_id)
        .limit(1)
    ):
        raise HTTPException(
            status_code=409, detail="Threat actor is linked to incident history."
        )
    db.delete(actor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Threat actor is linked to incident history.") from None
    return Message(message="Threat actor deleted.")
