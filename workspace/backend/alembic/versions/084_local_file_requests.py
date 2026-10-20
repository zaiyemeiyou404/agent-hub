"""Secure cross-device local file request protocol."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '084'
down_revision = '083'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('nodes', sa.Column('capabilities', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.create_table(
        'local_file_requests',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('idempotency_key', sa.Text(), nullable=False),
        sa.Column('requester_agent_id', sa.Text(), nullable=False),
        sa.Column('requester_device_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('requester_device_name', sa.Text(), nullable=False),
        sa.Column('recipient_agent_id', sa.Text(), nullable=False),
        sa.Column('recipient_device_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('recipient_device_name', sa.Text(), nullable=False),
        sa.Column('channel_name', sa.Text(), nullable=False),
        sa.Column('root_id', sa.Text(), nullable=False),
        sa.Column('relative_path', sa.Text(), nullable=False),
        sa.Column('request_content_redacted', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default='queued_inspection'),
        sa.Column('sensitivity_reasons', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('sensitivity_stage', sa.Text(), nullable=True),
        sa.Column('content_sha256', sa.Text(), nullable=True),
        sa.Column('content_size', sa.Integer(), nullable=True),
        sa.Column('content_type', sa.Text(), nullable=True),
        sa.Column('filename', sa.Text(), nullable=True),
        sa.Column('approval_id', sa.Text(), nullable=True),
        sa.Column('current_command_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('file_id', sa.Text(), nullable=True),
        sa.Column('error_code', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['approval_id'], ['approvals.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['current_command_id'], ['node_commands.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['recipient_device_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requester_device_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', 'requester_agent_id', 'requester_device_id', 'idempotency_key', name='uq_local_file_request_idempotency'),
        sa.UniqueConstraint('approval_id'),
        sa.UniqueConstraint('file_id'),
    )
    op.create_index('idx_local_file_requests_requester', 'local_file_requests', ['workspace_id', 'requester_agent_id', 'created_at'])
    op.create_index('idx_local_file_requests_recipient_status', 'local_file_requests', ['recipient_device_id', 'status'])


def downgrade():
    op.drop_index('idx_local_file_requests_recipient_status', table_name='local_file_requests')
    op.drop_index('idx_local_file_requests_requester', table_name='local_file_requests')
    op.drop_table('local_file_requests')
    op.drop_column('nodes', 'capabilities')
