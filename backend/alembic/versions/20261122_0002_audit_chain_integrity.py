"""Serialize audit-chain positions and add reverse FK indexes.

Revision ID: 20261122_0002
Revises: 20261122_0001
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op


revision: str = "20261122_0002"
down_revision: str | None = "20261122_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if not context.is_offline_mode():
        duplicate = op.get_bind().execute(
            sa.text(
                "SELECT prev_hash FROM audit_logs "
                "GROUP BY prev_hash HAVING COUNT(*) > 1 LIMIT 1"
            )
        ).first()
        if duplicate:
            raise RuntimeError(
                "Audit chain contains duplicate prev_hash values. "
                "Run integrity verification and repair the chain before upgrading."
            )
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.create_unique_constraint(
            "uq_audit_logs_prev_hash", ["prev_hash"]
        )
    op.create_index(
        "ix_incident_assets_asset_id", "incident_assets", ["asset_id"]
    )
    op.create_index("ix_actions_performed_by", "actions", ["performed_by"])
    op.create_index(
        "ix_incident_threat_actors_actor_id",
        "incident_threat_actors",
        ["actor_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_incident_threat_actors_actor_id",
        table_name="incident_threat_actors",
    )
    op.drop_index("ix_actions_performed_by", table_name="actions")
    op.drop_index("ix_incident_assets_asset_id", table_name="incident_assets")
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.drop_constraint("uq_audit_logs_prev_hash", type_="unique")
