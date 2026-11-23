from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.dependencies import CurrentUser, DatabaseSession
from app.models import (
    Action,
    Analyst,
    AuditLog,
    Incident,
    IncidentAsset,
    IncidentAssignment,
    IncidentStatus,
    IncidentThreatActor,
    IncidentType,
    Role,
    Severity,
)
from app.schemas.common import Message
from app.schemas.incidents import (
    IncidentCreate,
    IncidentDetail,
    IncidentRead,
    IncidentUpdate,
    SeveritySuggestionRequest,
    SeveritySuggestionResponse,
)
from app.services.audit_service import create_audit_log
from app.services.incident_service import change_incident_status, serialize_incident
from app.services.permission_service import require_incident_access
from app.ml.classifier import predict_severity


router = APIRouter(prefix="/incidents", tags=["Incidents"])


def incident_query():
    return select(Incident).options(
        joinedload(Incident.reporter),
        joinedload(Incident.incident_type),
        joinedload(Incident.severity),
        selectinload(Incident.assignments)
        .joinedload(IncidentAssignment.analyst)
        .joinedload(Analyst.user),
        selectinload(Incident.asset_links).joinedload(IncidentAsset.asset),
        selectinload(Incident.actions).joinedload(Action.performer),
        selectinload(Incident.threat_actor_links).joinedload(
            IncidentThreatActor.threat_actor
        ),
    ).execution_options(populate_existing=True)


def load_incident(
    db: DatabaseSession, incident_id: int, *, for_update: bool = False
) -> Incident:
    query = incident_query().where(Incident.incident_id == incident_id)
    if for_update:
        query = query.with_for_update(of=Incident)
    incident = db.scalar(query)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return incident


@router.post("", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: IncidentCreate, current_user: CurrentUser, db: DatabaseSession
) -> IncidentRead:
    if current_user.role not in (Role.ADMIN, Role.REPORTER):
        raise HTTPException(
            status_code=403, detail="Only reporters and administrators can report incidents."
        )
    if db.get(IncidentType, payload.type_id) is None:
        raise HTTPException(status_code=422, detail="Incident type does not exist.")
    severity = db.scalar(
        select(Severity)
        .where(Severity.severity_id == payload.severity_id)
        .with_for_update(of=Severity)
    )
    if severity is None:
        raise HTTPException(status_code=422, detail="Severity level does not exist.")
    incident = Incident(
        title=payload.title.strip(),
        description=payload.description.strip(),
        type_id=payload.type_id,
        severity_id=payload.severity_id,
        reported_by=current_user.user_id,
        status=IncidentStatus.OPEN,
    )
    db.add(incident)
    db.flush()
    create_audit_log(
        db,
        incident_id=incident.incident_id,
        performed_by=current_user.user_id,
        action_type="INCIDENT_CREATED",
        action_data={
            "title": incident.title,
            "type_id": incident.type_id,
            "severity_id": incident.severity_id,
            "status": incident.status.value,
        },
    )
    db.commit()
    return serialize_incident(load_incident(db, incident.incident_id))


@router.get("", response_model=list[IncidentRead])
def list_incidents(
    current_user: CurrentUser,
    db: DatabaseSession,
    incident_status: IncidentStatus | None = Query(default=None, alias="status"),
    severity_id: int | None = Query(default=None, gt=0),
    type_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[IncidentRead]:
    query = incident_query()
    if current_user.role == Role.REPORTER:
        query = query.where(Incident.reported_by == current_user.user_id)
    elif current_user.role == Role.ANALYST:
        query = query.where(
            exists().where(
                IncidentAssignment.incident_id == Incident.incident_id,
                IncidentAssignment.analyst_id == current_user.user_id,
            )
        )
    if incident_status is not None:
        query = query.where(Incident.status == incident_status)
    if severity_id is not None:
        query = query.where(Incident.severity_id == severity_id)
    if type_id is not None:
        query = query.where(Incident.type_id == type_id)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(
                Incident.title.ilike(pattern, escape="\\"),
                Incident.description.ilike(pattern, escape="\\"),
            )
        )
    query = query.order_by(Incident.reported_date.desc()).offset(offset).limit(limit)
    return [serialize_incident(item) for item in db.scalars(query).all()]


