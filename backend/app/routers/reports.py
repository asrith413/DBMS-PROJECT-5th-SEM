import csv
import io
from enum import Enum

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import extract, func, select
from sqlalchemy.orm import joinedload, selectinload

from app.dependencies import AdminUser, DatabaseSession
from app.models import Analyst, Incident, IncidentStatus, IncidentType, Severity, User
from app.schemas.reports import CountByLabel, DashboardReport
from app.services.sla_service import calculate_sla_status


router = APIRouter(prefix="/reports", tags=["Reports"])


def spreadsheet_safe(value: object) -> object:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def label_counts(db: DatabaseSession, statement) -> list[CountByLabel]:
    return [
        CountByLabel(
            label=str(label.value if isinstance(label, Enum) else label), count=count
        )
        for label, count in db.execute(statement).all()
    ]


@router.get("/dashboard", response_model=DashboardReport)
def dashboard_report(_: AdminUser, db: DatabaseSession) -> DashboardReport:
    total = db.scalar(select(func.count()).select_from(Incident)) or 0
    open_count = db.scalar(
        select(func.count()).select_from(Incident).where(
            Incident.status.notin_([IncidentStatus.RESOLVED, IncidentStatus.CLOSED])
        )
    ) or 0
    resolved_count = db.scalar(
        select(func.count()).select_from(Incident).where(
            Incident.status.in_([IncidentStatus.RESOLVED, IncidentStatus.CLOSED])
        )
    ) or 0
    critical_count = db.scalar(
        select(func.count()).select_from(Incident).join(Severity).where(Severity.level == "Critical")
    ) or 0
    analyst_count = db.scalar(select(func.count()).select_from(Analyst)) or 0

    incident_rows = db.scalars(
        select(Incident).options(
            joinedload(Incident.severity), selectinload(Incident.assignments)
        )
    ).all()
    breach_count = sum(bool(calculate_sla_status(item)["sla_breached"]) for item in incident_rows)

    by_severity = label_counts(
        db,
        select(Severity.level, func.count(Incident.incident_id))
        .outerjoin(Incident)
        .group_by(Severity.severity_id, Severity.level)
        .order_by(Severity.resolution_sla_hours.desc()),
    )
    by_status = label_counts(
        db,
        select(Incident.status, func.count(Incident.incident_id))
        .group_by(Incident.status)
        .order_by(func.count(Incident.incident_id).desc()),
    )
    by_type = label_counts(
        db,
        select(IncidentType.name, func.count(Incident.incident_id))
        .outerjoin(Incident)
        .group_by(IncidentType.type_id, IncidentType.name)
        .order_by(func.count(Incident.incident_id).desc()),
    )
    monthly_rows = db.execute(
        select(
            extract("year", Incident.reported_date).label("year"),
            extract("month", Incident.reported_date).label("month"),
            func.count(Incident.incident_id),
        )
        .group_by("year", "month")
        .order_by("year", "month")
    ).all()
    monthly = [
        CountByLabel(label=f"{int(year):04d}-{int(month):02d}", count=count)
        for year, month, count in monthly_rows
    ]
    workload_rows = db.execute(
        select(User.name, Analyst.workload)
        .join(Analyst, Analyst.user_id == User.user_id)
        .order_by(Analyst.workload.desc(), User.name)
    ).all()
    workload = [CountByLabel(label=name, count=count) for name, count in workload_rows]

    return DashboardReport(
        total_incidents=total,
        open_incidents=open_count,
        resolved_incidents=resolved_count,
        critical_incidents=critical_count,
        sla_breaches=breach_count,
        analyst_count=analyst_count,
        incidents_by_severity=by_severity,
        incidents_by_status=by_status,
        incidents_by_type=by_type,
        monthly_trends=monthly,
        analyst_workload=workload,
    )


@router.get("/incidents.csv", response_class=StreamingResponse)
def export_incidents(_: AdminUser, db: DatabaseSession) -> StreamingResponse:
    rows = db.execute(
        select(
            Incident.incident_id,
            Incident.title,
            Incident.status,
            Severity.level,
            IncidentType.name.label("type_name"),
            User.name.label("reporter_name"),
            Incident.reported_date,
            Incident.resolved_date,
        )
        .join(Severity, Incident.severity_id == Severity.severity_id)
        .join(IncidentType, Incident.type_id == IncidentType.type_id)
        .join(User, Incident.reported_by == User.user_id)
        .order_by(Incident.reported_date.desc())
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["incident_id", "title", "status", "severity", "type", "reporter", "reported_date", "resolved_date"]
    )
    for row in rows:
        writer.writerow(
            [
                row.incident_id,
                spreadsheet_safe(row.title),
                spreadsheet_safe(row.status.value),
                spreadsheet_safe(row.level),
                spreadsheet_safe(row.type_name),
                spreadsheet_safe(row.reporter_name),
                row.reported_date.isoformat(),
                row.resolved_date.isoformat() if row.resolved_date else "",
            ]
        )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cims_incidents.csv"},
    )
