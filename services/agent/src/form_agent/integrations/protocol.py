from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from pydantic import JsonValue
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from form_agent.integrations.protocol_store import DRIVER, connection_args, manuals

ReadProtocol = Callable[[dict[str, JsonValue], str], Awaitable[JsonValue]]
"""Read the complete published protocol pinned by the trusted request context."""


class ProtocolVersionUnavailable(LookupError):
    pass


@dataclass(frozen=True)
class PostgresProtocolReader:
    """Request-time reader. The Agent database is the only source of the manual."""

    dsn: str

    async def __call__(self, context: dict[str, JsonValue], query: str) -> JsonValue:
        version = context.get("knowledge_version")
        if not isinstance(version, str) or not version.strip():
            raise ProtocolVersionUnavailable(
                "A pinned protocol knowledge version is required"
            )

        # The initial tool returns the entire version regardless of the question.
        engine = create_async_engine(
            DRIVER, connect_args=connection_args(self.dsn), poolclass=NullPool
        )
        try:
            async with engine.connect() as conn:
                rows = await conn.execute(
                    select(manuals.c.sha256, manuals.c.markdown).where(
                        manuals.c.knowledge_version == version
                    )
                )
                row = rows.one_or_none()
        finally:
            await engine.dispose()
        if row is None:
            raise ProtocolVersionUnavailable(
                "The pinned protocol knowledge version is not published"
            )

        result: dict[str, JsonValue] = {
            "knowledge_version": version,
            "sha256": row[0],
            "markdown": row[1],
        }
        return result
