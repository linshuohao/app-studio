import asyncio
import os
from hashlib import sha256
from uuid import uuid4

import pytest
from psycopg import connect

from form_agent.publish_protocol import publish_protocol
from form_agent.integrations.protocol import PostgresProtocolReader, ProtocolVersionUnavailable


def test_protocol_reader_returns_the_pinned_published_bytes():
    dsn = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Set AGENT_TEST_DATABASE_URL to a local Agent test database")

    first = f"test-{uuid4()}"
    second = f"test-{uuid4()}"
    missing = f"test-{uuid4()}"
    text = "# 完整协议\n\n作用域。\n"
    data = text.encode()
    expected = sha256(data).hexdigest()
    reader = PostgresProtocolReader(dsn)
    try:
        assert publish_protocol(dsn, first, data) == expected
        assert publish_protocol(dsn, first, data) == expected
        publish_protocol(dsn, second, b"# Different manual")
        with pytest.raises(ValueError, match="different manual"):
            publish_protocol(dsn, first, b"# Changed")
        assert asyncio.run(reader({"knowledge_version": first}, "只查作用域")) == {
            "knowledge_version": first,
            "sha256": expected,
            "markdown": text,
        }
        with pytest.raises(ProtocolVersionUnavailable, match="not published"):
            asyncio.run(reader({"knowledge_version": missing}, "full"))
    finally:
        with connect(dsn) as conn:
            conn.execute(
                "DELETE FROM agent_protocol_manuals WHERE knowledge_version IN (%s, %s)",
                (first, second),
            )


def test_protocol_reader_rejects_missing_version_before_opening_a_connection():
    reader = PostgresProtocolReader("unused")
    with pytest.raises(ProtocolVersionUnavailable, match="pinned"):
        asyncio.run(reader({}, "full"))
