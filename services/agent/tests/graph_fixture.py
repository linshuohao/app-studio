"""Exercise the private graph directly with scripted tools; HTTP is tested separately."""

import asyncio
import json
from uuid import uuid4

from httpx import Response

from form_agent.agent_turn import TURN_RECURSION_LIMIT, build_turn_graph
from form_agent.api.conversations import graph_events
from form_agent.contracts import CreateFormInput


async def run_graph(request, model, tools):
    graph = build_turn_graph(model, tools)
    state = await graph.ainvoke(
        {"request": request}, config={"recursion_limit": TURN_RECURSION_LIMIT}
    )
    return state["result"]


def graph_response(request, model, tools, stream=False):
    trace = uuid4()

    async def collect():
        graph = build_turn_graph(model, tools)
        events = []
        async for frame in graph_events(
            graph, CreateFormInput.model_validate(request), trace
        ):
            if frame["type"] == "private_result":
                result = frame["result"].model_dump(mode="json", exclude_none=True)
                if not stream:
                    return Response(200, json=result)
                frame = {"type": "result", "result": result}
            events.append(
                json.dumps({**frame, "traceId": str(trace)}, ensure_ascii=False)
            )
        return Response(200, text="\n".join(events))

    try:
        return asyncio.run(collect())
    except Exception as error:
        return Response(502, text=f"{type(error).__name__}: {error}")
