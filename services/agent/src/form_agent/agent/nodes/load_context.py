from typing import Any

from form_agent.agent.authoring_state import (
    ChatReady,
    CheckEvidence,
    Composition,
    PlaceholderEdit,
    ReadyToCompose,
    Understanding,
)
from form_agent.agent.state import TurnGraphState
from form_agent.business.form_authoring.evidence import (
    current_failure,
    current_proposal,
)
from form_agent.integrations.compiler import candidate_digest


def load_context(state: TurnGraphState):
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
