"""Decode complete document records and assemble the authoritative decision once."""

import json
import logging
from time import monotonic

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

COMPACT_OUTPUT = (
    "Use compact JSON records and omit fields whose values equal their schema defaults. "
    "Keep every independently enforceable field, behavior, threshold, exception, and "
    "source. For each field, use a short behavior label and put its specific meaning "
    "in the required field.description without repeating the label or separate rules. "
    "If a separate sourced rule already states a validation, use its rule_id on the "
    "field and do not restate the rule in field.validation. Keep field-local rules that "
    "have no separate rule. Use the smallest exact source excerpt(s) that support "
    "the whole record, including its conditions and exceptions. Keep additional excerpts "
    "when one alone is insufficient. Do not repeat previously emitted facts in finish."
)


async def read_document(model, messages, sources, *, task_intent=False, compact=False):
    started = monotonic()
    timing = {
        "profile": "compact" if compact else "baseline",
        "first_requirement_ms": None,
        "last_requirement_ms": None,
        "finish_record_ms": None,
        "stream_ms": None,
        "fallback_ms": None,
        "validation_ms": None,
        "outcome": "failed",
    }

    def validated(value):
        started_validation = monotonic()
        try:
            result = validate_understanding(value, sources)
            if task_intent and isinstance(result.decision, Answer):
                raise InvalidCreateFormResult(
                    "A creation decision must be recorded as a task outcome"
                )
            return result
        finally:
            timing["validation_ms"] = round(
                (timing["validation_ms"] or 0)
                + (monotonic() - started_validation) * 1000,
                3,
            )

    try:
        try:
            stream_started = monotonic()
            try:
                result = await stream_document(
                    model,
                    messages,
                    sources,
                    compact=compact,
                    timing=timing,
                    started=started,
                )
            finally:
                timing["stream_ms"] = round((monotonic() - stream_started) * 1000, 3)
            result = validated(result)
        except (ValueError, InvalidCreateFormResult) as error:
            timing["fallback_reason"] = type(error).__name__
            await adispatch_custom_event("understanding_reset", {})
            fallback_started = monotonic()
            try:
                result = await structured(model, DocumentUnderstanding, messages)
            finally:
                timing["fallback_ms"] = round(
                    (monotonic() - fallback_started) * 1000, 3
                )
            result = validated(result)
        timing["outcome"] = "validated"
        return result
    finally:
        timing["total_ms"] = round((monotonic() - started) * 1000, 3)
        logging.getLogger("uvicorn.error").info(
            "understanding_timing %s", json.dumps(timing)
        )


async def stream_document(
    model,
    messages,
    sources,
    *,
    compact=False,
    timing=None,
    started: float | None = None,
):
    started_at = monotonic() if started is None else started
    instruction = (
        "Return newline-delimited JSON, no Markdown. Emit each complete requirement immediately "
        'as {"requirement": Requirement}, each issue as {"issue": RequirementIssue}, '
        'then one final {"finish": {"decision": ..., "standard": {...}}}. In finish omit requirements '
        "and issues; they are assembled from prior lines. Use Chinese. Follow this schema: "
        + json.dumps(DocumentUnderstanding.model_json_schema(), ensure_ascii=False)
    )
    if compact:
        instruction += "\n" + COMPACT_OUTPUT

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
            if timing is not None:
                timing["finish_record_ms"] = round((monotonic() - started_at) * 1000, 3)
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
        if timing is not None and isinstance(item, Requirement):
            now = round((monotonic() - started_at) * 1000, 3)
            if timing["first_requirement_ms"] is None:
                timing["first_requirement_ms"] = now
            timing["last_requirement_ms"] = now
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
