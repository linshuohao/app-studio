"""Compose a candidate using Deep Agents' model, tool and correction loop."""

from collections.abc import Awaitable, Callable

from langchain.agents.middleware import (
    ModelRequest,
    ModelResponse,
    ToolCallRequest,
    wrap_model_call,
    wrap_tool_call,
)
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command

from form_agent.agent.middleware.authoring_tool_replay import tool_response
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.execution.model_calls import compose_response


class CandidateSubmitted(Exception):
    """The Graph now owns validation of the submitted candidate."""


def project_tool_results(messages, checks):
    """Keep tool-call pairing intact. Full evidence stays in this invocation's history."""
    results = []
    manifest_kinds = set()
    calls = {
        call["id"]: call for msg in messages for call in getattr(msg, "tool_calls", [])
    }
    for msg in messages:
        if isinstance(msg, ToolMessage) and msg.name == "query_capabilities":
            args = calls.get(msg.tool_call_id, {}).get("args", {})
            if args.get("query") and "already_returned" not in str(msg.content):
                manifest_kinds.add(args.get("kind"))
    manuals = [
        m for m in messages if isinstance(m, ToolMessage) and m.name == "read_protocol"
    ]
    for msg in messages:
        if isinstance(msg, ToolMessage):
            args = calls.get(msg.tool_call_id, {}).get("args", {})
            omit = (
                msg.name == "read_protocol"
                and (
                    msg is not manuals[-1]
                    or checks.passed_text
                    or (not checks.configuration_mapping and len(manuals) == 1)
                )
            ) or (
                msg.name == "query_capabilities"
                and (
                    checks.passed_text
                    or (not args.get("query") and args.get("kind") in manifest_kinds)
                )
            )
            if omit:
                msg = msg.model_copy(
                    update={
                        "content": "Evidence retained. Full protocol is shown at authoring; call read_protocol again if needed for mapping."
                    }
                )
        results.append(msg)
    return results


def authoring_middleware(allowed_tools, reads, checks, *, project_results):
    @wrap_model_call
    async def form_tools_only(
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        if checks.tool_failure:
            raise checks.tool_failure
        if checks.pending_candidate is not None:
            raise CandidateSubmitted
        return await compose_response(
            handler,
            request.override(
                messages=project_tool_results(request.messages, checks)
                if project_results
                else request.messages,
                tools=[
                    tool
                    for tool in request.tools
                    if isinstance(tool, BaseTool) and tool.name in allowed_tools
                ],
            ),
        )

    @wrap_tool_call
    async def enforce_tool_scope(
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[str]]],
    ) -> ToolMessage | Command[str]:
        if request.tool_call["name"] not in allowed_tools:
            raise InvalidCreateFormResult("Tool is outside the CreateForm scope")
        return await tool_response(request, handler, reads, checks)

    return [form_tools_only, enforce_tool_scope]
