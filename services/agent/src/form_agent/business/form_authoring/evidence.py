from form_agent.business.form_authoring.contracts import CheckReceipt, TurnInput
from form_agent.integrations.compiler import candidate_digest


def environment(request: TurnInput):
    keys = ("target", "knowledge_version", "check_environment")
    return {
        k: request.context.get(k)
        for k in keys
        if k != "check_environment" or k in request.context
    }


def current_failure(request: TurnInput) -> bool:
    failure = request.previous_failure
    return bool(
        failure
        and failure.context == environment(request)
        and failure.check.check_environment == request.context.get("check_environment")
    )


def working_check(request: TurnInput) -> CheckReceipt | None:
    check = request.previous_working_check
    if (
        check
        and request.referenced_candidate
        and check.candidate_digest == candidate_digest(request.referenced_candidate)
        and check.check_environment == request.context.get("check_environment")
    ):
        return check
    return None


def current_proposal(request: TurnInput) -> bool:
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
