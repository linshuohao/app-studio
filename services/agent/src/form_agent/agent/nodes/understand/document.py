"""Decode complete document records and assemble the authoritative decision once."""

import json

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import HumanMessage

from form_agent.agent.authoring_state import DocumentUnderstanding
from form_agent.agent.nodes.understand.decision import validate_understanding
from form_agent.business.form_authoring.contracts import Answer
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.requirements import (
    Requirement,
    RequirementIssue,
)
from form_agent.execution.model_calls import stream, structured
from form_agent.integrations.models import text_model


async def read_document(model, messages, sources, *, task_intent=False):
    def validated(value):
        result = validate_understanding(value, sources)
        if task_intent and isinstance(result.decision, Answer):
            raise InvalidCreateFormResult(
                "A creation decision must be recorded as a task outcome"
            )
        return result

    try:
        result = await stream_document(model, messages, sources)
        return validated(result)
    except (ValueError, InvalidCreateFormResult):
        await adispatch_custom_event("understanding_reset", {})
        result = await structured(model, DocumentUnderstanding, messages)
        return validated(result)


async def stream_document(model, messages, sources):
    instruction = (
        "Return newline-delimited JSON, no Markdown. Emit each complete requirement immediately "
        'as {"requirement": Requirement}, each issue as {"issue": RequirementIssue}, '
        'then one final {"finish": {"decision": ..., "standard": {...}}}. In finish omit requirements '
        "and issues; they are assembled from prior lines. Use Chinese. Follow this schema: "
        + json.dumps(DocumentUnderstanding.model_json_schema(), ensure_ascii=False)
    )

    messages = [*messages, HumanMessage(content=instruction)]

    requirements, issues = [], []
    finish = None

    async def consume(line):
        nonlocal finish
        record = json.loads(line)
        if finish is not None or not isinstance(record, dict) or len(record) != 1:
            raise ValueError("Unexpected understanding record")
        if "finish" in record:
            finish = record["finish"]
            return
        if "requirement" in record:
            item = Requirement.model_validate(record["requirement"])
            if any(r.id == item.id for r in requirements):
                raise ValueError("Duplicate requirement")
            requirements.append(item)
            kind, text = "requirement", item.subject + "：" + item.behavior
        elif "issue" in record:
            item = RequirementIssue.model_validate(record["issue"])
            issues.append(item)
            kind, text = "question", item.detail
        else:
            raise ValueError("Unexpected understanding record type")
        for source in item.sources:
            if not source.quote.strip() or source.quote not in sources.get(
                source.source_id, ""
            ):
                raise ValueError("Invalid source excerpt")
        if isinstance(item, Requirement) or item.disposition == "ask_user":
            await adispatch_custom_event(
                "understanding_item", {"kind": kind, "text": text}
            )

    pending = ""
    async for chunk in stream(text_model(model), messages):
        pending += chunk.text
        while "\n" in pending:
            line, pending = pending.split("\n", 1)
            if line.strip():
                await consume(line)
    if pending.strip():
        await consume(pending)
    if not isinstance(finish, dict) or not isinstance(finish.get("standard"), dict):
        raise ValueError("Incomplete understanding")
    return DocumentUnderstanding.model_validate(
        {
            **finish,
            "standard": {
                **finish["standard"],
                "requirements": requirements,
                "issues": issues,
            },
        }
    )
