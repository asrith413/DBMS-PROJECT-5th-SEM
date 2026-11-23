from datetime import datetime, timezone
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import RequestModel


class SecurityLogCreate(RequestModel):
    incident_id: int = Field(gt=0)
    source: str = Field(min_length=2, max_length=100)
    event_type: str = Field(min_length=2, max_length=100)
    source_ip: str | None = Field(default=None, max_length=45)
    destination_ip: str | None = Field(default=None, max_length=45)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    severity: str = Field(min_length=2, max_length=20)
    description: str = Field(min_length=3, max_length=5000)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("severity")
    @classmethod
    def normalize_severity(cls, value: str) -> str:
        normalized = value.strip().title()
        if normalized not in {"Low", "Medium", "High", "Critical"}:
            raise ValueError("Severity must be Low, Medium, High, or Critical.")
        return normalized

    @field_validator("source_ip", "destination_ip")
    @classmethod
    def validate_ip(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        from ipaddress import ip_address

        try:
            ip_address(value)
        except ValueError as error:
            raise ValueError("Must be a valid IP address.") from error
        return value


class SecurityLogRead(SecurityLogCreate):
    log_id: str
