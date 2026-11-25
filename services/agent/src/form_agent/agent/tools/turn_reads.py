from pydantic import JsonValue

from form_agent.agent.state import TurnGraphState
from form_agent.agent.tools.dependencies import AgentToolDependencies


def cached_tools(tools: AgentToolDependencies) -> AgentToolDependencies:
    """Bound to one turn with a single trusted context; cache only completed reads."""
    results: dict[tuple[str, str], JsonValue] = {}

    async def read(context, query):
        key = ("protocol", "")
        if key not in results:
            results[key] = await tools.read_protocol(context, query)
        return results[key]

    async def query(context, kind, term):
        key = (kind, term.strip())
        if key not in results:
            results[key] = await tools.query_capabilities(context, kind, term)
        return results[key]

    return AgentToolDependencies(read, query, tools.check_candidate, tools.check_schema)


def turn_tools(state: TurnGraphState) -> AgentToolDependencies:
    tools = state.get("read_tools")
    if tools is None:
        raise ValueError("Turn context was not loaded")
    return tools
