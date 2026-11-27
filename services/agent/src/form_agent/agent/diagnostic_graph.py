"""Read-only form-error investigation and controlled replay."""

import json
from typing import NotRequired, TypedDict

from langchain_core.runnables.config import ensure_config
from langgraph.graph import END, START, StateGraph

from form_agent.agent.state import TurnGraphState
from form_agent.business.conversations.model import Owner
from form_agent.business.conversations.references import DiagnosticReference
from form_agent.business.form_authoring.contracts import (
    Answer,
    AssetRepairReview,
    DiagnosticRepairReview,
)
from form_agent.execution.journal import call
from form_agent.integrations.diagnostic_replay import (
    BlockedConditionRepair,
    ReplayDiagnostic,
    ReplayOutcome,
    Reproduced,
    VerifiedConditionRepair,
    replay_outcome,
)


class DiagnosticState(TypedDict):
    reference: DiagnosticReference
    location: NotRequired[str]
    replay: NotRequired[ReplayOutcome]
    result: NotRequired[Answer]


def diagnostic_reference(state: TurnGraphState):
    return next(
        (
            ref
            for ref in state["request"].references
            if isinstance(ref, DiagnosticReference)
        ),
        None,
    )


def locate(state: DiagnosticState):
    reference = state["reference"]
    return {"location": reference.targetId or "事件未记录可定位的规则或物料"}


def report(state: DiagnosticState):
    reference = state["reference"]
    location = state.get("location")
    assert location is not None
    evidence = {
        "captured": "提交时原始现场可用，等待受控复现。",
        "expired": "原始现场已过期。",
        "missing": "本次错误未保存原始现场。",
        "too_large": "原始现场超过上报大小限制。",
        "serialization_failed": "原始现场序列化失败。",
    }[reference.evidenceStatus]
    outcome = state.get("replay")
    if outcome is None:
        verdict = f"{evidence} 当前只有事件定位证据，尚未复现或确认根因。"
    else:
        verdict = {
            "same_condition_failure": "已用原发布的配置、匹配的函数制品和错误当刻的输入重新求值，得到相同的联动条件异常。该结果只覆盖这一条件，业务根因仍待判断。",
            "condition_failure_differed": "已重新求值，未得到相同的联动条件异常。仍需核对最初的运行环境及触发链路。",
            "evidence_unavailable": "原始现场已不可用，无法复现。",
            "unsupported_phase": "当前执行器仅支持复现联动条件错误。这个阶段需要补充相应的复现能力。",
            "evidence_mismatch": "原始现场与发布产物或记录的失败步骤不一致，无法复现。",
            "condition_budget_exceeded": "联动条件展开后超过执行器的求值预算，无法复现。",
            "unsupported_input": "执行器无法还原该条件所需的输入状态，无法复现。",
            "environment_unavailable": "发布要求的制品或兼容执行环境不可用，无法复现。",
            "executor_unavailable": "本次无法取得复现执行结果，可重新发起调查。",
        }[outcome.reason]
    repair = outcome.repair if isinstance(outcome, Reproduced) else None
    review = None
    if isinstance(repair, VerifiedConditionRepair):
        if repair.candidateDigest:
            review = DiagnosticRepairReview(
                diagnosticId=reference.diagnosticId,
                formId=reference.formId,
                releaseId=reference.releaseId,
                versionId=reference.versionId,
                candidateDigest=repair.candidateDigest,
            )
        verdict = (
            "复现得到相同的联动条件异常。原规则先执行除法，随后才检查除数是否为零。"
        )
        pointer = repair.pointer
        patch = [
            {"op": "move", "from": pointer + "/args/1", "path": pointer + "/args/0"}
        ]
        verdict += (
            "\n\n**配置修复候选**\n\n"
            "把原规则已有的非零检查移到除法之前。候选已用原发布的构建输入编译，"
            "用同一条保存的现场重跑时，条件返回 false。"
            f"补丁基于配置版本 `{reference.versionId}`，供审查确认。"
            "\n\n```json\n" + json.dumps(patch, indent=2) + "\n```"
        )
    elif isinstance(repair, BlockedConditionRepair):
        verdict += {
            "original_build_unavailable": "\n\n原版本的配置或构建环境不可用，无法验证修复候选。",
            "candidate_check_failed": "\n\n候选未通过编译或原样本复验，暂不交付补丁。",
        }[repair.reason]
    asset_review = None
    if not isinstance(repair, VerifiedConditionRepair) and reference.assetCandidates:
        asset_review = AssetRepairReview(
            diagnosticId=reference.diagnosticId,
            candidates=reference.assetCandidates,
        )
        verdict += (
            "\n\n原发布锁中已定位到关联资产。维护者可选择资产，创建任务交给开发核查。"
        )
    return {
        "result": Answer(
            kind="answer",
            diagnosticRepair=review,
            assetRepair=asset_review,
            message=(
                f"已定位到发布版本 `{reference.releaseId}` 的错误 `{reference.errorCode}`"
                f"（阶段 `{reference.phase}`）。\n\n"
                f"失败位置：{location}。配置版本：`{reference.versionId}`。\n\n"
                f"{verdict}"
            ),
        )
    }


def build_diagnostic_graph(replay_diagnostic: ReplayDiagnostic | None = None):
    async def replay(state: DiagnosticState):
        config = ensure_config().get("configurable") or {}
        actor = config.get("diagnostic_actor")
        executor = replay_diagnostic
        if executor is None or not isinstance(actor, Owner):
            return {}
        reference = state["reference"]
        outcome = await call(
            "diagnostic.replay",
            {"diagnosticId": reference.diagnosticId, "releaseId": reference.releaseId},
            lambda: executor(reference, actor.user, actor.space),
            lambda value: value.model_dump(mode="json", exclude_none=True),
            replay_outcome.validate_python,
        )
        return {"replay": outcome}

    graph = StateGraph(DiagnosticState)
    graph.add_node("locate", locate)
    graph.add_node("replay", replay)
    graph.add_node("report", report)
    graph.add_edge(START, "locate")
    graph.add_edge("locate", "replay")
    graph.add_edge("replay", "report")
    graph.add_edge("report", END)
    return graph.compile()
