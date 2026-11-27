"""One model-directed correction against the latest failed Compiler receipt."""

import json
from dataclasses import replace
from typing import Any, Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from form_agent.agent.authoring_state import FormAuthoringState, RepairRound
from form_agent.agent.events import emit_compose_phase
from form_agent.agent.nodes.compose.staged import repair_staged
from form_agent.agent.prompts.repair import BINDING_GUIDE, INSTRUCTIONS, SYNTAX_GUIDE
from form_agent.agent.state import TurnGraphState
from form_agent.agent.tools.candidate_checks import (
    bind_repair_field,
    submit_candidate,
)
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.agent.tools.turn_reads import turn_tools
from form_agent.business.form_authoring.contracts import (
    Blocked,
    Clarification,
)
from form_agent.execution.journal import repair_rounds_before_execution
from form_agent.execution.model_calls import structured
from form_agent.integrations.compiler import candidate_digest


class TextEdit(BaseModel):
    kind: Literal["edit"]
    before: str = Field(min_length=1)
    after: str
    summary: str = Field(min_length=1)


class SyntaxEdit(BaseModel):
    kind: Literal["syntax_edit"]
    delete_before: int = Field(ge=0, le=64)
    delete_after: int = Field(ge=0, le=64)
    replacement: str = Field(max_length=128)
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


class SyntaxRepairDecision(BaseModel):
    action: SyntaxEdit


def syntax_anchor(text: str, diagnostics: list[dict]) -> int | None:
    """Convert the Compiler's JavaScript UTF-16 offset to a Python string index."""
    for diagnostic in diagnostics:
        location = diagnostic.get("location")
        if diagnostic.get("code") != "JSON_SYNTAX" or not isinstance(location, dict):
            continue
        offset = location.get("offset")
        encoded = text.encode("utf-16-le")
        if type(offset) is not int or not 0 <= offset <= len(encoded) // 2:
            continue
        try:
            return len(encoded[: offset * 2].decode("utf-16-le"))
        except UnicodeDecodeError:
            continue
    return None


def diagnostic_summary(diagnostics: list[dict]) -> str:
    descriptions = []
    for diagnostic in diagnostics:
        parts = [
            str(diagnostic[key])
            for key in ("code", "sourcePointer", "message")
            if diagnostic.get(key)
        ]
        location = diagnostic.get("location")
        if (
            isinstance(location, dict)
            and location.get("line")
            and location.get("column")
        ):
            parts.append(f"（第 {location['line']} 行，第 {location['column']} 列）")
        descriptions.append(
            " ".join(parts) or json.dumps(diagnostic, ensure_ascii=False)
        )
    return "；".join(descriptions)


async def repair(
    state: FormAuthoringState,
    *,
    model: BaseChatModel,
    tools: AgentToolDependencies,
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
    has_syntax_error = any(d.get("code") == "JSON_SYNTAX" for d in receipt.diagnostics)
    anchor = syntax_anchor(text, receipt.diagnostics) if has_syntax_error else None

    def stopped():
        diagnostics = diagnostic_summary(receipt.diagnostics)
        reason = f"本次已完成 {rounds_used} 轮修复，编译仍未通过。"
        if history:
            reason += f" 最后一轮：{history[-1].change}。"
        return Blocked(kind="blocked", reason=reason + " 剩余诊断：" + diagnostics)

    if rounds_used >= max_checks - 1:
        return {
            "composition": replace(composition, failed_digest=None, draft=stopped())
        }
    await emit_compose_phase(
        "compile",
        "retrying",
        attempt=rounds_used + 2,
        detail="正在根据编译诊断修复候选。",
    )

    if (
        not has_syntax_error
        and state.get("placeholder_edit") is None
        and reading.standard is not None
        and composition.binding_evidence is not None
        and composition.binding_evidence.schema_check is not None
    ):
        return await repair_staged(state, model, tools)

    manual = state.get("repair_manual")
    if manual is None and anchor is None:
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
    decision_schema = RepairDecision
    instructions = INSTRUCTIONS + ("\n" + BINDING_GUIDE if has_binding_error else "")
    if anchor is not None:
        decision_schema = SyntaxRepairDecision
        instructions = SYNTAX_GUIDE
        payload = {
            "receipt": payload["receipt"],
            "syntax_anchor": {
                "before": text[max(0, anchor - 64) : anchor],
                "after": text[anchor : anchor + 64],
            },
        }
    decision = await structured(
        model,
        decision_schema,
        [
            SystemMessage(content=instructions),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
        ],
        method="function_calling",
    )
    if not isinstance(decision, decision_schema):
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
    if isinstance(action, SyntaxEdit):
        if (
            anchor is not None
            and action.delete_before <= anchor
            and anchor + action.delete_after <= len(text)
        ):
            revision = (
                text[: anchor - action.delete_before]
                + action.replacement
                + text[anchor + action.delete_after :]
            )
            submit_candidate(checks, revision)
            next_digest = candidate_digest(revision)
        else:
            change = "未修改，语法修复超出编译器标记的原文范围"
    elif isinstance(action, FieldEdit):
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


async def repair_candidate(state: TurnGraphState, *, model, max_checks):
    tools = turn_tools(state)
    composition = state.get("composition")
    if composition is None:
        raise ValueError("Missing candidate")
    updates: dict[str, Any] = dict(
        await repair(state, model=model, tools=tools, max_checks=max_checks)
    )
    history = updates.get("repairs", [])
    if history and history[-1].after in {attempt.before for attempt in history}:
        composition.checks.pending_candidate = None
        detail = composition.checks.receipts[history[-1].after].diagnostics
        updates["composition"] = replace(
            composition,
            failed_digest=None,
            draft=Blocked(
                kind="blocked",
                reason=f"第 {len(history)} 轮修复未取得进展：{history[-1].change}。剩余诊断：{diagnostic_summary(detail)}",
            ),
        )
    return updates
