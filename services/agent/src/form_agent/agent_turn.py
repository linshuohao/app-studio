"""Unified Studio graph. Observed actions return to the same decision node."""

import json
from collections.abc import Awaitable, Callable
from dataclasses import replace
from functools import partial
from time import monotonic
from typing import Any

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from form_agent.contracts import (
    Answer,
    Blocked,
    CheckedDraft,
    Clarification,
    RepairContext,
    RepairScope,
)
from form_agent.create_form.nodes.compose.node import compose
from form_agent.create_form.nodes.deliver import deliver as deliver_creation
from form_agent.create_form.nodes.repair import repair
from form_agent.create_form.nodes.understand.node import understand
from form_agent.create_form.state import (
    ChatReady,
)
from form_agent.create_form.tools.check_candidate import check_draft
from form_agent.execution import (
    journal_tools,
    repair_rounds_before_execution,
    step,
    stream,
)
from form_agent.integrations.compiler import candidate_digest
from form_agent.integrations.dependencies import CreateFormTools
from form_agent.model_adapters import text_model
from form_agent.turn_routing import route
from form_agent.turn_state import (
    Action,
    AgentState,
    Observation,
    cached_tools,
    current_failure,
    current_proposal,
    environment,
    load_context,
    turn_tools,
    working_check,
)

MAX_REPAIR_ROUNDS = 10
MAX_CHECKS = MAX_REPAIR_ROUNDS + 1
TURN_RECURSION_LIMIT = 64 + 6 * MAX_REPAIR_ROUNDS


def turn_context(state: AgentState):
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


async def compose_candidate(state: AgentState, *, model):
    updates = await compose(
        state,
        model=model,
        tools=turn_tools(state),
        verify_candidate=state.get("verify_candidate"),
    )

    previous = state.get("composition")
    if state.get("verify_candidate") and previous:
        # Reuse this turn's exact receipt after refreshing coverage of the same
        # immutable candidate. Copy the attempt budget as well as the artifacts.
        checks = updates["composition"].checks
        checks.receipts.update(previous.checks.receipts)
        checks.passed_text.update(previous.checks.passed_text)
        checks.failed_text.update(previous.checks.failed_text)
        checks.attempted.update(previous.checks.attempted)
    return updates


async def lookup(state: AgentState):
    tools = turn_tools(state)
    search = state.get("lookup_request")
    if search is None:
        raise ValueError("Missing lookup request")
    context = state["request"].context
    result = await (
        tools.read_protocol(context, search.query)
        if search.source == "protocol"
        else tools.query_capabilities(context, search.source, search.query)
    )
    return {"facts": {**state.get("facts", {}), search.model_dump_json(): result}}


async def chat(state: AgentState, *, model: BaseChatModel):
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


async def check(state: AgentState, *, tools: CreateFormTools, max_checks: int):
    composition = state.get("composition")
    if composition is None:
        raise ValueError("Missing candidate")
    checks = composition.checks
    text = checks.pending_candidate
    if text is None:
        raise ValueError("No candidate submitted for check")
    checks.pending_candidate = None
    previous_rounds = repair_rounds_before_execution(len(state.get("repairs", [])))
    await check_draft(
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


async def repair_candidate(state: AgentState, *, model, max_checks):
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
                reason=f"第 {len(history)} 轮修复未取得进展：{history[-1].change}。剩余诊断：{json.dumps(detail, ensure_ascii=False)}",
            ),
        )
    return updates


def deliver(state: AgentState):
    if reply := state.get("reply"):
        return {"result": reply}
    updates = deliver_creation(state)
    result = updates["result"]
    composition = state.get("composition")
    reading = state.get("understanding")
    if (
        composition
        and reading
        and isinstance(result, (Clarification, Blocked))
        and composition.checks.failed_text
    ):
        checks = composition.checks
        digest = (
            state.get("repairs", [])[-1].after
            if state.get("repairs")
            else next(reversed(checks.failed_text))
        )
        if digest not in checks.failed_text:
            return updates
        edit = state.get("placeholder_edit")
        result.repair_context = RepairContext(
            candidate_text=checks.failed_text[digest],
            check=checks.receipts[digest],
            context=environment(state["request"]),
            needs_coverage=bool(
                state["request"].previous_failure
                and state["request"].previous_failure.needs_coverage
                and not state.get("verify_candidate")
            ),
            edit_instruction=(
                state["request"].previous_failure.edit_instruction
                if state["request"].previous_failure
                else state["request"].message
            ),
            configuration_mapping=checks.configuration_mapping,
            binding_evidence=composition.binding_evidence,
            requirements=reading.decision.requirements
            if isinstance(reading.decision, ChatReady)
            else [],
            scope=RepairScope(path=edit.path, value=edit.value) if edit else None,
        )
    return updates


def action_node(name: Action, run: Callable[[AgentState], Awaitable[dict]]):
    async def execute(state: AgentState):
        updates = await run(state)
        return {
            "steps": state.get("steps", 0) + 1,
            "observation": Observation(name, updates),
        }

    return execute


def observe(state: AgentState):
    step = state.get("steps", 0)
    event = state.get("observation")
    if event is None or step == state.get("observed", 0):
        return {}
    return {**event.updates, "observed": step}


def build_turn_graph(model: BaseChatModel, tools: CreateFormTools):
    tools = journal_tools(tools)
    graph = StateGraph(AgentState)
    restore_context = step("load_context", load_context)

    async def initialize(state: AgentState):
        updates = await restore_context(state)
        return {**updates, "read_tools": cached_tools(tools)}

    graph.add_node("load_context", initialize)
    graph.add_node("route", step("route", partial(route, model=model)))
    actions: dict[Action, Callable[[AgentState], Awaitable[dict]]] = {
        "chat": partial(chat, model=model),
        "lookup": lookup,
        "understand": partial(understand, model=model, task_intent=True),
        "compose": partial(compose_candidate, model=model),
        "check": partial(check, tools=tools, max_checks=MAX_CHECKS),
        "repair": partial(repair_candidate, model=model, max_checks=MAX_CHECKS),
    }
    for name, run in actions.items():
        graph.add_node(name, action_node(name, step(name, run)))
        graph.add_edge(name, "observe")
    graph.add_node("observe", step("observe", observe))
    graph.add_node("deliver", step("deliver", deliver))
    graph.add_edge(START, "load_context")
    graph.add_edge("load_context", "route")
    graph.add_conditional_edges("route", lambda s: s["action"], [*actions, "deliver"])
    graph.add_edge("observe", "route")
    graph.add_edge("deliver", END)
    return graph.compile()
