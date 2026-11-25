import json
from time import monotonic

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from form_agent.agent.state import TurnGraphState
from form_agent.business.form_authoring.contracts import (
    Answer,
)
from form_agent.business.form_authoring.evidence import (
    current_failure,
    current_proposal,
    working_check,
)
from form_agent.execution.model_calls import stream
from form_agent.integrations.models import text_model


def turn_context(state: TurnGraphState):
    request = state["request"]
    context = request.model_dump(
        mode="json",
        exclude={
            "context",
            "previous_failure",
            "previous_review",
            "previous_working_check",
        },
    )
    failure = request.previous_failure
    if failure:
        context["failed_candidate"] = failure.candidate_text
        if current_failure(request):
            context["diagnostics"] = failure.check.diagnostics
    if current_proposal(request) and request.previous_review:
        context["previous_check"] = request.previous_review.check.model_dump(
            mode="json"
        )
    if receipt := working_check(request):
        context["working_check"] = receipt.model_dump(mode="json")
    context["lookup_results"] = state.get("facts", {})
    return context


async def chat(state: TurnGraphState, *, model: BaseChatModel):
    messages = [
        SystemMessage(
            content="Answer the user's current question in their language. Use supplied evidence for claims about the current form. "
            "State missing facts when needed. A question during creation leaves the task and its open questions untouched. "
            "Return only the reply as plain text or Markdown."
        ),
        HumanMessage(content=json.dumps(turn_context(state), ensure_ascii=False)),
    ]
    await adispatch_custom_event("public_text_reset", {})
    answer = []
    batch = ""
    last_flush = None
    try:
        async for chunk in stream(text_model(model), messages, require_text=True):
            delta = chunk.text
            if not delta:
                continue
            answer.append(delta)
            batch += delta
            now = monotonic()
            if last_flush is None or len(batch) >= 128 or now - last_flush >= 0.25:
                await adispatch_custom_event("public_text", {"delta": batch})
                batch = ""
                last_flush = now
    except Exception:
        if batch:
            await adispatch_custom_event("public_text", {"delta": batch})
        raise
    if batch:
        await adispatch_custom_event("public_text", {"delta": batch})
    return {"reply": Answer(kind="answer", message="".join(answer))}
