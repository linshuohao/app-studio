"""Store durable execution results and the public progress of each turn."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005_turn_journal"
down_revision = "0004_imported_turn_fingerprints"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_turn_journal",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("conversation_id", sa.Text, nullable=False),
        sa.Column("turn_id", sa.Text, nullable=False),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("step_key", sa.Text),
        sa.Column("payload", JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id", "turn_id"],
            [
                "agent_conversation_turns.conversation_id",
                "agent_conversation_turns.turn_id",
            ],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_agent_turn_journal_lookup",
        "agent_turn_journal",
        ["conversation_id", "turn_id", "step_key", "id"],
    )


def downgrade():
    op.drop_table("agent_turn_journal")
