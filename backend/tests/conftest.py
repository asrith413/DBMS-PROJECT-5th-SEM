from datetime import datetime, timedelta, timezone
import os


os.environ.setdefault(
    "JWT_SECRET_KEY",
    "x7G!2pQ#9Lm$4Vz@8Nc%6Tk&3Hs*5Wr!1Yb#7Df@2Kq",
)

import mongomock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.mongodb import get_security_logs_collection
from app.database.postgres import get_db
from app.main import app
from app.models import Analyst, Asset, Incident, IncidentStatus, IncidentType, Role, Severity, User
from app.models.base import Base
from app.services.audit_service import create_audit_log
from app.services.auth_service import hash_password


TEST_PASSWORD = "TestPassword123!"


@pytest.fixture()
def context():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = TestingSession()

    admin = User(
        name="Test Admin",
        email="admin@cims.edu",
        password_hash=hash_password(TEST_PASSWORD),
        role=Role.ADMIN,
        department="Security",
    )
    analyst_user = User(
        name="Test Analyst",
        email="analyst@cims.edu",
        password_hash=hash_password(TEST_PASSWORD),
        role=Role.ANALYST,
        department="SOC",
    )
    reporter = User(
        name="Test Reporter",
        email="reporter@cims.edu",
        password_hash=hash_password(TEST_PASSWORD),
        role=Role.REPORTER,
        department="Finance",
    )
    db.add_all([admin, analyst_user, reporter])
    db.flush()
    analyst = Analyst(user_id=analyst_user.user_id, expertise="Identity security", workload=0)
    incident_type = IncidentType(name="Phishing", description="Credential theft attempts")
    medium = Severity(level="Medium", response_sla_hours=8, resolution_sla_hours=72)
    critical = Severity(level="Critical", response_sla_hours=1, resolution_sla_hours=8)
    asset = Asset(
        name="Finance Laptop",
        type="Employee Laptop",
        ip_address="10.1.1.25",
        department="Finance",
    )
    db.add_all([analyst, incident_type, medium, critical, asset])
    db.flush()
    incident = Incident(
        title="Baseline phishing report",
        description="A finance user received a credential harvesting message.",
        type_id=incident_type.type_id,
        severity_id=medium.severity_id,
        reported_by=reporter.user_id,
        status=IncidentStatus.OPEN,
        reported_date=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    db.add(incident)
    db.flush()
    create_audit_log(
        db,
        incident_id=incident.incident_id,
        performed_by=reporter.user_id,
        action_type="INCIDENT_CREATED",
        action_data={"title": incident.title, "status": IncidentStatus.OPEN.value},
        timestamp=incident.reported_date,
    )
    db.commit()

    mongo_client = mongomock.MongoClient()
    collection = mongo_client["cims_test"]["security_logs"]

    def override_db():
        yield db

    def override_collection():
        return collection

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_security_logs_collection] = override_collection

    with TestClient(app) as client:
        yield {
            "client": client,
            "db": db,
            "engine": engine,
            "collection": collection,
            "admin": admin,
            "analyst": analyst,
            "analyst_user": analyst_user,
            "reporter": reporter,
            "incident_type": incident_type,
            "medium": medium,
            "critical": critical,
            "asset": asset,
            "incident": incident,
        }

    app.dependency_overrides.clear()
    db.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


def login(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/auth/login", data={"username": email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin_headers(context):
    return login(context["client"], context["admin"].email)


@pytest.fixture()
def analyst_headers(context):
    return login(context["client"], context["analyst_user"].email)


@pytest.fixture()
def reporter_headers(context):
    return login(context["client"], context["reporter"].email)