@router.post("/suggest-severity", response_model=SeveritySuggestionResponse)
def suggest_severity(
    payload: SeveritySuggestionRequest, _: CurrentUser
) -> SeveritySuggestionResponse:
    prediction, confidence = predict_severity(
        payload.title, payload.description, payload.incident_type
    )
    return SeveritySuggestionResponse(
        suggested_severity=prediction,
        confidence=confidence,
        disclaimer=(
            "Academic prototype trained on small sample data. The reporter must review "
            "and manually select the final severity."
        ),
    )


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(
    incident_id: int, current_user: CurrentUser, db: DatabaseSession
) -> IncidentDetail:
    incident = load_incident(db, incident_id)
    require_incident_access(db, incident, current_user)
    return serialize_incident(
        incident,
        include_details=True,
        include_sensitive_details=current_user.role != Role.REPORTER,
    )


@router.patch("/{incident_id}", response_model=IncidentRead)
def update_incident(
    incident_id: int,
    payload: IncidentUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> IncidentRead:
    incident = load_incident(db, incident_id, for_update=True)
    require_incident_access(db, incident, current_user)
    fields = payload.model_fields_set
    if current_user.role == Role.REPORTER:
        raise HTTPException(status_code=403, detail="Reporters cannot modify submitted incidents.")
    if current_user.role == Role.ANALYST and fields - {"status"}:
        raise HTTPException(status_code=403, detail="Analysts may update incident status only.")
    if incident.status == IncidentStatus.CLOSED:
        raise HTTPException(status_code=409, detail="Closed incidents cannot be modified.")
    if incident.status == IncidentStatus.RESOLVED and (
        fields != {"status"} or payload.status != IncidentStatus.CLOSED
    ):
        raise HTTPException(
            status_code=409,
            detail="Resolved incidents may only transition to Closed.",
        )

    if payload.type_id is not None and db.get(IncidentType, payload.type_id) is None:
        raise HTTPException(status_code=422, detail="Incident type does not exist.")
    if payload.severity_id is not None:
        new_severity = db.scalar(
            select(Severity)
            .where(Severity.severity_id == payload.severity_id)
            .with_for_update(of=Severity)
        )
        if new_severity is None:
            raise HTTPException(status_code=422, detail="Severity level does not exist.")

    changes: dict[str, object] = {}
    for field in ("title", "description", "type_id"):
        value = getattr(payload, field)
        if value is not None and value != getattr(incident, field):
            changes[field] = {"old": getattr(incident, field), "new": value}
            setattr(incident, field, value)

    if payload.severity_id is not None and payload.severity_id != incident.severity_id:
        old_severity = incident.severity_id
        incident.severity_id = payload.severity_id
    else:
        old_severity = None

    # Acquire analyst/workload locks before the global audit-chain lock.
    if payload.status is not None:
        change_incident_status(db, incident, payload.status, current_user.user_id)

    if old_severity is not None:
        create_audit_log(
            db,
            incident_id=incident.incident_id,
            performed_by=current_user.user_id,
            action_type="SEVERITY_CHANGED",
            action_data={"old_severity_id": old_severity, "new_severity_id": payload.severity_id},
        )
    if changes:
        create_audit_log(
            db,
            incident_id=incident.incident_id,
            performed_by=current_user.user_id,
            action_type="INCIDENT_UPDATED",
            action_data=changes,
        )
    db.commit()
    return serialize_incident(load_incident(db, incident_id))


@router.delete("/{incident_id}", response_model=Message)
def delete_incident(
    incident_id: int, current_user: CurrentUser, db: DatabaseSession
) -> Message:
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can delete incidents.")
    incident = load_incident(db, incident_id)
    has_audit_history = db.scalar(
        select(AuditLog.log_id).where(AuditLog.incident_id == incident_id).limit(1)
    )
    if has_audit_history:
        raise HTTPException(
            status_code=409,
            detail="Incident has audit history and cannot be safely deleted.",
        )
    db.delete(incident)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Incident has related history.") from None
    return Message(message="Incident deleted.")
