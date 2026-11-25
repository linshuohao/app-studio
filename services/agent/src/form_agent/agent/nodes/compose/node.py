"""Compose a candidate using Deep Agents' model, tool and correction loop."""

import json
from collections.abc import Awaitable, Callable

from deepagents import create_deep_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.language_models import BaseChatModel
from pydantic import JsonValue

from form_agent.agent.authoring_state import (
    CheckEvidence,
    Composition,
    FormAuthoringState,
    ReadyToCompose,
)
from form_agent.agent.middleware.authoring import (
    CandidateSubmitted,
    authoring_middleware,
)
from form_agent.agent.nodes.compose.prepare_binding import prepare_binding
from form_agent.agent.nodes.compose.reads import AuthoringReads
from form_agent.agent.prompts.compose import DOCUMENT_INSTRUCTIONS, INSTRUCTIONS
from form_agent.agent.tools.candidate_checks import (
    bind_candidate_submission_tool,
    submit_candidate,
)
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.agent.tools.query_capabilities import bind_query_capabilities
from form_agent.agent.tools.read_protocol import bind_read_protocol
from form_agent.agent.tools.record_configuration_mapping import (
    bind_record_configuration_mapping,
)
from form_agent.business.form_authoring.contracts import (
    Answer,
    BindingEvidence,
    CheckedDraft,
    Clarification,
    RequirementsUnmet,
    TurnInput,
)
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.requirements import StandardRequirements


async def compose_candidate(
    request: TurnInput,
    decision: ReadyToCompose,
    model: BaseChatModel,
    tools: AgentToolDependencies,
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
    submit_for_check = bind_candidate_submission_tool(checks, standard)

    async def verify_existing() -> JsonValue:
        """Submit the supplied unchanged candidate to the current target Compiler."""
        if verify_candidate is None:
            raise InvalidCreateFormResult("Missing candidate for verification")
        return await submit_for_check(verify_candidate)

    model_tools: list[Callable[..., Awaitable[JsonValue]]] = [
        bind_read_protocol(tools.read_protocol, request.context, reads, checks),
        catalog,
        verify_existing if verify_candidate is not None else submit_for_check,
    ]
    if standard is not None:
        model_tools.append(bind_record_configuration_mapping(standard, reads, checks))
    allowed_tools = {tool.__name__ for tool in model_tools}

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
        tools=model_tools,
        middleware=authoring_middleware(
            allowed_tools, reads, checks, project_results=standard is not None
        ),
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
    state: FormAuthoringState,
    *,
    model: BaseChatModel,
    tools: AgentToolDependencies,
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
