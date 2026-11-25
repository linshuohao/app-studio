"""Select permitted actions from user intent and verified artifacts."""

import json
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from form_agent.agent.authoring_state import (
    CheckEvidence,
    Composition,
    ReadyToCompose,
    Understanding,
)
from form_agent.agent.nodes.understand.revision import identify_placeholder_edit
from form_agent.agent.state import Lookup, TurnGraphState
from form_agent.business.form_authoring.contracts import Blocked, CheckedDraft
from form_agent.business.form_authoring.evidence import (
    current_failure,
    current_proposal,
    working_check,
)
from form_agent.execution.model_calls import structured


class TurnDecision(BaseModel):
    action: Literal[
        "chat",
        "lookup",
        "understand",
        "compose",
        "check",
        "repair",
        "expand_repair",
        "resume_check",
        "present",
    ]
    lookup: Lookup | None = None


def routing_context(state: TurnGraphState):
    request = state["request"]
    previous = request.previous_standard
    failure = request.previous_failure
    history = request.history
    return {
        "message": request.message,
        "recent_dialogue": history[-12:],
        "has_document": request.requirements_document is not None,
        "existing_goal": previous.goal if previous else None,
        "open_questions": request.open_questions,
        "has_working_candidate": request.referenced_candidate is not None,
        "failed_candidate": failure.check.diagnostics
        if failure and current_failure(request)
        else None,
        "lookup_results": state.get("facts", {}),
    }


async def choose(model, schema, instructions, payload):
    picked = await structured(
        model,
        schema,
        [
            SystemMessage(content=instructions),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
        ],
        method="function_calling",
    )
    if not isinstance(picked, schema):
        raise ValueError("Missing structured model decision")
    return picked


