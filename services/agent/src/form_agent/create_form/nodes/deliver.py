"""Deliver the requirement decision or the checked candidate."""

from form_agent.contracts import (
    Answer,
    CompilationEvidence,
    RequirementsUnmet,
    UnmetReport,
    Blocked,
    CheckedDraft,
    Clarification,
    CreateFormResult,
    Proposal,
)
from form_agent.create_form.errors import InvalidCreateFormResult
from form_agent.create_form.state import CheckEvidence, CreateFormState, ReadyToCompose
from form_agent.requirements import RequirementsTrace


def deliver(state: CreateFormState) -> dict[str, CreateFormResult]:
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


def finish(result: object, checks: "CheckEvidence") -> CreateFormResult:
    if isinstance(result, RequirementsUnmet):
        receipt = next(reversed(checks.receipts.values()), None)
        verification = CompilationEvidence(compilation="unverified")
        if checks.mapping_check_blocked:
            verification.checkCode = "ready_configuration_mapping_required"
        elif receipt is not None:
            verification.compilation = "passed" if receipt.success else "failed"
            verification.candidateDigest = receipt.candidate_digest
        return UnmetReport(**result.model_dump(), verification=verification)
    if isinstance(result, CheckedDraft):
        receipt = checks.receipts.get(result.candidate_digest)
        text = checks.passed_text.get(result.candidate_digest)
        if receipt is None or not receipt.success or text is None:
            raise InvalidCreateFormResult(
                "Proposal requires a successful check of its exact text"
            )
        return Proposal(
            kind=result.kind, candidate_text=text, summary=result.summary, check=receipt
        )
    if isinstance(result, (Clarification, Answer, Blocked)):
        return result
    raise InvalidCreateFormResult("CreateForm returned no structured result")
