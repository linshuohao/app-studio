"""Store published, immutable protocol manuals."""

from alembic import op
from sqlalchemy import Column, Text

revision = "0001_protocol_manuals"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_protocol_manuals",
        Column("knowledge_version", Text, primary_key=True),
        Column("sha256", Text, nullable=False),
        Column("markdown", Text, nullable=False),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("agent_protocol_manuals")
