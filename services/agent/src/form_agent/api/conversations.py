"""Trusted Platform gateway for the Agent's private conversations."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from secrets import compare_digest
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update

from form_agent.agent_turn import TURN_RECURSION_LIMIT, build_turn_graph
from form_agent.conversations.model import Message, Owner
from form_agent.conversations.store import (
    ConversationConflict,
    ConversationStore,
    MissingConversation,
    StoreUnavailable,
    TurnJournal,
    db_step,
    turns,
)
from form_agent.execution import execution_scope


class ConversationTitle(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=60, pattern=r"^[^\x00\r\n]+$")


LABELS = {
    "route": "正在判断下一步",
    "chat": "正在回答问题",
    "lookup": "正在查阅资料",
    "understand": "正在理解需求",
    "compose": "正在生成候选",
    "deliver": "正在整理结果",
    "read_protocol": "正在读取配置手册",
    "query_capabilities": "正在查询物料和能力",
    "check": "正在编译检查候选",
    "repair": "正在根据编译诊断修复并复验",
    "record_configuration_mapping": "正在核对需求覆盖情况",
}


async def graph_events(
    graph, request, trace, recursion_limit=TURN_RECURSION_LIMIT
) -> AsyncIterator[dict[str, Any]]:
    async for event in graph.astream_events(
        {"request": request},
        version="v2",
        config={
            "run_id": trace,
            "recursion_limit": recursion_limit,
            "run_name": "AgentTurn",
            "metadata": {"creation_trace_id": str(trace)},
        },
    ):
        name, kind = event["name"], event["event"]
        if kind == "on_custom_event" and name in (
            "understanding_item",
            "understanding_reset",
        ):
            yield {"type": name, **event["data"]}
        elif kind == "on_custom_event" and name == "public_text":
            yield {"type": "text_delta", "delta": event["data"]["delta"]}
        elif kind == "on_custom_event" and name == "public_text_reset":
            yield {"type": "text_reset"}
        elif name in LABELS and kind in ("on_chain_start", "on_tool_start"):
            yield {"type": "progress", "message": LABELS[name]}
        elif kind == "on_chain_end" and not event["parent_ids"]:
            yield {
                "type": "private_result",
                "result": event["data"]["output"]["result"],
            }


def conversation_router(
    *,
    model,
    tools,
    service_token: str,
    store: ConversationStore,
    timeout_seconds: float,
):
    router = APIRouter(prefix="/internal/v1/conversations")
    graph = (
        build_turn_graph(model, tools)
        if model is not None and tools is not None
        else None
    )

    def actor(
        token: Annotated[str | None, Header(alias="X-Agent-Service-Token")] = None,
        user: Annotated[str | None, Header(alias="X-Agent-User")] = None,
        space: Annotated[str | None, Header(alias="X-Agent-Space")] = None,
    ):
        if (
            not token
            or not compare_digest(token.encode(), service_token.encode())
            or not user
            or not space
        ):
            raise HTTPException(401, "Missing service identity or actor")
        return Owner(user=user, space=space)

    @router.get("")
    async def listing(
        owner: Annotated[Owner, Depends(actor)],
        formId: str | None = None,
        workId: str | None = None,
        linkedDraftId: str | None = None,
    ):
        return await store.list(owner, formId, workId, linkedDraftId)

    @router.get("/{id}")
    async def show(
        id: UUID,
        owner: Annotated[Owner, Depends(actor)],
        formId: str | None = None,
        workId: str | None = None,
        linkedDraftId: str | None = None,
    ):
        return await store.get(str(id), owner, formId, workId, linkedDraftId)

    @router.get("/{id}/deliveries/{turn_id}")
    async def delivery(
        id: UUID, turn_id: UUID, owner: Annotated[Owner, Depends(actor)]
    ):
        return await store.delivery(str(id), str(turn_id), owner)

    @router.patch("/{id}")
    async def rename_conversation(
        id: UUID, data: ConversationTitle, owner: Annotated[Owner, Depends(actor)]
    ):
        return await store.rename(str(id), owner, data.title)

    @router.delete("/{id}", status_code=204)
    async def delete_conversation(id: UUID, owner: Annotated[Owner, Depends(actor)]):
        await store.remove(str(id), owner)
        return Response(status_code=204)

    @router.post("/{id}/turns")
    async def send(
        id: UUID,
        message: Message,
        owner: Annotated[Owner, Depends(actor)],
        accept: Annotated[str, Header()] = "",
        trace_id: Annotated[UUID | None, Header(alias="X-Trace-Id")] = None,
    ):
        return await run_turn(id, message, owner, accept, trace_id, resume=False)

    async def run_turn(id, message, owner, accept, trace_id, *, resume: bool):
        cid, trace = str(id), trace_id or uuid4()

        async def events():
            async with store.exclusive(cid) as conn:
                prepared = await db_step(store.prepare, conn, cid, owner, message)
                if "replay" in prepared:
                    envelope = prepared["replay"]
                    batches = []
                else:
                    journal = TurnJournal(conn, cid, str(message.turnId))
                    try:
                        if graph is None:
                            raise StoreUnavailable(
                                "Agent model or tools are unavailable"
                            )
                        completed = (
                            await journal.completed_repair_rounds() if resume else 0
                        )
                        with execution_scope(journal, resume=resume):
                            async with asyncio.timeout(timeout_seconds):
                                async for event in graph_events(
                                    graph,
                                    prepared["input"],
                                    trace,
                                    TURN_RECURSION_LIMIT + 6 * completed,
                                ):
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
            yield {"type": "result", "result": envelope}

        async def guarded() -> AsyncIterator[dict[str, Any]]:
            try:
                async for event in events():
                    yield event
            except Exception as error:
                status = (
                    503
                    if isinstance(error, StoreUnavailable)
                    else 404
                    if isinstance(error, MissingConversation)
                    else 409
                    if isinstance(error, ConversationConflict)
                    else 504
                    if isinstance(error, TimeoutError)
                    else 502
                )
                logging.getLogger("uvicorn.error").warning(
                    "Agent turn failed trace=%s type=%s", trace, type(error).__name__
                )
                yield {"type": "error", "status": status}

        if "application/x-ndjson" in accept:

            async def frames():
                async for event in guarded():
                    yield (
                        json.dumps({"traceId": str(trace), **event}, ensure_ascii=False)
                        + "\n"
                    )

            return StreamingResponse(frames(), media_type="application/x-ndjson")
        async for event in guarded():
            if event["type"] == "result":
                return event["result"]
            if event["type"] == "error":
                raise HTTPException(event["status"], "Conversation turn failed")

    @router.post("/{id}/turns/{turn_id}/resume")
    async def resume(
        id: UUID,
        turn_id: UUID,
        owner: Annotated[Owner, Depends(actor)],
        accept: Annotated[str, Header()] = "",
        trace_id: Annotated[UUID | None, Header(alias="X-Trace-Id")] = None,
    ):
        message = await store.saved_request(str(id), str(turn_id), owner)
        return await run_turn(id, message, owner, accept, trace_id, resume=True)

    return router
