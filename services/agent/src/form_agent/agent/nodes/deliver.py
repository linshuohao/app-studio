from form_agent.agent.authoring_state import (
    ChatReady,
    FormAuthoringState,
    ReadyToCompose,
)
from form_agent.agent.state import TurnGraphState
from form_agent.business.form_authoring.contracts import (
    Answer,
    Blocked,
    Clarification,
    Proposal,
    RepairContext,
    RepairScope,
    TurnResult,
)
from form_agent.business.form_authoring.delivery import finish
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.evidence import environment
from form_agent.business.form_authoring.requirements import RequirementsTrace


def deliver_creation(state: FormAuthoringState) -> dict[str, TurnResult]:
    reading = state.get("understanding")
    if reading is None:
        raise InvalidCreateFormResult("Delivery requires a requirement decision")
    composition = state.get("composition")
    if isinstance(reading.decision, ReadyToCompose):
        if composition is None:
            raise InvalidCreateFormResult("Delivery requires a composition result")
        result = finish(composition.draft, composition.checks)
        if isinstance(result, Proposal):
            result.binding_evidence = composition.binding_evidence
    else:
        result = reading.decision

    # Context and receipts on public DTOs are service-owned. Model-produced
    # text decisions can only contribute their human-readable content.
    if isinstance(result, (Clarification, Blocked, Answer)):
        result.repair_context = None
    if isinstance(result, Answer):
        result.check = None
    result.requirements_trace = None
    document = state["request"].requirements_document
    if document is not None and reading.standard is not None:
        result.requirements_trace = RequirementsTrace(
            document_id=document.document_id,
            document_version=document.version,
            standard=reading.standard,
            markdown=reading.standard.markdown(),
            configuration_mapping=composition.checks.configuration_mapping
            if composition
            else [],
        )
    return {"result": result}


def deliver(state: TurnGraphState):
    if reply := state.get("reply"):
        return {"result": reply}
    updates = deliver_creation(state)
    result = updates["result"]
    composition = state.get("composition")
    reading = state.get("understanding")
    if (
        composition
        and reading
        and isinstance(result, (Clarification, Blocked))
        and composition.checks.failed_text
    ):
        checks = composition.checks
        digest = (
            state.get("repairs", [])[-1].after
            if state.get("repairs")
            else next(reversed(checks.failed_text))
        )
        if digest not in checks.failed_text:
            return updates
        edit = state.get("placeholder_edit")
        result.repair_context = RepairContext(
            candidate_text=checks.failed_text[digest],
            check=checks.receipts[digest],
            context=environment(state["request"]),
            needs_coverage=bool(
                state["request"].previous_failure
                and state["request"].previous_failure.needs_coverage
                and not state.get("verify_candidate")
            ),
            edit_instruction=(
                state["request"].previous_failure.edit_instruction
                if state["request"].previous_failure
                else state["request"].message
            ),
            configuration_mapping=checks.configuration_mapping,
            binding_evidence=composition.binding_evidence,
            requirements=reading.decision.requirements
            if isinstance(reading.decision, ChatReady)
            else [],
            scope=RepairScope(path=edit.path, value=edit.value) if edit else None,
        )
    return updates
