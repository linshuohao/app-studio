"""One model-directed correction against the latest failed Compiler receipt."""

import json
from dataclasses import replace
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from form_agent.contracts import Blocked, Clarification
from form_agent.create_form.prompts.repair import BINDING_GUIDE, INSTRUCTIONS
from form_agent.create_form.state import CreateFormState, RepairRound
from form_agent.create_form.tools.check_candidate import (
    bind_repair_field,
    submit_candidate,
)
from form_agent.execution import repair_rounds_before_execution, structured
from form_agent.integrations.compiler import candidate_digest
from form_agent.integrations.dependencies import CreateFormTools


class TextEdit(BaseModel):
    kind: Literal["edit"]
    before: str = Field(min_length=1)
    after: str
    summary: str = Field(min_length=1)


class FieldEdit(BaseModel):
    kind: Literal["field"]
    schema_pointer: str
    property_schema_json: str
    summary: str = Field(min_length=1)


class CapabilityGap(BaseModel):
    kind: Literal["blocked"]
    reason: str = Field(min_length=1)


class BusinessQuestion(BaseModel):
    kind: Literal["clarification"]
    message: str = Field(min_length=1)
    questions: list[str] = Field(min_length=1)


class RepairDecision(BaseModel):
    action: TextEdit | FieldEdit | CapabilityGap | BusinessQuestion


async def repair(
    state: CreateFormState,
    *,
    model: BaseChatModel,
    tools: CreateFormTools,
    max_checks: int,
):
    composition = state.get("composition")
    reading = state.get("understanding")
    if composition is None or reading is None:
        raise ValueError("Repair requires a checked composition and requirements")
    checks = composition.checks
    digest = composition.failed_digest
    assert digest is not None
    receipt = checks.receipts[digest]
    text = checks.failed_text[digest]
    history = state.get("repairs", [])
    rounds_used = len(history) - repair_rounds_before_execution(len(history))
    request = state["request"]

    def stopped():
        diagnostics = "；".join(
            " ".join(
                str(d[k]) for k in ("code", "sourcePointer", "message") if d.get(k)
            )
            or json.dumps(d, ensure_ascii=False)
            for d in receipt.diagnostics
        )
        reason = f"本次已完成 {rounds_used} 轮修复，编译仍未通过。"
        if history:
            reason += f" 最后一轮：{history[-1].change}。"
        return Blocked(kind="blocked", reason=reason + " 剩余诊断：" + diagnostics)

    if rounds_used >= max_checks - 1:
        return {
            "composition": replace(composition, failed_digest=None, draft=stopped())
        }

    manual = state.get("repair_manual")
    if manual is None:
        manual = await tools.read_protocol(request.context, "")
    has_binding_error = any(
        d.get("code") in ("BINDING_INCOMPATIBLE", "BINDING_UNPROVEN")
        for d in receipt.diagnostics
    )
    materials = set()
    for diagnostic in receipt.diagnostics:
        locations = diagnostic.get("relatedLocations")
        if not isinstance(locations, list):
            continue
        for location in locations:
            pointer = location.get("pointer") if isinstance(location, dict) else None
            if isinstance(pointer, str):
                parts = pointer.split("/")
                if (
                    len(parts) >= 4
                    and parts[1] == "materials"
                    and parts[3] == "manifest"
                ):
                    materials.add(parts[2].replace("~1", "/").replace("~0", "~"))
    target_manifests = (
        await tools.query_capabilities(
            request.context, "material", " ".join(sorted(materials))
        )
        if materials
        else []
    )
    scope = state.get("placeholder_edit")
    payload = {
        "message": request.message,
        "conversation": request.history,
        "requirements": reading.model_dump(mode="json"),
        "mapping": [m.model_dump(mode="json") for m in checks.configuration_mapping],
        "original_edit_instruction": request.previous_failure.edit_instruction
        if request.previous_failure
        else request.message,
        "edit_scope": {"placeholder_path": scope.path, "requested_value": scope.value}
        if scope
        else request.message,
        "candidate": text,
        "receipt": receipt.model_dump(mode="json"),
        "manual": manual,
        "current_diagnostic_manifests": target_manifests,
        "capabilities": composition.catalog,
        "binding_evidence": composition.binding_evidence.model_dump(mode="json")
        if composition.binding_evidence
        else None,
        "previous_attempts": [
            {
                "change": r.change,
                "before": checks.receipts[r.before].diagnostics,
                "after": checks.receipts[r.after].diagnostics,
            }
            for r in history
        ],
    }
    decision = await structured(
        model,
        RepairDecision,
        [
            SystemMessage(
                content=INSTRUCTIONS
                + ("\n" + BINDING_GUIDE if has_binding_error else "")
            ),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
        ],
        method="function_calling",
    )
    if not isinstance(decision, RepairDecision):
        raise ValueError("Missing structured repair decision")
    action = decision.action
    if isinstance(action, (CapabilityGap, BusinessQuestion)):
        terminal = (
            Blocked(kind="blocked", reason=action.reason)
            if isinstance(action, CapabilityGap)
            else Clarification(
                kind="clarification", message=action.message, questions=action.questions
            )
        )
        return {"composition": replace(composition, failed_digest=None, draft=terminal)}

    next_digest = digest
    change = action.summary
    if scope:
        # The exact requested placeholder is already present. Any additional semantic
        # change on this shortcut needs a broader instruction from the user.
        return {
            "composition": replace(
                composition,
                failed_digest=None,
                draft=Clarification(
                    kind="clarification",
                    message="提示文字已按要求修改，重新编译仍未通过。",
                    questions=[
                        "是否允许扩大修改范围以处理编译诊断？ "
                        + json.dumps(receipt.diagnostics, ensure_ascii=False)
                    ],
                ),
            )
        }
    if isinstance(action, FieldEdit):
        field_tool = bind_repair_field(checks)
        result = await field_tool(
            digest, action.schema_pointer, action.property_schema_json
        )
        if isinstance(result, dict) and isinstance(result.get("candidate_digest"), str):
            next_digest = str(result["candidate_digest"])
            change = f"{action.summary}（{action.schema_pointer}）"
        else:
            change = f"未修改，字段替换未通过定位检查（{result}）"
    elif text.count(action.before) == 1:
        revision = text.replace(action.before, action.after, 1)
        submit_candidate(checks, revision)
        next_digest = candidate_digest(revision)
        change = f"{action.summary}（{action.before[:100]} → {action.after[:100]}）"
    else:
        change = "未修改，待替换原文未能唯一定位"
    if next_digest == digest and not change.startswith("未修改"):
        change = "未修改，候选原文相同"
    history = [*history, RepairRound(change, digest, next_digest)]
    return {
        "composition": replace(composition, draft=None, failed_digest=None),
        "repairs": history,
        "repair_manual": manual,
    }
