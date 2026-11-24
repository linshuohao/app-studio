"""Request-local artifacts, read reuse, and trusted cross-turn restoration."""

from dataclasses import dataclass
from typing import Any, Literal, NotRequired

from pydantic import BaseModel, JsonValue

from form_agent.contracts import (
    Answer,
    Blocked,
    CheckReceipt,
    CreateFormInput,
)
from form_agent.create_form.state import (
    ChatReady,
    CheckEvidence,
    Composition,
    CreateFormState,
    PlaceholderEdit,
    ReadyToCompose,
    Understanding,
)
from form_agent.integrations.compiler import candidate_digest
from form_agent.integrations.dependencies import CreateFormTools

Action = Literal[
    "chat", "lookup", "understand", "compose", "check", "repair", "deliver"
]


class Lookup(BaseModel):
    source: Literal["protocol", "material", "pure_function", "host"]
    query: str


@dataclass(frozen=True)
class Observation:
    action: Action
    updates: dict[str, Any]


class AgentState(CreateFormState):
    action: NotRequired[Action]
    observation: NotRequired[Observation]
    observed: NotRequired[int]
    steps: NotRequired[int]
    lookup_request: NotRequired[Lookup]
    verify_candidate: NotRequired[str]
    check_only: NotRequired[bool]
    read_tools: NotRequired[CreateFormTools]
    facts: NotRequired[dict[str, JsonValue]]
    reply: NotRequired[Answer | Blocked]


def environment(request: CreateFormInput):
    keys = ("target", "knowledge_version", "check_environment")
    return {
        k: request.context.get(k)
        for k in keys
        if k != "check_environment" or k in request.context
    }


def current_failure(request: CreateFormInput) -> bool:
    failure = request.previous_failure
    return bool(
        failure
        and failure.context == environment(request)
        and failure.check.check_environment == request.context.get("check_environment")
    )


def working_check(request: CreateFormInput) -> CheckReceipt | None:
    check = request.previous_working_check
    if (
        check
        and request.referenced_candidate
        and check.candidate_digest == candidate_digest(request.referenced_candidate)
        and check.check_environment == request.context.get("check_environment")
    ):
        return check
    return None


def current_proposal(request: CreateFormInput) -> bool:
    review = request.previous_review
    text = request.referenced_candidate
    doc = request.requirements_document
    if not review or not text or not review.check.success or not doc:
        return False
    binding = review.binding_evidence
    return (
        review.check.candidate_digest == candidate_digest(text)
        and review.check.check_environment == request.context.get("check_environment")
        and review.trace.document_id == doc.document_id
        and review.trace.document_version == doc.version
        and (
            request.previous_standard is None
            or request.previous_standard == review.trace.standard
        )
        and (
            binding is None
            or (
                binding.target == request.context.get("target")
                and binding.knowledge_version
                == request.context.get("knowledge_version")
            )
        )
    )


def cached_tools(tools: CreateFormTools) -> CreateFormTools:
    """Bound to one turn with a single trusted context; cache only completed reads."""
    results: dict[tuple[str, str], JsonValue] = {}

    async def read(context, query):
        key = ("protocol", "")
        if key not in results:
            results[key] = await tools.read_protocol(context, query)
        return results[key]

    async def query(context, kind, term):
        key = (kind, term.strip())
        if key not in results:
            results[key] = await tools.query_capabilities(context, kind, term)
        return results[key]

    return CreateFormTools(read, query, tools.check_candidate)


def load_context(state: AgentState):
    request = state["request"]
    updates: dict[str, Any] = {
        "steps": 0,
        "observed": 0,
        "facts": {},
    }
    if request.previous_review and not current_proposal(request):
        request = request.model_copy(update={"previous_review": None})
        updates["request"] = request
    failure = request.previous_failure
    if not failure:
        return updates
    receipt = failure.check
    if (
        receipt.success
        or receipt.candidate_digest != candidate_digest(failure.candidate_text)
        or not receipt.diagnostics
    ):
        raise ValueError("Invalid failed candidate evidence")
    if not current_failure(request):
        checks = CheckEvidence(pending_candidate=failure.candidate_text)
    else:
        checks = CheckEvidence(
            receipts={receipt.candidate_digest: receipt},
            failed_text={receipt.candidate_digest: failure.candidate_text},
        )
    checks.configuration_mapping = failure.configuration_mapping
    updates["composition"] = Composition(
        None,
        checks,
        failure.binding_evidence,
        None if checks.pending_candidate is not None else receipt.candidate_digest,
    )
    if failure.scope:
        updates["placeholder_edit"] = PlaceholderEdit(
            failure.scope.path, failure.scope.value
        )
    decision = (
        ChatReady(kind="ready", requirements=failure.requirements)
        if failure.requirements
        else ReadyToCompose(kind="ready")
    )
    updates["understanding"] = Understanding(
        decision=decision, standard=request.previous_standard
    )
    return updates


def turn_tools(state: AgentState) -> CreateFormTools:
    tools = state.get("read_tools")
    if tools is None:
        raise ValueError("Turn context was not loaded")
    return tools
