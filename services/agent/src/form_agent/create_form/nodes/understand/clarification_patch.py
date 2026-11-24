"""Apply a local answer to an existing requirement without regenerating its neighbors."""

import json

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from form_agent.execution import structured
from form_agent.requirements import StandardRequirements


class RequirementEdit(BaseModel, extra="forbid"):
    requirement_id: str
    behavior: str
    field_value_type: str | None


class ClarificationPatch(BaseModel, extra="forbid"):
    needs_full_read: bool
    resolved_issue_indexes: list[int]
    edits: list[RequirementEdit]


async def update_clarification(model, prior, answer):
    questions = {
        i: issue
        for i, issue in enumerate(prior["issues"])
        if issue["disposition"] == "ask_user"
    }
    if not questions:
        return None
    related = {rid for q in questions.values() for rid in q["requirement_ids"]}
    # A document-wide question can still refer to a field by name.
    form_wide = any(not q["requirement_ids"] for q in questions.values())
    candidates = [r for r in prior["requirements"] if form_wide or r["id"] in related]
    patch = await structured(
        model,
        ClarificationPatch,
        [
            SystemMessage(
                content="Answer only the listed pending questions. Return only edits to affected existing requirements. Preserve previous confirmed behavior in the new behavior. Use field_value_type only if the business value type is confirmed. Resolve only fully answered issues. If the answer changes other requirements, scenarios, field metadata, scope, or needs new requirements, set needs_full_read=true. Do not guess."
            ),
            HumanMessage(
                content=json.dumps(
                    {
                        "answer": answer,
                        "questions": questions,
                        "requirements": candidates,
                        "scenarios": prior["scenarios"],
                        "assumptions": prior["assumptions"],
                    },
                    ensure_ascii=False,
                )
            ),
        ],
    )
    if (
        not isinstance(patch, ClarificationPatch)
        or patch.needs_full_read
        or not patch.edits
        or not patch.resolved_issue_indexes
    ):
        return None
    allowed = {r["id"]: r for r in candidates}
    if not set(patch.resolved_issue_indexes) <= questions.keys() or len(
        {e.requirement_id for e in patch.edits}
    ) != len(patch.edits):
        return None
    resolved = [questions[i]["requirement_ids"] for i in patch.resolved_issue_indexes]
    changed = {edit.requirement_id for edit in patch.edits}
    if any(ids and not changed.intersection(ids) for ids in resolved):
        return None
    if all(resolved) and not changed.issubset(set().union(*resolved)):
        return None
    for edit in patch.edits:
        row = allowed.get(edit.requirement_id)
        if (
            row is None
            or not edit.behavior.strip()
            or (edit.field_value_type and row["field"] is None)
        ):
            return None
    for edit in patch.edits:
        row = allowed[edit.requirement_id]
        row["behavior"] = edit.behavior
        if edit.field_value_type:
            row["field"]["value_type"] = edit.field_value_type
        row["sources"].append({"source_id": "message", "quote": answer})
    prior["issues"] = [
        q
        for i, q in enumerate(prior["issues"])
        if i not in patch.resolved_issue_indexes
    ]
    return StandardRequirements.model_validate(prior)
