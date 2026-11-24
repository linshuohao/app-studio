"""Understand the current request before giving the model any authoring tools."""

import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from form_agent.contracts import Answer, CreateFormInput
from form_agent.create_form.errors import InvalidCreateFormResult
from form_agent.create_form.nodes.understand.clarification_patch import (
    update_clarification,
)
from form_agent.create_form.nodes.understand.decision import validate_understanding
from form_agent.create_form.nodes.understand.document import read_document
from form_agent.create_form.nodes.understand.revision import identify_placeholder_edit
from form_agent.create_form.prompts.understand import (
    DOCUMENT_INSTRUCTIONS,
    INSTRUCTIONS,
)
from form_agent.create_form.state import (
    ChatUnderstanding,
    CreateFormState,
    DocumentUnderstanding,
    ReadyToCompose,
    Understanding,
)
from form_agent.execution import structured


async def understand_request(
    request: CreateFormInput, model: BaseChatModel, *, task_intent=False
) -> Understanding:
    payload = request.model_dump(mode="json", exclude={"context", "previous_review"})
    source_texts = {"message": request.message}
    if request.requirements_document is not None:
        source_texts["document"] = request.requirements_document.markdown
        for index, message in enumerate(request.history):
            content = message.get("content", message.get("text"))
            if message.get("role") in ("user", "human") and isinstance(content, str):
                source = message.get("source_id")
                key = (
                    source
                    if isinstance(source, str) and source.startswith("turn:")
                    else f"history:{index}"
                )
                source_texts[key] = content
        # Pass the full document once; source_texts supplies the citation keys.
        payload["source_ids"] = list(source_texts)
        if request.previous_standard is not None:
            # The original remains available for validating every quoted source.
            payload["requirements_document"].pop("markdown")
            # A quote from the previous message now belongs to that turn in history.
            prior = payload["previous_standard"]
            for item in [*prior["requirements"], *prior["issues"]]:
                for source in item["sources"]:
                    if source["source_id"] == "message" and len(request.history) >= 2:
                        source["source_id"] = f"history:{len(request.history) - 2}"

            updated = await update_clarification(model, prior, request.message)
            if updated is not None:
                return validate_understanding(
                    DocumentUnderstanding(decision="create", standard=updated),
                    source_texts,
                )
            # Broader revisions need the authoritative source for the full-read path.
            payload["requirements_document"]["markdown"] = (
                request.requirements_document.markdown
            )
            payload["history"] = [
                {
                    "role": m.get("role"),
                    "source_id": m.get("source_id"),
                    "content": (
                        m.get("content")
                        if m.get("content") != request.requirements_document.markdown
                        else "[document]"
                    ),
                }
                for m in request.history
            ]
            payload["instruction"] = (
                "Update the previous standard using the new answer. Preserve established requirements and exact source quotes. Replace resolved issues."
            )
        elif request.message == request.requirements_document.markdown:
            payload["message"] = "[same as document]"
    messages = [
        SystemMessage(
            content=INSTRUCTIONS
            + ("\n\n" + DOCUMENT_INSTRUCTIONS if request.requirements_document else "")
            + (
                "\nRoute selected a creation task. Return a ready decision, an actionable business clarification, "
                "or a factual blocker. Preserve open decisions as task state. A free-form answer cannot represent this task."
                if task_intent
                else ""
            )
        ),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
    ]
    if request.requirements_document:
        return await read_document(
            model, messages, source_texts, task_intent=task_intent
        )
    result = await structured(model, ChatUnderstanding, messages)
    reading = validate_understanding(result, source_texts)
    if task_intent and isinstance(reading.decision, Answer):
        result = await structured(
            model,
            ChatUnderstanding,
            [
                *messages,
                HumanMessage(
                    content="Record the creation requirements or return the pending decision as clarification."
                ),
            ],
        )
        reading = validate_understanding(result, source_texts)
        if isinstance(reading.decision, Answer):
            raise InvalidCreateFormResult("Missing creation task outcome")
    return reading


async def understand(
    state: CreateFormState,
    *,
    model: BaseChatModel,
    task_intent: bool = False,
) -> dict:
    request = state["request"]
    revised = identify_placeholder_edit(request)
    if revised is not None and request.previous_review is not None:
        return {
            "placeholder_edit": revised,
            "understanding": Understanding(
                decision=ReadyToCompose(kind="ready"),
                standard=request.previous_review.trace.standard,
            ),
        }
    return {
        "understanding": await understand_request(
            request, model, task_intent=task_intent
        )
    }
