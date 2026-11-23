from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.models import AuditLog, Incident, Role
from app.schemas.resources import AuditLogRead, AuditVerification
from app.services.audit_service import verify_audit_chain
from app.services.permission_service import require_incident_access


router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    current_user: CurrentUser,
    db: DatabaseSession,
    incident_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[AuditLog]:
    query = select(AuditLog).options(joinedload(AuditLog.performer))
    if incident_id is not None:
        incident = db.get(Incident, incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found.")
        require_incident_access(db, incident, current_user)
        if current_user.role == Role.REPORTER:
            raise HTTPException(status_code=403, detail="Audit records require analyst access.")
        query = query.where(AuditLog.incident_id == incident_id)
    elif current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can list all audit records.")
    return list(db.scalars(query.order_by(AuditLog.log_id.desc()).limit(limit)).all())


@router.get("/verify", response_model=AuditVerification)
def verify_integrity(_: AdminUser, db: DatabaseSession) -> dict[str, object]:
    return verify_audit_chain(db)
