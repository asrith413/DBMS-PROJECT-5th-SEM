from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.models import IncidentType
from app.schemas.common import Message
from app.schemas.resources import IncidentTypeCreate, IncidentTypeRead, IncidentTypeUpdate


router = APIRouter(prefix="/incident-types", tags=["Incident Types"])


@router.get("", response_model=list[IncidentTypeRead])
def list_incident_types(_: CurrentUser, db: DatabaseSession) -> list[IncidentType]:
    return list(db.scalars(select(IncidentType).order_by(IncidentType.name)).all())


@router.post("", response_model=IncidentTypeRead, status_code=status.HTTP_201_CREATED)
def create_incident_type(
    payload: IncidentTypeCreate, _: AdminUser, db: DatabaseSession
) -> IncidentType:
    item = IncidentType(name=payload.name.strip(), description=payload.description.strip())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Incident type name already exists.") from None
    db.refresh(item)
    return item


@router.patch("/{type_id}", response_model=IncidentTypeRead)
def update_incident_type(
    type_id: int,
    payload: IncidentTypeUpdate,
    _: AdminUser,
    db: DatabaseSession,
) -> IncidentType:
    item = db.get(IncidentType, type_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Incident type not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value.strip())
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Incident type name already exists.") from None
    db.refresh(item)
    return item


@router.delete("/{type_id}", response_model=Message)
def delete_incident_type(type_id: int, _: AdminUser, db: DatabaseSession) -> Message:
    item = db.get(IncidentType, type_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Incident type not found.")
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Incident type is in use.") from None
    return Message(message="Incident type deleted.")
