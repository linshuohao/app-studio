"""Run one conversation turn under its existing lock and journal scope."""

import asyncio
from contextlib import aclosing

from sqlalchemy import update

from form_agent.agent.budgets import TURN_RECURSION_LIMIT
from form_agent.business.conversations.store import (
    StoreUnavailable,
    TurnJournal,
    db_step,
    turns,
)
from form_agent.execution.journal import execution_scope


async def run_turn_events(
    store,
    graph,
    message,
    owner,
    cid,
    trace,
    *,
    resume,
    timeout_seconds,
    callbacks,
    archive,
    stream_graph_events,
):
    if archive:
        archive.record(
            "turn.request", conversation_id=cid, message=message, resume=resume
        )
    async with store.exclusive(cid) as conn:
        prepared = await db_step(store.prepare, conn, cid, owner, message)
        if "replay" in prepared:
            envelope = prepared["replay"]
            batches = []
            if archive:
                archive.record("turn.replay", result=envelope)
        else:
            journal = TurnJournal(conn, cid, str(message.turnId))
            try:
                if graph is None:
                    raise StoreUnavailable("Agent model or tools are unavailable")
                completed = await journal.completed_repair_rounds() if resume else 0
                trace_options = {}
                if callbacks:
                    trace_options = {
                        "callbacks": callbacks,
                        "trace_metadata": {
                            "langfuse_session_id": cid,
                            "turn_id": str(message.turnId),
                            "resume": resume,
                            "capture_version": "raw-events-v1",
                        },
                    }
                with execution_scope(journal, resume=resume):
                    async with asyncio.timeout(timeout_seconds):
                        stream = stream_graph_events(
                            graph,
                            prepared["input"],
                            trace,
                            TURN_RECURSION_LIMIT + 6 * completed,
                            **trace_options,
                        )
                        async with aclosing(stream):
                            async for event in stream:
                                if event["type"] != "private_result":
                                    await journal.event(event)
                                    yield event
                                    continue
                                result = event["result"].model_dump(
                                    mode="json", exclude_none=True
                                )
                                envelope, batches = await db_step(
                                    store.finish,
                                    conn,
                                    cid,
                                    owner,
                                    prepared["message"],
                                    prepared["facts"],
                                    prepared["input"].referenced_candidate,
                                    result,
                                )
                                break
                            else:
                                raise RuntimeError("Missing graph result")
            finally:

                def release():
                    with conn.begin():
                        conn.execute(
                            update(turns)
                            .where(
                                turns.c.conversation_id == cid,
                                turns.c.turn_id == str(message.turnId),
                                turns.c.status == "running",
                            )
                            .values(status="failed")
                        )

                await db_step(release)
    for batch in batches:
        yield batch
    if archive:
        archive.record("turn.result", result=envelope, batches=batches)
    yield {"type": "result", "result": envelope}
