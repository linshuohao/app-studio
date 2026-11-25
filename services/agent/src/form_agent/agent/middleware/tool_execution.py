"""Turn-local journal. Only trusted application types may be restored from JSON."""

from langchain_core.runnables import RunnableLambda

from form_agent.execution.codec import pack, unpack
from form_agent.execution.journal import call


def journal_tools(tools):
    from form_agent.agent.tools.dependencies import AgentToolDependencies

    def wrap(name, operation):
        async def execute(args):
            return await operation(*args)

        runnable = RunnableLambda(execute, name=f"platform.{name}")

        async def invoke(*args):
            return await call(
                "tool",
                {"name": name, "arguments": list(args)},
                lambda: runnable.ainvoke(list(args)),
                pack,
                unpack,
            )

        return invoke

    return AgentToolDependencies(
        read_protocol=wrap("read_protocol", tools.read_protocol),
        query_capabilities=wrap("query_capabilities", tools.query_capabilities),
        check_candidate=wrap("check_candidate", tools.check_candidate),
        check_schema=wrap("check_schema", tools.check_schema)
        if tools.check_schema
        else None,
    )
