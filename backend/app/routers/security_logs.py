from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.collection import Collection

from app.database.mongodb import get_security_logs_collection
from app.dependencies import AdminOrAnalyst, CurrentUser, DatabaseSession
from app.models import Incident, Role
from app.schemas.security_logs import SecurityLogCreate, SecurityLogRead
from app.services.log_service import insert_security_log, search_security_logs
from app.services.permission_service import (
    load_incident_for_update,
    require_active_incident,
    require_assigned_analyst_or_admin,
    require_incident_access,
)


router = APIRouter(prefix="/security-logs", tags=["Security Logs"])
MongoCollection = Annotated[Collection[dict[str, Any]], Depends(get_security_logs_collection)]


@router.post("", response_model=SecurityLogRead, status_code=status.HTTP_201_CREATED)
def create_security_log(
    payload: SecurityLogCreate,
    current_user: AdminOrAnalyst,
    db: DatabaseSession,
    collection: MongoCollection,
) -> dict[str, Any]:
    incident = load_incident_for_update(db, payload.incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    require_assigned_analyst_or_admin(db, incident, current_user)
    require_active_incident(incident)
    return insert_security_log(collection, payload)


@router.get("", response_model=list[SecurityLogRead])
def list_security_logs(
    current_user: CurrentUser,
    db: DatabaseSession,
    collection: MongoCollection,
    incident_id: int | None = Query(default=None, gt=0),
    source: str | None = Query(default=None, max_length=100),
    severity: str | None = Query(default=None, max_length=20),
    event_type: str | None = Query(default=None, max_length=100),
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[dict[str, Any]]:
    if current_user.role != Role.ADMIN:
        if current_user.role != Role.ANALYST:
            raise HTTPException(status_code=403, detail="Security logs require analyst access.")
        if incident_id is None:
            raise HTTPException(
                status_code=422,
                detail="Analysts must filter security logs by an assigned incident_id.",
            )
    if incident_id is not None:
        incident = db.get(Incident, incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found.")
        require_incident_access(db, incident, current_user)
    return search_security_logs(
        collection,
        incident_id=incident_id,
        source=source,
        severity=severity,
        event_type=event_type,
        search=search,
        limit=limit,
    )


@router.get("/incident/{incident_id}", response_model=list[SecurityLogRead])
def incident_security_logs(
    incident_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
    collection: MongoCollection,
) -> list[dict[str, Any]]:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current_user.role == Role.REPORTER:
        raise HTTPException(status_code=403, detail="Security logs require analyst access.")
    require_incident_access(db, incident, current_user)
    return search_security_logs(collection, incident_id=incident_id)
