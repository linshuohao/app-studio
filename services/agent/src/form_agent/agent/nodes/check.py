from dataclasses import replace

from form_agent.agent.state import TurnGraphState
from form_agent.agent.tools.candidate_checks import compile_candidate
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.business.form_authoring.contracts import (
    Answer,
    CheckedDraft,
    RepairContext,
)
from form_agent.business.form_authoring.evidence import current_failure, environment
from form_agent.execution.journal import repair_rounds_before_execution
from form_agent.integrations.compiler import candidate_digest


async def check(
    state: TurnGraphState, *, tools: AgentToolDependencies, max_checks: int
):
    composition = state.get("composition")
    if composition is None:
        raise ValueError("Missing candidate")
    checks = composition.checks
    text = checks.pending_candidate
    if text is None:
        raise ValueError("No candidate submitted for check")
    checks.pending_candidate = None
    previous_rounds = repair_rounds_before_execution(len(state.get("repairs", [])))
    await compile_candidate(
        text,
        state["request"].context,
        tools.check_candidate,
        checks,
        max_checks + previous_rounds,
    )
    receipt = checks.receipts[candidate_digest(text)]
    if state.get("check_only"):
        detail = (
            "当前工作稿已通过编译检查。"
            if receipt.success
            else "当前工作稿编译未通过。"
            + "；".join(
                str(d.get("message") or d.get("code")) for d in receipt.diagnostics
            )
        )
        recover = None
        if not receipt.success:
            prior = state["request"].previous_failure
            if prior and prior.candidate_text == text:
                recover = prior.model_copy(
                    update={
                        "check": receipt,
                        "context": environment(state["request"]),
                        "needs_coverage": prior.needs_coverage
                        or not current_failure(state["request"]),
                    }
                )
            else:
                recover = RepairContext(
                    candidate_text=text,
                    check=receipt,
                    context=environment(state["request"]),
                    configuration_mapping=[],
                    needs_coverage=state["request"].previous_standard is not None,
                )
        return {
            "reply": Answer(
                kind="answer", message=detail, check=receipt, repair_context=recover
            )
        }
    history = state.get("repairs", [])
    draft = None
    if receipt.success:
        detail = history[-1].change if history else "表单候选已生成"
        deferred = [
            m.detail
            for m in checks.configuration_mapping
            if m.status == "deferred_to_host"
        ]
        summary = detail + "。整表已通过编译，可进入预览。"
        if deferred:
            summary += " 待 Host 集成与验证：" + "；".join(deferred)
        draft = CheckedDraft(
            kind="proposal", candidate_digest=receipt.candidate_digest, summary=summary
        )
    return {
        "composition": replace(
            composition,
            draft=draft,
            failed_digest=None if draft else receipt.candidate_digest,
        )
    }
