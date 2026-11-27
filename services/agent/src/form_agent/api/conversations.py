"""Trusted Platform gateway for the Agent's private conversations."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from contextlib import aclosing
from secrets import compare_digest
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from form_agent.agent.graph import build_turn_graph
from form_agent.api.events import stream_graph_events
from form_agent.business.conversations.model import Message, Owner
from form_agent.business.conversations.store import (
    ConversationConflict,
    ConversationStore,
    MissingConversation,
    StoreUnavailable,
)
from form_agent.business.conversations.turns import run_turn_events
from form_agent.observability.raw_trace import RawTraceArchive


class ConversationTitle(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=60, pattern=r"^[^\x00\r\n]+$")


class ResumeContext(BaseModel, extra="forbid"):
    check_environment: str | None = Field(default=None, min_length=1)


def conversation_router(
    *,
    model,
    tools,
    service_token: str,
    store: ConversationStore,
    timeout_seconds: float,
    trace_callback_factory=None,
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

    async def run_turn(
        id, message, owner, accept, trace_id, *, resume: bool, check_environment=None
    ):
        cid, trace = str(id), trace_id or uuid4()
        callbacks = trace_callback_factory(trace) if trace_callback_factory else []
        archive = next(
            (item for item in callbacks if isinstance(item, RawTraceArchive)), None
        )
        reason = None

        def record_interruption(detail):
            nonlocal reason
            reason = detail

        async def guarded() -> AsyncGenerator[dict[str, Any], None]:
            try:
                async with aclosing(
                    run_turn_events(
                        store,
                        graph,
                        message,
                        owner,
                        cid,
                        trace,
                        resume=resume,
                        check_environment=check_environment,
                        timeout_seconds=timeout_seconds,
                        callbacks=callbacks,
                        archive=archive,
                        stream_graph_events=stream_graph_events,
                        record_interruption=record_interruption,
                    )
                ) as stream:
                    async for event in stream:
                        yield event
            except asyncio.CancelledError as error:
                if archive:
                    archive.record("turn.cancelled", error=error)
                raise
            except Exception as error:
                if archive:
                    archive.record("turn.error", error=error)
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
                    "Agent turn failed trace=%s conversation=%s turn=%s type=%s",
                    trace,
                    cid,
                    message.turnId,
                    type(error).__name__,
                )
                yield {
                    "type": "error",
                    "status": status,
                    **({"reason": reason} if reason else {}),
                }

        if "application/x-ndjson" in accept:

            async def frames():
                async with aclosing(guarded()) as stream:
                    async for event in stream:
                        yield (
                            json.dumps(
                                {"traceId": str(trace), **event}, ensure_ascii=False
                            )
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
        context: ResumeContext | None = None,
        accept: Annotated[str, Header()] = "",
        trace_id: Annotated[UUID | None, Header(alias="X-Trace-Id")] = None,
    ):
        message = await store.saved_request(str(id), str(turn_id), owner)
        return await run_turn(
            id,
            message,
            owner,
            accept,
            trace_id,
            resume=True,
            check_environment=context.check_environment if context else None,
        )

    return router
