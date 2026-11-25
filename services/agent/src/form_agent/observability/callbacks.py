"""Opt-in Langfuse tracing for an isolated CreateForm evaluation service."""

import os
from pathlib import Path
from uuid import UUID

from form_agent.observability.raw_trace import RawTraceArchive


def evaluation_callback_factory():
    if os.getenv("CREATE_FORM_LANGFUSE_EVAL") != "1":
        return None

    public_key = os.environ["LANGFUSE_PUBLIC_KEY"]
    secret_key = os.environ["LANGFUSE_SECRET_KEY"]
    base_url = os.environ["LANGFUSE_BASE_URL"]
    if not all((public_key, secret_key, base_url)):
        raise ValueError("Langfuse evaluation requires an explicit endpoint and keys")

    from langfuse import Langfuse
    from langfuse.langchain import CallbackHandler

    Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        base_url=base_url,
        sample_rate=1.0,
    )
    archive_dir = Path(
        os.getenv(
            "CREATE_FORM_EVAL_ARCHIVE_DIR",
            str(Path(__file__).resolve().parents[2] / ".langfuse-evaluation" / "raw"),
        )
    )

    def new_callbacks(trace: UUID):
        return [
            CallbackHandler(public_key=public_key),
            RawTraceArchive(
                archive_dir / f"{trace}.events.jsonl", creation_trace_id=str(trace)
            ),
        ]

    return new_callbacks
