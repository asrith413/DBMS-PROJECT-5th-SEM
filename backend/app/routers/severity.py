from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.models import Incident, Severity
from app.schemas.common import Message
from app.schemas.resources import SeverityCreate, SeverityRead, SeverityUpdate


router = APIRouter(prefix="/severity", tags=["Severity"])


def validate_sla(response_hours: int, resolution_hours: int) -> None:
    if resolution_hours < response_hours:
        raise HTTPException(
            status_code=422,
            detail="Resolution SLA cannot be shorter than response SLA.",
        )


@router.get("", response_model=list[SeverityRead])
def list_severity(_: CurrentUser, db: DatabaseSession) -> list[Severity]:
    return list(db.scalars(select(Severity).order_by(Severity.resolution_sla_hours)).all())


@router.post("", response_model=SeverityRead, status_code=status.HTTP_201_CREATED)
def create_severity(
    payload: SeverityCreate, _: AdminUser, db: DatabaseSession
) -> Severity:
    item = Severity(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Severity level already exists.") from None
    db.refresh(item)
    return item


@router.patch("/{severity_id}", response_model=SeverityRead)
def update_severity(
    severity_id: int,
    payload: SeverityUpdate,
    _: AdminUser,
    db: DatabaseSession,
) -> Severity:
    item = db.scalar(
        select(Severity)
        .where(Severity.severity_id == severity_id)
        .with_for_update(of=Severity)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Severity level not found.")
    values = payload.model_dump(exclude_unset=True)
    if {"response_sla_hours", "resolution_sla_hours"} & values.keys():
        in_use = db.scalar(
            select(Incident.incident_id)
            .where(Incident.severity_id == severity_id)
            .limit(1)
        )
        if in_use:
            raise HTTPException(
                status_code=409,
                detail="SLA hours cannot change after a severity is used by an incident.",
            )
    response = values.get("response_sla_hours", item.response_sla_hours)
    resolution = values.get("resolution_sla_hours", item.resolution_sla_hours)
    validate_sla(response, resolution)
    for field, value in values.items():
        setattr(item, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Severity update conflicts with existing data.") from None
    db.refresh(item)
    return item


@router.delete("/{severity_id}", response_model=Message)
def delete_severity(severity_id: int, _: AdminUser, db: DatabaseSession) -> Message:
    item = db.get(Severity, severity_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Severity level not found.")
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Severity level is in use.") from None
    return Message(message="Severity level deleted.")