async def route(state: TurnGraphState, *, model: BaseChatModel):
    request = state["request"]
    previous = state.get("observation")
    composition = state.get("composition")
    reading = state.get("understanding")
    if state.get("reply") is not None:
        return {"action": "deliver"}
    if previous and previous.action == "understand":
        return {
            "action": "compose"
            if reading and isinstance(reading.decision, ReadyToCompose)
            else "deliver"
        }
    if previous and previous.action in ("compose", "repair", "check") and composition:
        if composition.checks.pending_candidate is not None:
            return {"action": "check"}
        if (
            previous.action == "check"
            and isinstance(composition.draft, CheckedDraft)
            and request.previous_failure
            and request.previous_failure.needs_coverage
            and request.previous_standard
            and not state.get("verify_candidate")
        ):
            text = composition.checks.passed_text[composition.draft.candidate_digest]
            return {
                "action": "compose",
                "verify_candidate": text,
                "request": request.model_copy(
                    update={"referenced_candidate": text, "previous_review": None}
                ),
            }
        return {"action": "repair" if composition.failed_digest else "deliver"}

    if state.get("steps", 0) >= 18:
        return {
            "action": "deliver",
            "reply": Blocked(kind="blocked", reason="本轮执行额度已用完。"),
        }

    allowed = ["chat", "lookup", "understand"]
    if (
        current_proposal(request)
        and not request.open_questions
        and not request.previous_failure
    ):
        allowed.append("present")
    if request.referenced_candidate is not None or request.previous_failure:
        allowed.append("check")
    if composition:
        allowed.append(
            "resume_check"
            if composition.checks.pending_candidate is not None
            else "repair"
        )
    if (
        request.previous_failure
        and request.previous_failure.scope
        and current_failure(request)
        and request.open_questions
    ):
        allowed.append("expand_repair")
    usable_standard = request.previous_standard
    if (
        usable_standard
        and not request.open_questions
        and not any(i.blocking for i in usable_standard.issues)
    ):
        allowed.append("compose")
    edit = identify_placeholder_edit(request)
    if (
        edit
        and request.previous_review
        and current_proposal(request)
        and not request.previous_failure
    ):
        return {
            "action": "compose",
            "placeholder_edit": edit,
            "understanding": Understanding(
                decision=ReadyToCompose(kind="ready"),
                standard=request.previous_review.trace.standard,
            ),
        }
    choice: TurnDecision = await choose(
        model,
        TurnDecision,
        "Choose the next Studio action for this user message based on task facts, history and observations. "
        "Pure questions including explanations during creation go to chat; lookup only for missing protocol/catalog facts. "
        "The user's current goal takes precedence over the preceding conversation. A request to create a form AND ask about a "
        "business conflict first always enters understand so the pending decision persists. A question about an existing field without a change request is chat. "
        "Create/change requirements, new instructions, and answers to open decisions go to understand. "
        "Use compose only for explicit generation of unchanged complete prior requirements. "
        "Use check to report compilation of the exact working candidate when asked to check only. Use repair or resume_check only when authorized to fix or resume a failed candidate. "
        "Use present to show the same verified candidate on an explicit preview/show request. "
        "Use expand_repair only if answering a pending scope expansion question with explicit approval; continue or explain alone does not expand authority. "
        "If intent is ambiguous, chat asks a question. Select from allowed_actions. Lookup requires a source and query.",
        {**routing_context(state), "allowed_actions": allowed},
    )
    if choice.action not in allowed:
        raise ValueError("Action is unavailable under current task state")
    if (
        choice.action == "resume_check"
        and request.previous_failure
        and not current_failure(request)
    ):
        failure = request.previous_failure
        if failure.configuration_mapping or failure.binding_evidence:
            return {
                "action": "compose",
                "verify_candidate": failure.candidate_text,
                "request": request.model_copy(
                    update={
                        "referenced_candidate": failure.candidate_text,
                        "previous_review": None,
                    }
                ),
            }
        return {"action": "check"}
    if choice.action == "check":
        text = request.referenced_candidate
        if text is None and request.previous_failure:
            text = request.previous_failure.candidate_text
        if text is None:
            raise ValueError("Missing working candidate")
        checks = CheckEvidence(pending_candidate=text)
        if prior_check := working_check(request):
            checks.receipts[prior_check.candidate_digest] = prior_check
        if request.previous_review and current_proposal(request):
            receipt = request.previous_review.check
            checks.receipts[receipt.candidate_digest] = receipt
        if (
            request.previous_failure
            and current_failure(request)
            and request.previous_failure.candidate_text == text
        ):
            receipt = request.previous_failure.check
            checks.receipts[receipt.candidate_digest] = receipt
        return {
            "action": "check",
            "check_only": True,
            "composition": Composition(None, checks),
        }
    if choice.action == "expand_repair":
        failure = request.previous_failure
        assert failure is not None
        expanded = failure.model_copy(
            update={
                "scope": None,
                "edit_instruction": failure.edit_instruction + "\n" + request.message,
            }
        )
        return {
            "action": "repair",
            "placeholder_edit": None,
            "request": request.model_copy(update={"previous_failure": expanded}),
        }
    if choice.action == "present":
        prior = request.previous_review
        text = request.referenced_candidate
        assert prior is not None and text is not None
        digest = prior.check.candidate_digest
        checks = CheckEvidence(
            receipts={digest: prior.check},
            passed_text={digest: text},
            configuration_mapping=prior.trace.configuration_mapping,
        )
        draft = CheckedDraft(
            kind="proposal",
            candidate_digest=digest,
            summary="已恢复当前候选，可进入预览。",
        )
        return {
            "action": "deliver",
            "composition": Composition(draft, checks, prior.binding_evidence),
            "understanding": Understanding(
                decision=ReadyToCompose(kind="ready"), standard=prior.trace.standard
            ),
        }
    if choice.action == "lookup":
        if choice.lookup is None:
            raise ValueError("Lookup requires a source and query")
        if (
            choice.lookup.model_dump_json() in state.get("facts", {})
            or len(state.get("facts", {})) >= 4
        ):
            return {"action": "chat"}
        return {"action": "lookup", "lookup_request": choice.lookup}
    if choice.action == "compose":
        return {
            "action": "compose",
            "understanding": Understanding(
                decision=ReadyToCompose(kind="ready"), standard=usable_standard
            ),
        }
    if choice.action == "understand":
        return {
            "action": "understand",
            "composition": None,
            "placeholder_edit": None,
            "request": request.model_copy(
                update={
                    "referenced_candidate": request.previous_failure.candidate_text,
                    "previous_review": None,
                }
            )
            if request.previous_failure
            else request,
        }
    return {"action": choice.action}
