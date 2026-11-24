"""Persist Agent-owned conversations, private task facts, and replayable deliveries."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002_conversations"
down_revision = "0001_protocol_manuals"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_conversations",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("user_id", sa.Text, nullable=False),
        sa.Column("space_id", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("form_id", sa.Text),
        sa.Column("work_id", sa.Text),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("task", JSONB(), nullable=False),
        sa.Column("import_digest", sa.Text),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_agent_conversation_owner",
        "agent_conversations",
        ["space_id", "user_id", "updated_at"],
    )
    op.create_table(
        "agent_conversation_turns",
        sa.Column(
            "conversation_id",
            sa.Text,
            sa.ForeignKey("agent_conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("turn_id", sa.Text, primary_key=True),
        sa.Column("revision", sa.Integer),
        sa.Column("fingerprint", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("request", JSONB(), nullable=False),
        sa.Column("public_turn", JSONB()),
        sa.Column("private_result", JSONB()),
        sa.Column("delivery", JSONB()),
        sa.UniqueConstraint("conversation_id", "revision"),
    )


def downgrade():
    op.drop_table("agent_conversation_turns")
    op.drop_table("agent_conversations")
