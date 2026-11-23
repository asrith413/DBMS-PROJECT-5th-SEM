from datetime import datetime, timedelta, timezone

from app.models import Incident


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def calculate_sla_status(
    incident: Incident, now: datetime | None = None
) -> dict[str, datetime | float | bool | str]:
    current_time = as_utc(now or datetime.now(timezone.utc))
    reported_at = as_utc(incident.reported_date)
    response_deadline = reported_at + timedelta(
        hours=incident.severity.response_sla_hours
    )
    resolution_deadline = reported_at + timedelta(
        hours=incident.severity.resolution_sla_hours
    )

    first_assignment = min(
        (as_utc(item.assigned_date) for item in incident.assignments), default=None
    )
    response_reference = first_assignment or current_time
    response_breached = response_reference > response_deadline

    resolution_reference = (
        as_utc(incident.resolved_date) if incident.resolved_date else current_time
    )
    resolution_breached = resolution_reference > resolution_deadline
    breached = response_breached or resolution_breached
    resolved = incident.resolved_date is not None
    remaining = (
        0.0
        if resolved
        else max(0.0, (resolution_deadline - current_time).total_seconds() / 3600)
    )
    state = "Breached" if breached else "Completed" if resolved else "Active"

    return {
        "response_deadline": response_deadline,
        "resolution_deadline": resolution_deadline,
        "remaining_resolution_hours": round(remaining, 2),
        "response_breached": response_breached,
        "resolution_breached": resolution_breached,
        "sla_breached": breached,
        "state": state,
    }
