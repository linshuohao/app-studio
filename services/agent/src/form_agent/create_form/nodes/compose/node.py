"""Compose a candidate using Deep Agents' model, tool and correction loop."""

import json
from collections.abc import Awaitable, Callable

from deepagents import create_deep_agent
from langchain.agents.middleware import (
    ModelRequest,
    ModelResponse,
    ToolCallRequest,
    wrap_model_call,
    wrap_tool_call,
)
from langchain.agents.structured_output import ToolStrategy
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command
from pydantic import JsonValue

from form_agent.contracts import (
    Answer,
    BindingEvidence,
    CheckedDraft,
    Clarification,
    CreateFormInput,
    RequirementsUnmet,
)
from form_agent.create_form.errors import InvalidCreateFormResult
from form_agent.create_form.nodes.compose.prepare_binding import prepare_binding
from form_agent.create_form.nodes.compose.reads import AuthoringReads
from form_agent.create_form.nodes.compose.tool_journal import tool_response
from form_agent.create_form.prompts.compose import DOCUMENT_INSTRUCTIONS, INSTRUCTIONS
from form_agent.create_form.state import (
    CheckEvidence,
    Composition,
    CreateFormState,
    ReadyToCompose,
)
from form_agent.create_form.tools.check_candidate import (
    bind_check_candidate,
    submit_candidate,
)
from form_agent.create_form.tools.query_capabilities import bind_query_capabilities
from form_agent.create_form.tools.read_protocol import bind_read_protocol
from form_agent.create_form.tools.record_configuration_mapping import (
    bind_record_configuration_mapping,
)
from form_agent.execution import compose_response
from form_agent.integrations.dependencies import CreateFormTools
from form_agent.requirements import StandardRequirements


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


async def compose_candidate(
    request: CreateFormInput,
    decision: ReadyToCompose,
    model: BaseChatModel,
    tools: CreateFormTools,
    standard: StandardRequirements | None = None,
    verify_candidate: str | None = None,
) -> Composition:
    checks = CheckEvidence()
    reads = AuthoringReads()
    catalog = bind_query_capabilities(
        tools.query_capabilities, request.context, reads, checks
    )
    prepared = (
        await prepare_binding(model, standard, catalog, request.referenced_candidate)
        if standard
        else {}
    )
    submit_check = bind_check_candidate(checks, standard)

    async def verify_existing() -> JsonValue:
        """Submit the supplied unchanged candidate to the current target Compiler."""
        if verify_candidate is None:
            raise InvalidCreateFormResult("Missing candidate for verification")
        return await submit_check(verify_candidate)

    agent_tools: list[Callable[..., Awaitable[JsonValue]]] = [
        bind_read_protocol(tools.read_protocol, request.context, reads, checks),
        catalog,
        verify_existing if verify_candidate is not None else submit_check,
    ]
    if standard is not None:
        agent_tools.append(bind_record_configuration_mapping(standard, reads, checks))
    allowed_tools = {tool.__name__ for tool in agent_tools}

    class CandidateSubmitted(Exception):
        """The Graph now owns validation of the submitted candidate."""

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
                if standard is not None
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

    agent = create_deep_agent(
        model=model,
        system_prompt=INSTRUCTIONS
        + (
            "\n\n"
            + DOCUMENT_INSTRUCTIONS
            + "\nSchema draft and verified catalog evidence are already prepared in parallel. Start with the supplied schema_draft, preserve unaffected fields, align bound working values to the exact supplied manifests. Reuse supplied capability evidence, query only missing contracts. Read the protocol and then record the mapping."
            if standard is not None
            else ""
        )
        + (
            "\nRevalidate the supplied referenced_candidate exactly as it is under the current target. "
            "Read protocol and catalog and map its actual coverage. If it meets the requirements call verify_existing "
            "with no arguments. It checks the exact existing candidate. Return any capability gap or business "
            "decision if its coverage is insufficient."
            if verify_candidate is not None
            else ""
        ),
        tools=agent_tools,
        middleware=[form_tools_only, enforce_tool_scope],
        response_format=ToolStrategy[
            Clarification | Answer | RequirementsUnmet | CheckedDraft
        ](Clarification | Answer | RequirementsUnmet | CheckedDraft),
        name="create_form",
    )
    payload: dict[str, JsonValue]
    if standard is None:
        payload = request.model_dump(
            mode="json", exclude={"context", "requirements_document", "previous_review"}
        )
        payload["understanding"] = decision.model_dump(mode="json")
    else:
        payload = {
            "standard_requirements": standard.model_dump(mode="json"),
            **prepared,
        }
        if request.referenced_candidate is not None:
            payload["referenced_candidate"] = request.referenced_candidate
    try:
        state = await agent.ainvoke(
            {
                "messages": [
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}
                ]
            },
            config={"recursion_limit": 32},
        )
        draft = state.get("structured_response")
    except CandidateSubmitted:
        draft = None
    if checks.tool_failure is not None:
        raise checks.tool_failure
    version = request.context.get("knowledge_version")
    evidence = (
        BindingEvidence(
            target=str(request.context.get("target", "")),
            knowledge_version=version if isinstance(version, str) else None,
            capabilities=prepared["capabilities"],
        )
        if prepared
        else None
    )
    return Composition(
        draft,
        checks,
        evidence,
        None,
        [json.loads(raw) for _, raw in reads.catalog_results],
    )


async def compose(
    state: CreateFormState,
    *,
    model: BaseChatModel,
    tools: CreateFormTools,
    verify_candidate: str | None = None,
) -> dict[str, Composition]:
    reading = state.get("understanding")
    if reading is None or not isinstance(reading.decision, ReadyToCompose):
        raise InvalidCreateFormResult(
            "Composition requires a ready requirement decision"
        )
    edit = state.get("placeholder_edit")
    baseline = state["request"].referenced_candidate
    prior = state["request"].previous_review
    if (
        verify_candidate is None
        and edit is not None
        and prior is not None
        and baseline is not None
    ):
        form = json.loads(baseline)
        target = form
        for key in edit.path:
            target = target[key]
        target.setdefault("props", {})["placeholder"] = edit.value
        revision = json.dumps(form, ensure_ascii=False)
        checks = CheckEvidence(
            configuration_mapping=prior.trace.configuration_mapping,
        )
        submit_candidate(checks, revision)
        return {"composition": Composition(None, checks, prior.binding_evidence)}
    return {
        "composition": await compose_candidate(
            state["request"],
            reading.decision,
            model,
            tools,
            reading.standard,
            verify_candidate,
        )
    }
