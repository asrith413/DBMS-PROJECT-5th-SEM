from __future__ import annotations

import json
import os
from typing import Any

import requests


DEFAULT_BACKEND_URL = "http://localhost:8000"


def get_api_base_url() -> str:
    """Return the configured API root without a trailing slash."""
    return os.getenv("BACKEND_URL", DEFAULT_BACKEND_URL).strip().rstrip("/")


def _response_detail(response: requests.Response) -> str:
    try:
        body = response.json()
    except (requests.JSONDecodeError, ValueError):
        text = response.text.strip()
        return text or f"The API returned HTTP {response.status_code}."

    detail = body.get("detail", body) if isinstance(body, dict) else body
    if isinstance(detail, list):
        messages: list[str] = []
        for item in detail:
            if not isinstance(item, dict):
                messages.append(str(item))
                continue
            location = ".".join(str(part) for part in item.get("loc", []) if part != "body")
            message = str(item.get("msg", "Invalid value"))
            messages.append(f"{location}: {message}" if location else message)
        return "; ".join(messages)
    if isinstance(detail, (dict, list)):
        return json.dumps(detail, default=str)
    return str(detail)


class APIError(RuntimeError):
    """A user-displayable backend or network failure."""

    def __init__(self, detail: str, status_code: int | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class APIClient:
    """Small authenticated client matching the FastAPI routes exactly."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: tuple[float, float] = (5.0, 30.0),
    ) -> None:
        self.base_url = (base_url or get_api_base_url()).rstrip("/")
        self.token = token
        self.timeout = timeout
        self._session = requests.Session()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        form_data: dict[str, Any] | None = None,
        expect_bytes: bool = False,
    ) -> Any:
        headers = {"Accept": "text/csv" if expect_bytes else "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            response = self._session.request(
                method,
                f"{self.base_url}{path}",
                params=params,
                json=json_body,
                data=form_data,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.Timeout as error:
            raise APIError("The API request timed out. Check the backend and try again.") from error
        except requests.RequestException as error:
            raise APIError(
                f"Cannot reach the CIMS API at {self.base_url}. "
                "Confirm that the backend is running and BACKEND_URL is correct."
            ) from error

        if not response.ok:
            raise APIError(_response_detail(response), response.status_code)
        if expect_bytes:
            return response.content
        if not response.content:
            return None
        try:
            return response.json()
        except (requests.JSONDecodeError, ValueError) as error:
            raise APIError("The API returned an invalid JSON response.", response.status_code) from error

    def login(self, email: str, password: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/auth/login",
            form_data={"username": email, "password": password},
        )

    def current_user(self) -> dict[str, Any]:
        return self._request("GET", "/auth/me")

    def list_incidents(
        self,
        *,
        status: str | None = None,
        severity_id: int | None = None,
        type_id: int | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params = {
            "status": status,
            "severity_id": severity_id,
            "type_id": type_id,
            "search": search,
            "offset": offset,
            "limit": limit,
        }
        return self._request(
            "GET", "/incidents", params={key: value for key, value in params.items() if value not in (None, "")}
        )

    def get_incident(self, incident_id: int) -> dict[str, Any]:
        return self._request("GET", f"/incidents/{incident_id}")

    def create_incident(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/incidents", json_body=payload)

    def update_incident(self, incident_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("PATCH", f"/incidents/{incident_id}", json_body=payload)

    def delete_incident(self, incident_id: int) -> dict[str, Any]:
        return self._request("DELETE", f"/incidents/{incident_id}")

    def suggest_severity(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/incidents/suggest-severity", json_body=payload)

    def list_incident_types(self) -> list[dict[str, Any]]:
        return self._request("GET", "/incident-types")

    def list_severities(self) -> list[dict[str, Any]]:
        return self._request("GET", "/severity")

    def list_assignments(self) -> list[dict[str, Any]]:
        return self._request("GET", "/assignments")

    def create_assignment(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/assignments", json_body=payload)

    def list_incident_assignments(self, incident_id: int) -> list[dict[str, Any]]:
        return self._request("GET", f"/assignments/incident/{incident_id}")

    def add_action(self, incident_id: int, description: str) -> dict[str, Any]:
        return self._request(
            "POST", f"/actions/incident/{incident_id}", json_body={"description": description}
        )

    def list_actions(self, incident_id: int) -> list[dict[str, Any]]:
        return self._request("GET", f"/actions/incident/{incident_id}")

    def list_users(self) -> list[dict[str, Any]]:
        return self._request("GET", "/users")

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/users", json_body=payload)

    def update_user(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("PATCH", f"/users/{user_id}", json_body=payload)

    def delete_user(self, user_id: int) -> dict[str, Any]:
        return self._request("DELETE", f"/users/{user_id}")

    def list_analysts(self) -> list[dict[str, Any]]:
        return self._request("GET", "/analysts")

    def create_analyst(self, user_id: int, expertise: str) -> dict[str, Any]:
        return self._request(
            "POST", "/analysts", json_body={"user_id": user_id, "expertise": expertise}
        )

    def update_analyst(self, analyst_id: int, expertise: str) -> dict[str, Any]:
        return self._request(
            "PATCH", f"/analysts/{analyst_id}", json_body={"expertise": expertise}
        )

    def delete_analyst(self, analyst_id: int) -> dict[str, Any]:
        return self._request("DELETE", f"/analysts/{analyst_id}")

    def list_assets(self) -> list[dict[str, Any]]:
        return self._request("GET", "/assets")

    def create_asset(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/assets", json_body=payload)

    def update_asset(self, asset_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("PATCH", f"/assets/{asset_id}", json_body=payload)

    def delete_asset(self, asset_id: int) -> dict[str, Any]:
        return self._request("DELETE", f"/assets/{asset_id}")

    def list_asset_incidents(self, asset_id: int) -> list[dict[str, Any]]:
        return self._request("GET", f"/assets/{asset_id}/incidents")

    def associate_asset(
        self, asset_id: int, incident_id: int, impact_type: str
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/assets/{asset_id}/incidents/{incident_id}",
            json_body={"impact_type": impact_type},
        )

    def remove_asset_association(self, asset_id: int, incident_id: int) -> dict[str, Any]:
        return self._request("DELETE", f"/assets/{asset_id}/incidents/{incident_id}")

    def list_security_logs(
        self,
        *,
        incident_id: int | None = None,
        source: str | None = None,
        severity: str | None = None,
        event_type: str | None = None,
        search: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "incident_id": incident_id,
            "source": source,
            "severity": severity,
            "event_type": event_type,
            "search": search,
            "limit": limit,
        }
        return self._request(
            "GET",
            "/security-logs",
            params={key: value for key, value in params.items() if value not in (None, "")},
        )

    def create_security_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/security-logs", json_body=payload)

    def list_audit_logs(
        self, *, incident_id: int | None = None, limit: int = 200
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": limit}
        if incident_id is not None:
            params["incident_id"] = incident_id
        return self._request("GET", "/audit", params=params)

    def verify_audit_integrity(self) -> dict[str, Any]:
        return self._request("GET", "/audit/verify")

    def dashboard_report(self) -> dict[str, Any]:
        return self._request("GET", "/reports/dashboard")

    def export_incidents_csv(self) -> bytes:
        return self._request("GET", "/reports/incidents.csv", expect_bytes=True)
