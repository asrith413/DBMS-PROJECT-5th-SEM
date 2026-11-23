from sqlalchemy import inspect, select, text

from app.models import User
from app.services.auth_service import verify_password
from tests.conftest import TEST_PASSWORD


def test_database_connectivity_and_all_twelve_tables(context):
    assert context["db"].execute(text("SELECT 1")).scalar_one() == 1
    assert set(inspect(context["engine"]).get_table_names()) == {
        "users",
        "analysts",
        "incident_types",
        "severity",
        "incidents",
        "assets",
        "incident_assets",
        "incident_assignment",
        "actions",
        "threat_actors",
        "incident_threat_actors",
        "audit_logs",
    }


def test_reporter_registration_hashes_password(context):
    response = context["client"].post(
        "/auth/register",
        json={
            "name": "New Reporter",
            "email": "new.reporter@cims.edu",
            "password": TEST_PASSWORD,
            "department": "HR",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "REPORTER"
    user = context["db"].scalar(select(User).where(User.email == "new.reporter@cims.edu"))
    assert user.password_hash != TEST_PASSWORD
    assert verify_password(TEST_PASSWORD, user.password_hash)


def test_authentication_returns_jwt_and_current_user(context):
    login_response = context["client"].post(
        "/auth/login",
        data={"username": context["admin"].email, "password": TEST_PASSWORD},
    )
    assert login_response.status_code == 200
    body = login_response.json()
    assert body["token_type"] == "bearer"
    me = context["client"].get(
        "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["role"] == "ADMIN"


def test_invalid_login_is_rejected(context):
    response = context["client"].post(
        "/auth/login",
        data={"username": context["admin"].email, "password": "incorrect-password"},
    )
    assert response.status_code == 401


def test_role_based_access_blocks_reporter_from_user_list(context, reporter_headers):
    response = context["client"].get("/users", headers=reporter_headers)
    assert response.status_code == 403
