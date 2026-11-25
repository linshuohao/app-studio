"""Turn-local journal. Only trusted application types may be restored from JSON."""

import inspect
import json
from collections.abc import Awaitable, Callable
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Protocol

from form_agent.execution.codec import pack, unpack
from form_agent.observability.replay import trace_replay


class ExecutionJournal(Protocol):
    async def begin(self, key: str, kind: str, request: dict) -> dict | None: ...
    async def finish(self, key: str, value: Any) -> None: ...
    async def partial(self, key: str, text: str) -> None: ...
    async def failure(self, key: str, payload: dict) -> None: ...


_journal = ContextVar[ExecutionJournal | None]("execution_journal", default=None)
_step = ContextVar[tuple[str, dict[str, int]]]("execution_step")


@dataclass
class RepairBudget:
    previous_rounds: int | None


_repair_budget = ContextVar[RepairBudget | None]("repair_budget", default=None)


def repair_rounds_before_execution(completed_rounds: int) -> int:
    budget = _repair_budget.get()
    if budget is None:
        return 0
    if budget.previous_rounds is None:
        budget.previous_rounds = completed_rounds
    return budget.previous_rounds


@contextmanager
def execution_scope(journal: ExecutionJournal, *, resume: bool = False):
    token = _journal.set(journal)
    budget_token = _repair_budget.set(RepairBudget(None if resume else 0))
    try:
        yield
    finally:
        _repair_budget.reset(budget_token)
        _journal.reset(token)


def step(name: str, run: Callable[..., Any]):
    async def execute(state) -> dict[str, Any]:
        journal = _journal.get()
        if journal is None:
            result = run(state)
            return await result if inspect.isawaitable(result) else result
        key = f"{state.get('steps', 0)}:{name}"
        previous = await journal.begin(key, "step", {"name": name})
        if previous is not None:
            await trace_replay("step", key)
            return unpack(previous["value"])
        context = _step.set((key, {}))
        try:
            result = run(state)
            if inspect.isawaitable(result):
                result = await result
            await journal.finish(key, pack(result))
            return result
        finally:
            _step.reset(context)

    return execute


def _key(kind, request):
    step_key, occurrences = _step.get()
    digest = sha256(
        json.dumps(request, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    prefix = f"{step_key}/{kind}:{digest}"
    occurrence = occurrences.get(prefix, 0)
    occurrences[prefix] = occurrence + 1
    return f"{prefix}:{occurrence}"


async def call(
    kind: str, request: dict, run: Callable[[], Awaitable[Any]], encode, decode
) -> Any:
    journal = _journal.get()
    if journal is None:
        return await run()
    key = _key(kind, request)
    previous = await journal.begin(key, kind, request)
    if previous is not None:
        await trace_replay(kind, key)
        return decode(previous["value"])
    result = await run()
    await journal.finish(key, encode(result))
    return result
