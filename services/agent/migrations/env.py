import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from form_agent.integrations.protocol_store import DRIVER, connection_args, metadata


def migrate() -> None:
    engine = create_engine(
        DRIVER,
        connect_args=connection_args(os.environ["AGENT_DATABASE_URL"]),
        poolclass=NullPool,
    )
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


migrate()
