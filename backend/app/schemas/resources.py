from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel, RequestModel, validate_patch_fields
from app.schemas.users import UserSummary


class IncidentTypeCreate(RequestModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=3, max_length=2000)


class IncidentTypeUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, min_length=3, max_length=2000)

    @model_validator(mode="after")
    def validate_update(self) -> "IncidentTypeUpdate":
        validate_patch_fields(self, {"name", "description"})
        return self


class IncidentTypeRead(ORMModel):
    type_id: int
    name: str
    description: str


class SeverityCreate(RequestModel):
    level: str = Field(min_length=2, max_length=20)
    response_sla_hours: int = Field(gt=0)
    resolution_sla_hours: int = Field(gt=0)

    @field_validator("level")
    @classmethod
    def validate_level(cls, value: str) -> str:
        normalized = value.title()
        if normalized not in {"Low", "Medium", "High", "Critical"}:
            raise ValueError("Severity level must be Low, Medium, High, or Critical.")
        return normalized

    @field_validator("resolution_sla_hours")
    @classmethod
    def validate_resolution_sla(cls, value: int, info: Any) -> int:
        response = info.data.get("response_sla_hours")
        if response is not None and value < response:
            raise ValueError("Resolution SLA cannot be shorter than response SLA.")
        return value


class SeverityUpdate(RequestModel):
    level: str | None = Field(default=None, min_length=2, max_length=20)
    response_sla_hours: int | None = Field(default=None, gt=0)
    resolution_sla_hours: int | None = Field(default=None, gt=0)

    @field_validator("level")
    @classmethod
    def validate_level(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.title()
        if normalized not in {"Low", "Medium", "High", "Critical"}:
            raise ValueError("Severity level must be Low, Medium, High, or Critical.")
        return normalized

    @model_validator(mode="after")
    def validate_update(self) -> "SeverityUpdate":
        validate_patch_fields(
            self, {"level", "response_sla_hours", "resolution_sla_hours"}
        )
        return self


class SeverityRead(ORMModel):
    severity_id: int
    level: str
    response_sla_hours: int
    resolution_sla_hours: int


class AssetCreate(RequestModel):
    name: str = Field(min_length=2, max_length=150)
    type: str = Field(min_length=2, max_length=100)
    ip_address: str | None = Field(default=None, max_length=45)
    department: str = Field(min_length=2, max_length=120)

    @field_validator("ip_address")
    @classmethod
    def validate_ip_or_network(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        from ipaddress import ip_address, ip_network

        try:
            ip_address(value)
        except ValueError:
            try:
                ip_network(value, strict=False)
            except ValueError as error:
                raise ValueError("Must be a valid IP address or CIDR network.") from error
        return value


class AssetUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    type: str | None = Field(default=None, min_length=2, max_length=100)
    ip_address: str | None = Field(default=None, max_length=45)
    department: str | None = Field(default=None, min_length=2, max_length=120)

    @model_validator(mode="after")
    def validate_update(self) -> "AssetUpdate":
        validate_patch_fields(self, {"name", "type", "department"})
        return self

    @field_validator("ip_address")
    @classmethod
    def validate_ip_or_network(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        from ipaddress import ip_address, ip_network

        try:
            ip_address(value)
        except ValueError:
            try:
                ip_network(value, strict=False)
            except ValueError as error:
                raise ValueError("Must be a valid IP address or CIDR network.") from error
        return value


class AssetRead(ORMModel):
    asset_id: int
    name: str
    type: str
    ip_address: str | None
    department: str


class AssetIncidentRead(BaseModel):
    incident_id: int
    title: str
    status: str
    impact_type: str


class AssetLinkCreate(RequestModel):
    impact_type: str = Field(min_length=2, max_length=120)


class IncidentAssetRead(ORMModel):
    incident_id: int
    asset_id: int
    impact_type: str
    asset: AssetRead


class AssignmentCreate(RequestModel):
    incident_id: int = Field(gt=0)
    analyst_id: int = Field(gt=0)
    role: str = Field(default="Primary Analyst", min_length=2, max_length=100)


class AssignmentRead(ORMModel):
    assignment_id: int
    incident_id: int
    analyst_id: int
    assigned_date: datetime
    role: str
    analyst_name: str | None = None


class ActionCreate(RequestModel):
    description: str = Field(min_length=3, max_length=4000)


class ActionRead(ORMModel):
    action_id: int
    incident_id: int
    performed_by: int
    description: str
    action_date: datetime
    performer: UserSummary


class ThreatActorCreate(RequestModel):
    alias: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=4000)


class ThreatActorUpdate(RequestModel):
    alias: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, min_length=3, max_length=4000)

    @model_validator(mode="after")
    def validate_update(self) -> "ThreatActorUpdate":
        validate_patch_fields(self, {"alias", "description"})
        return self


class ThreatActorRead(ORMModel):
    actor_id: int
    alias: str
    description: str


class IncidentThreatActorRead(ORMModel):
    incident_id: int
    actor_id: int
    threat_actor: ThreatActorRead


class AuditLogRead(ORMModel):
    log_id: int
    incident_id: int
    performed_by: int
    action_type: str
    action_data: dict[str, Any]
    hash: str
    prev_hash: str
    timestamp: datetime
    performer: UserSummary


class AuditVerification(BaseModel):
    integrity_valid: bool
    records_checked: int
    first_invalid_log_id: int | None
