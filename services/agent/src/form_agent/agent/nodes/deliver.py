import json

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
    DraftIssue,
    PartialDraft,
    Proposal,
    RepairContext,
    RepairScope,
    TurnResult,
)
from form_agent.business.form_authoring.delivery import finish
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.evidence import environment
from form_agent.business.form_authoring.requirements import RequirementsTrace


def limit_partial_draft(result: Blocked):
    # Match Platform's configText limit. Leave an oversized candidate in the
    # Agent checkpoint and preserve the original diagnostic.
    partial = result.partial_draft
    if partial is None:
        return
    try:
        too_large = len(partial.candidate_text.encode("utf-8")) > 64 * 1024
    except UnicodeError:
        too_large = True
    if too_large:
        result.partial_draft = None
        result.reason += " 当前草稿超出可打开的配置范围，请缩小表单后续修。"


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
    if isinstance(result, Blocked):
        if state["request"].context.get("formId"):
            result.partial_draft = None
        result.compose_checkpoint = (
            composition.compose_checkpoint if composition else None
        )
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
            digest = next(reversed(checks.failed_text))
        receipt = checks.receipts[digest]
        if isinstance(result, Blocked) and not state["request"].context.get("formId"):
            text = checks.failed_text[digest]
            # Only object-shaped definitions can be opened as editable form drafts.
            try:
                definition = json.loads(text)
            except (ValueError, RecursionError):
                definition = None
            if isinstance(definition, dict) and isinstance(
                definition.get("data"), dict
            ):
                issues = [
                    DraftIssue(
                        message=str(
                            diag.get("message") or diag.get("code") or result.reason
                        ),
                        sourcePointer=str(diag.get("sourcePointer") or ""),
                        requirementIds=[
                            mapping.requirement_id
                            for mapping in checks.configuration_mapping
                            if diag.get("sourcePointer")
                            and any(
                                str(diag["sourcePointer"]) == path
                                or str(diag["sourcePointer"]).startswith(path + "/")
                                for path in mapping.destinations
                            )
                        ],
                    )
                    for diag in receipt.diagnostics
                    if diag.get("severity") != "warning"
                ]
                result.partial_draft = PartialDraft(
                    candidate_text=text,
                    issues=issues or [DraftIssue(message=result.reason)],
                )
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
    if isinstance(result, Blocked):
        limit_partial_draft(result)
    return updates
