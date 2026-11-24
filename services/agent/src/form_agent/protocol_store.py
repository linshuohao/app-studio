"""Database relation and connection settings shared by the publisher and reader."""

from psycopg.conninfo import conninfo_to_dict
from sqlalchemy import Column, MetaData, Table, Text

DRIVER = "postgresql+psycopg://"
metadata = MetaData()
manuals = Table(
    "agent_protocol_manuals",
    metadata,
    Column("knowledge_version", Text, primary_key=True),
    Column("sha256", Text, nullable=False),
    Column("markdown", Text, nullable=False),
)


def connection_args(dsn: str) -> dict[str, object]:
    return {"connect_timeout": 5, **conninfo_to_dict(dsn)}
