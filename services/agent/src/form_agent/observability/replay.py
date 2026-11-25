"""Turn-local journal. Only trusted application types may be restored from JSON."""

from langchain_core.runnables import RunnablePassthrough

_replay = RunnablePassthrough().with_config(run_name="journal.replay")


async def trace_replay(kind: str, key: str):
    await _replay.ainvoke({"kind": kind, "step_key": key})
