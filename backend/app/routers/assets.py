from fastapi import APIRouter, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError

from app.dependencies import AdminOrAnalyst, CurrentUser, DatabaseSession
from app.models import Asset, Incident, IncidentAsset, IncidentAssignment, Role
from app.schemas.common import Message
from app.schemas.resources import (
    AssetCreate,
    AssetIncidentRead,
    AssetLinkCreate,
    AssetRead,
    AssetUpdate,
    IncidentAssetRead,
)
from app.services.audit_service import create_audit_log
from app.services.permission_service import (
    load_incident_for_update,
    require_active_incident,
    require_asset_access,
    require_assigned_analyst_or_admin,
)


router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get("", response_model=list[AssetRead])
def list_assets(current_user: CurrentUser, db: DatabaseSession) -> list[Asset]:
    if current_user.role == Role.REPORTER:
        raise HTTPException(status_code=403, detail="Asset inventory requires analyst access.")
    query = select(Asset)
    if current_user.role == Role.ANALYST:
        query = (
            query.join(IncidentAsset)
            .join(
                IncidentAssignment,
                IncidentAssignment.incident_id == IncidentAsset.incident_id,
            )
            .where(IncidentAssignment.analyst_id == current_user.user_id)
            .distinct()
        )
    return list(db.scalars(query.order_by(Asset.name)).all())


@router.post("", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreate, _: AdminOrAnalyst, db: DatabaseSession
) -> Asset:
    asset = Asset(**payload.model_dump())
    db.add(asset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An asset with this IP address already exists.") from None
    db.refresh(asset)
    return asset


@router.get("/{asset_id}", response_model=AssetRead)
def get_asset(asset_id: int, current_user: CurrentUser, db: DatabaseSession) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    require_asset_access(db, asset_id, current_user)
    return asset


@router.get("/{asset_id}/incidents", response_model=list[AssetIncidentRead])
def list_asset_incidents(
    asset_id: int, current_user: AdminOrAnalyst, db: DatabaseSession
) -> list[AssetIncidentRead]:
    if db.get(Asset, asset_id) is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    query = (
        select(Incident, IncidentAsset.impact_type)
        .join(IncidentAsset, IncidentAsset.incident_id == Incident.incident_id)
        .where(IncidentAsset.asset_id == asset_id)
    )
    require_asset_access(db, asset_id, current_user)
    if current_user.role == Role.ANALYST:
        query = query.where(
            exists().where(
                IncidentAssignment.incident_id == Incident.incident_id,
                IncidentAssignment.analyst_id == current_user.user_id,
            )
        )
    rows = db.execute(query.order_by(Incident.reported_date.desc())).all()
    return [
        AssetIncidentRead(
            incident_id=incident.incident_id,
            title=incident.title,
            status=incident.status.value,
            impact_type=impact_type,
        )
        for incident, impact_type in rows
    ]


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    require_asset_access(db, asset_id, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An asset with this IP address already exists.") from None
    db.refresh(asset)
    return asset


@router.post(
    "/{asset_id}/incidents/{incident_id}",
    response_model=IncidentAssetRead,
    status_code=status.HTTP_201_CREATED,
)
def associate_asset(
    asset_id: int,
    incident_id: int,
    payload: AssetLinkCreate,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> IncidentAsset:
    incident = load_incident_for_update(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if db.get(IncidentAsset, (incident_id, asset_id)):
        raise HTTPException(status_code=409, detail="Asset is already associated with this incident.")
    link = IncidentAsset(
        incident_id=incident_id, asset_id=asset_id, impact_type=payload.impact_type.strip()
    )
    db.add(link)
    create_audit_log(
        db,
        incident_id=incident_id,
        performed_by=current_user.user_id,
        action_type="ASSET_ASSOCIATED",
        action_data={"asset_id": asset_id, "asset_name": asset.name, "impact_type": link.impact_type},
    )
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{asset_id}/incidents/{incident_id}", response_model=Message)
def remove_asset_association(
    asset_id: int,
    incident_id: int,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
) -> Message:
    incident = load_incident_for_update(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    link = db.get(IncidentAsset, (incident_id, asset_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Asset association not found.")
    impact_type = link.impact_type
    db.delete(link)
    create_audit_log(
        db,
        incident_id=incident_id,
        performed_by=current_user.user_id,
        action_type="ASSET_REMOVED",
        action_data={"asset_id": asset_id, "impact_type": impact_type},
    )
    db.commit()
    return Message(message="Asset association removed.")


@router.delete("/{asset_id}", response_model=Message)
def delete_asset(
    asset_id: int, current_user: AdminOrAnalyst, db: DatabaseSession
) -> Message:
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can delete assets.")
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if db.scalar(
        select(IncidentAsset.incident_id)
        .where(IncidentAsset.asset_id == asset_id)
        .limit(1)
    ):
        raise HTTPException(
            status_code=409, detail="Asset is linked to incident history."
        )
    db.delete(asset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Asset is linked to incident history.") from None
    return Message(message="Asset deleted.")
