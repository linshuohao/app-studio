from form_agent.agent.state import TurnGraphState
from form_agent.agent.tools.turn_reads import turn_tools


async def lookup(state: TurnGraphState):
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
