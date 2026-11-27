"""Run one conversation turn under its existing lock and journal scope."""

import asyncio
from contextlib import aclosing
from time import monotonic

from form_agent.agent.budgets import TURN_RECURSION_LIMIT
from form_agent.business.conversations.store import (
    StoreUnavailable,
    TurnJournal,
    db_step,
)
from form_agent.execution.errors import interruption_reason
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
    check_environment,
    timeout_seconds,
    callbacks,
    archive,
    stream_graph_events,
    record_interruption,
):
    if archive:
        archive.record(
            "turn.request", conversation_id=cid, message=message, resume=resume
        )
    async with store.exclusive(cid) as conn:
        prepared = await db_step(
            store.prepare, conn, cid, owner, message, check_environment
        )
        if "replay" in prepared:
            envelope = prepared["replay"]
            batches = []
            if archive:
                archive.record("turn.replay", result=envelope)
        else:
            journal = TurnJournal(conn, cid, str(message.turnId))
            started = monotonic()
            compiler_scope = prepared["compiler_scope"]
            try:
                if graph is None:
                    raise StoreUnavailable("Agent model or tools are unavailable")
                completed = (
                    await journal.completed_repair_rounds(compiler_scope)
                    if resume
                    else 0
                )
                if compiler_scope:
                    event = {
                        "type": "progress",
                        "message": "正在使用当前编译环境继续核对检查结果",
                    }
                    await journal.event(event)
                    yield event
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
                with execution_scope(
                    journal,
                    resume=resume,
                    compiler_scope=compiler_scope,
                    turn_deadline=monotonic() + timeout_seconds,
                ):
                    async with asyncio.timeout(timeout_seconds):
                        stream = stream_graph_events(
                            graph,
                            prepared["input"],
                            trace,
                            TURN_RECURSION_LIMIT + 6 * completed,
                            generate_conversation_title=prepared[
                                "generate_conversation_title"
                            ],
                            actor=owner,
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
                                    round((monotonic() - started) * 1000),
                                    event.get("conversation_title"),
                                )
                                break
                            else:
                                raise RuntimeError("Missing graph result")
            except (Exception, asyncio.CancelledError, GeneratorExit) as error:
                reason = (
                    "表单助手暂时不可用，请稍后继续。"
                    if isinstance(error, StoreUnavailable)
                    else interruption_reason(error)
                )
                record_interruption(reason)
                await journal.interrupt(
                    reason,
                    trace_id=str(trace),
                    elapsed_ms=round((monotonic() - started) * 1000),
                )
                raise
    for batch in batches:
        yield batch
    if archive:
        archive.record("turn.result", result=envelope, batches=batches)
    yield {"type": "result", "result": envelope}
