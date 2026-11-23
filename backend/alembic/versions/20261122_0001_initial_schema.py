"""Create the twelve CIMS relational tables.

Revision ID: 20261122_0001
Revises:
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261122_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


role_enum = sa.Enum(
    "ADMIN",
    "ANALYST",
    "REPORTER",
    name="role_enum",
    native_enum=False,
    create_constraint=True,
)
status_enum = sa.Enum(
    "Open",
    "Assigned",
    "Under Investigation",
    "In Progress",
    "Resolved",
    "Closed",
    name="incident_status_enum",
    native_enum=False,
    create_constraint=True,
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", role_enum, nullable=False),
        sa.Column("department", sa.String(120)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "incident_types",
        sa.Column("type_id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.UniqueConstraint("name", name="uq_incident_types_name"),
    )
    op.create_table(
        "severity",
        sa.Column("severity_id", sa.Integer(), primary_key=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("response_sla_hours", sa.Integer(), nullable=False),
        sa.Column("resolution_sla_hours", sa.Integer(), nullable=False),
        sa.CheckConstraint("response_sla_hours > 0", name="response_sla_positive"),
        sa.CheckConstraint("resolution_sla_hours > 0", name="resolution_sla_positive"),
        sa.CheckConstraint("resolution_sla_hours >= response_sla_hours", name="resolution_not_shorter_than_response"),
        sa.UniqueConstraint("level", name="uq_severity_level"),
    )
    op.create_table(
        "assets",
        sa.Column("asset_id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("department", sa.String(120), nullable=False),
        sa.UniqueConstraint("ip_address", name="uq_assets_ip_address"),
    )
    op.create_index("ix_assets_name", "assets", ["name"])
    op.create_index("ix_assets_type", "assets", ["type"])
    op.create_index("ix_assets_department", "assets", ["department"])
    op.create_table(
        "threat_actors",
        sa.Column("actor_id", sa.Integer(), primary_key=True),
        sa.Column("alias", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.UniqueConstraint("alias", name="uq_threat_actors_alias"),
    )
    op.create_table(
        "analysts",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("expertise", sa.String(255), nullable=False),
        sa.Column("workload", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("workload >= 0", name="analyst_workload_nonnegative"),
    )
    op.create_table(
        "incidents",
        sa.Column("incident_id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type_id", sa.Integer(), sa.ForeignKey("incident_types.type_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("severity_id", sa.Integer(), sa.ForeignKey("severity.severity_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reported_by", sa.Integer(), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column("reported_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("resolved_date", sa.DateTime(timezone=True)),
        sa.CheckConstraint("resolved_date IS NULL OR resolved_date >= reported_date", name="resolved_after_reported"),
    )
    for column in ("title", "type_id", "severity_id", "reported_by", "status", "reported_date"):
        op.create_index(f"ix_incidents_{column}", "incidents", [column])
    op.create_index("ix_incidents_status_reported_date", "incidents", ["status", "reported_date"])
    op.create_table(
        "incident_assets",
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.incident_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.asset_id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("impact_type", sa.String(120), nullable=False),
    )
    op.create_table(
        "incident_assignment",
        sa.Column("assignment_id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.incident_id", ondelete="CASCADE"), nullable=False),
        sa.Column("analyst_id", sa.Integer(), sa.ForeignKey("analysts.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("role", sa.String(100), nullable=False, server_default="Primary Analyst"),
        sa.UniqueConstraint("incident_id", "analyst_id", name="uq_incident_assignment_incident_analyst_once"),
    )
    op.create_index("ix_incident_assignment_incident_id", "incident_assignment", ["incident_id"])
    op.create_index("ix_incident_assignment_analyst_id", "incident_assignment", ["analyst_id"])
    op.create_index("ix_assignment_incident_date", "incident_assignment", ["incident_id", "assigned_date"])
    op.create_table(
        "actions",
        sa.Column("action_id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.incident_id", ondelete="CASCADE"), nullable=False),
        sa.Column("performed_by", sa.Integer(), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("action_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_actions_incident_id", "actions", ["incident_id"])
    op.create_index("ix_actions_incident_date", "actions", ["incident_id", "action_date"])
    op.create_table(
        "incident_threat_actors",
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.incident_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("threat_actors.actor_id", ondelete="RESTRICT"), primary_key=True),
    )
    op.create_table(
        "audit_logs",
        sa.Column("log_id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.incident_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("performed_by", sa.Integer(), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("action_data", sa.JSON(), nullable=False),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("hash", name="uq_audit_logs_hash"),
    )
    for column in ("incident_id", "performed_by", "action_type", "timestamp"):
        op.create_index(f"ix_audit_logs_{column}", "audit_logs", [column])
    op.create_index("ix_audit_logs_timestamp_id", "audit_logs", ["timestamp", "log_id"])


def downgrade() -> None:
    for table in (
        "audit_logs",
        "incident_threat_actors",
        "actions",
        "incident_assignment",
        "incident_assets",
        "incidents",
        "analysts",
        "threat_actors",
        "assets",
        "severity",
        "incident_types",
        "users",
    ):
        op.drop_table(table)
