"""Publish an immutable manual version to the Agent PostgreSQL database."""

import argparse
import os
from hashlib import sha256
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.pool import NullPool

from form_agent.integrations.protocol_store import DRIVER, connection_args, manuals


def publish_protocol(dsn: str, version: str, markdown: bytes) -> str:
    document = markdown.decode("utf-8")
    if not version.strip() or not document.strip():
        raise ValueError("Version and manual must be nonempty")

    digest = sha256(markdown).hexdigest()
    engine = create_engine(
        DRIVER, connect_args=connection_args(dsn), poolclass=NullPool
    )
    try:
        with engine.begin() as conn:
            conn.execute(
                insert(manuals)
                .values(knowledge_version=version, sha256=digest, markdown=document)
                .on_conflict_do_nothing(index_elements=[manuals.c.knowledge_version])
            )
            row = conn.execute(
                select(manuals.c.sha256, manuals.c.markdown).where(
                    manuals.c.knowledge_version == version
                )
            ).one()
            if tuple(row) != (digest, document):
                raise ValueError(
                    "This knowledge version already contains a different manual"
                )
    finally:
        engine.dispose()

    return digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("manual", type=Path)
    args = parser.parse_args()
    dsn = os.environ.get("AGENT_DATABASE_URL")
    if not dsn:
        parser.error("AGENT_DATABASE_URL is required")
    print(publish_protocol(dsn, args.version, args.manual.read_bytes()))


if __name__ == "__main__":
    main()
