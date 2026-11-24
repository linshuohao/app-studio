"""Reserve deleted conversation identities to reject stale first-turn replay."""

import sqlalchemy as sa
from alembic import op

revision = "0003_conversation_tombstones"
down_revision = "0002_conversations"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_deleted_conversations", sa.Column("id", sa.Text, primary_key=True)
    )


def downgrade():
    op.drop_table("agent_deleted_conversations")
