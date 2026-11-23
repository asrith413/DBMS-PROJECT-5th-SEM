from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.mongodb import check_mongodb_connection
from app.database.postgres import check_postgres_connection
from app.routers import (
    actions,
    analysts,
    assets,
    assignments,
    audit_logs,
    auth,
    incident_types,
    incidents,
    reports,
    security_logs,
    severity,
    threat_actors,
    users,
)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "Academic SOC incident workflow demonstrating PostgreSQL relationships, "
        "MongoDB security logs, RBAC, SLA tracking, and tamper-evident auditing."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for api_router in (
    auth.router,
    users.router,
    analysts.router,
    incidents.router,
    incident_types.router,
    severity.router,
    assets.router,
    assignments.router,
    actions.router,
    threat_actors.router,
    security_logs.router,
    audit_logs.router,
    reports.router,
):
    app.include_router(api_router)


@app.get("/", tags=["System"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "status": "running",
        "documentation": "/docs",
    }


@app.get("/health/live", tags=["System"])
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/dependencies", tags=["System"])
def dependency_health() -> dict[str, str]:
    result: dict[str, str] = {}
    try:
        check_postgres_connection()
        result["postgresql"] = "available"
    except Exception as error:
        result["postgresql"] = f"unavailable: {type(error).__name__}"
    try:
        check_mongodb_connection()
        result["mongodb"] = "available"
    except Exception as error:
        result["mongodb"] = f"unavailable: {type(error).__name__}"
    return result
