"""Deliver the requirement decision or the checked candidate."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from form_agent.agent.authoring_state import CheckEvidence
from form_agent.business.form_authoring.contracts import (
    Answer,
    Blocked,
    CheckedDraft,
    Clarification,
    CompilationEvidence,
    Proposal,
    RequirementsUnmet,
    TurnResult,
    UnmetReport,
)
from form_agent.business.form_authoring.errors import InvalidCreateFormResult


def finish(result: object, checks: "CheckEvidence") -> TurnResult:
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
