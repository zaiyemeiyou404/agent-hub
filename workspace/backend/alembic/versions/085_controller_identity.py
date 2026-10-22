# -*- coding: utf-8 -*-
"""Controller devices, rotating sessions, agent bindings and stream tickets.

Revision ID: 085
Revises: 084

Phone and desktop controllers are not node pairings. Only token hashes are
stored. Applying this migration to production is a schema change the operator
must authorize separately; this revision does not touch live data by itself.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "085"
down_revision = "084"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "controller_devices",
        sa.Column("id", postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_key", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("platform", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("upstream_user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("standalone_label", sa.Text(), nullable=True),
        sa.Column("identity_mode", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("workspace_id", "device_key", name="uq_controller_device_workspace_key"),
    )
    op.create_index("idx_controller_devices_workspace", "controller_devices", ["workspace_id"])
    op.create_index("idx_controller_devices_status", "controller_devices", ["workspace_id", "status"])

    op.create_table(
        "controller_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("device_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("controller_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("access_token_hash", sa.Text(), nullable=False),
        sa.Column("refresh_token_hash", sa.Text(), nullable=False),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.Column("replaced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.UniqueConstraint("access_token_hash", name="uq_controller_access_hash"),
        sa.UniqueConstraint("refresh_token_hash", name="uq_controller_refresh_hash"),
    )
    op.create_index("idx_controller_credentials_device", "controller_credentials", ["device_id"])
    op.create_index("idx_controller_credentials_family", "controller_credentials", ["family_id"])

    op.create_table(
        "agent_principal_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_name", sa.Text(), nullable=False),
        sa.Column("node_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("workspace_id", "agent_name", "node_id", name="uq_agent_principal_binding"),
    )
    op.create_index("idx_agent_principal_bindings_workspace", "agent_principal_bindings", ["workspace_id", "agent_name"])

    op.create_table(
        "identity_audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("principal_kind", sa.Text(), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
    )
    op.create_index("idx_identity_audit_workspace", "identity_audit_events", ["workspace_id", "created_at"])

    op.create_table(
        "identity_stream_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("controller_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.UniqueConstraint("ticket_hash", name="uq_identity_stream_ticket_hash"),
    )
    op.create_index("idx_identity_stream_tickets_device", "identity_stream_tickets", ["device_id"])


def downgrade() -> None:
    op.drop_index("idx_identity_stream_tickets_device", table_name="identity_stream_tickets")
    op.drop_table("identity_stream_tickets")
    op.drop_index("idx_identity_audit_workspace", table_name="identity_audit_events")
    op.drop_table("identity_audit_events")
    op.drop_index("idx_agent_principal_bindings_workspace", table_name="agent_principal_bindings")
    op.drop_table("agent_principal_bindings")
    op.drop_index("idx_controller_credentials_family", table_name="controller_credentials")
    op.drop_index("idx_controller_credentials_device", table_name="controller_credentials")
    op.drop_table("controller_credentials")
    op.drop_index("idx_controller_devices_status", table_name="controller_devices")
    op.drop_index("idx_controller_devices_workspace", table_name="controller_devices")
    op.drop_table("controller_devices")
