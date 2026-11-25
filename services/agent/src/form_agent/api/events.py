from collections.abc import AsyncGenerator
from contextlib import aclosing
from typing import Any

from form_agent.agent.budgets import TURN_RECURSION_LIMIT

LABELS = {
    "route": "正在判断下一步",
    "chat": "正在回答问题",
    "lookup": "正在查阅资料",
    "understand": "正在理解需求",
    "compose": "正在生成候选",
    "deliver": "正在整理结果",
    "read_protocol": "正在读取配置手册",
    "query_capabilities": "正在查询物料和能力",
    "check": "正在编译检查候选",
    "repair": "正在根据编译诊断修复并复验",
    "record_configuration_mapping": "正在核对需求覆盖情况",
}


async def stream_graph_events(
    graph,
    request,
    trace,
    recursion_limit=TURN_RECURSION_LIMIT,
    *,
    callbacks=(),
    trace_metadata=None,
) -> AsyncGenerator[dict[str, Any], None]:
    config: dict[str, Any] = {
        "run_id": trace,
        "recursion_limit": recursion_limit,
        "run_name": "AgentTurn",
        "metadata": {"creation_trace_id": str(trace), **(trace_metadata or {})},
    }
    if callbacks:
        config["callbacks"] = list(callbacks)
    stream = graph.astream_events(
        {"request": request},
        version="v2",
        config=config,
    )
    async with aclosing(stream):
        async for event in stream:
            frame = project_public_event(event)
            if frame is not None:
                yield frame


def project_public_event(event):
    name, kind = event["name"], event["event"]
    if kind == "on_custom_event" and name in (
        "understanding_item",
        "understanding_reset",
        "compose_phase",
    ):
        return {"type": name, **event["data"]}
    elif kind == "on_custom_event" and name == "public_text":
        return {"type": "text_delta", "delta": event["data"]["delta"]}
    elif kind == "on_custom_event" and name == "public_text_reset":
        return {"type": "text_reset"}
    elif name in LABELS and kind in ("on_chain_start", "on_tool_start"):
        return {"type": "progress", "message": LABELS[name]}
    elif kind == "on_chain_end" and not event["parent_ids"]:
        return {
            "type": "private_result",
            "result": event["data"]["output"]["result"],
        }
