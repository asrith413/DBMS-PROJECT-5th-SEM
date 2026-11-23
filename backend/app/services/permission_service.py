from fastapi import HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import (
    Incident,
    IncidentAsset,
    IncidentAssignment,
    IncidentStatus,
    Role,
    User,
)


def analyst_is_assigned(db: Session, incident_id: int, analyst_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    IncidentAssignment.incident_id == incident_id,
                    IncidentAssignment.analyst_id == analyst_id,
                )
            )
        )
    )


def can_view_incident(db: Session, incident: Incident, user: User) -> bool:
    if user.role == Role.ADMIN:
        return True
    if user.role == Role.REPORTER:
        return incident.reported_by == user.user_id
    return analyst_is_assigned(db, incident.incident_id, user.user_id)


def require_incident_access(db: Session, incident: Incident, user: User) -> None:
    if not can_view_incident(db, incident, user):
        # Do not reveal whether an inaccessible incident exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")


def require_assigned_analyst_or_admin(
    db: Session, incident: Incident, user: User
) -> None:
    if user.role == Role.ADMIN:
        return
    if user.role != Role.ANALYST or not analyst_is_assigned(
        db, incident.incident_id, user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        )


def require_active_incident(incident: Incident) -> None:
    if incident.status in (IncidentStatus.RESOLVED, IncidentStatus.CLOSED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resolved or closed incidents cannot be modified.",
        )


def load_incident_for_update(db: Session, incident_id: int) -> Incident | None:
    return db.scalar(
        select(Incident)
        .where(Incident.incident_id == incident_id)
        .with_for_update(of=Incident)
    )


def analyst_can_access_asset(db: Session, asset_id: int, analyst_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    IncidentAsset.asset_id == asset_id,
                    IncidentAssignment.incident_id == IncidentAsset.incident_id,
                    IncidentAssignment.analyst_id == analyst_id,
                )
            )
        )
    )


def require_asset_access(db: Session, asset_id: int, user: User) -> None:
    if user.role == Role.ADMIN:
        return
    if user.role != Role.ANALYST or not analyst_can_access_asset(
        db, asset_id, user.user_id
    ):
        raise HTTPException(status_code=404, detail="Asset not found.")
