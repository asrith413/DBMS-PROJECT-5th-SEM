from pydantic import BaseModel


class CountByLabel(BaseModel):
    label: str
    count: int


class DashboardReport(BaseModel):
    total_incidents: int
    open_incidents: int
    resolved_incidents: int
    critical_incidents: int
    sla_breaches: int
    analyst_count: int
    incidents_by_severity: list[CountByLabel]
    incidents_by_status: list[CountByLabel]
    incidents_by_type: list[CountByLabel]
    monthly_trends: list[CountByLabel]
    analyst_workload: list[CountByLabel]
