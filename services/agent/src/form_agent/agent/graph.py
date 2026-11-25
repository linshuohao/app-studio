"""Unified Studio graph. Observed actions return to the same decision node."""

from collections.abc import Awaitable, Callable
from functools import partial

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, START, StateGraph

from form_agent.agent.budgets import MAX_CHECKS
from form_agent.agent.middleware.action import action_node
from form_agent.agent.middleware.tool_execution import journal_tools
from form_agent.agent.nodes.chat import chat
from form_agent.agent.nodes.check import check
from form_agent.agent.nodes.compose.action import compose_candidate
from form_agent.agent.nodes.deliver import deliver
from form_agent.agent.nodes.load_context import load_context
from form_agent.agent.nodes.lookup import lookup
from form_agent.agent.nodes.observe import observe
from form_agent.agent.nodes.repair import repair_candidate
from form_agent.agent.nodes.understand.node import understand
from form_agent.agent.routing import route
from form_agent.agent.state import Action, TurnGraphState
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.agent.tools.turn_reads import cached_tools
from form_agent.execution.journal import step


def build_turn_graph(model: BaseChatModel, tools: AgentToolDependencies):
    tool_dependencies = journal_tools(tools)
    graph = StateGraph(TurnGraphState)
    restore_context = step("load_context", load_context)

    async def initialize(state: TurnGraphState):
        updates = await restore_context(state)
        return {**updates, "read_tools": cached_tools(tool_dependencies)}

    graph.add_node("load_context", initialize)
    graph.add_node("route", step("route", partial(route, model=model)))
    actions: dict[Action, Callable[[TurnGraphState], Awaitable[dict]]] = {
        "chat": partial(chat, model=model),
        "lookup": lookup,
        "understand": partial(understand, model=model, task_intent=True),
        "compose": partial(compose_candidate, model=model),
        "check": partial(check, tools=tool_dependencies, max_checks=MAX_CHECKS),
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
