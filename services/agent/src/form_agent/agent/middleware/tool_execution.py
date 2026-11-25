"""Turn-local journal. Only trusted application types may be restored from JSON."""

from dataclasses import fields

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
        *(wrap(f.name, getattr(tools, f.name)) for f in fields(AgentToolDependencies))
    )
