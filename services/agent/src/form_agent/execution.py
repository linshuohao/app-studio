"""Turn-local journal. Only trusted application types may be restored from JSON."""

import inspect
import json
from collections.abc import Awaitable, Callable
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, fields, is_dataclass
from functools import cache
from hashlib import sha256
from typing import Any, Protocol

from langchain_core.messages import message_to_dict, messages_from_dict
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from pydantic import BaseModel


class ExecutionJournal(Protocol):
    async def begin(self, key: str, kind: str, request: dict) -> dict | None: ...
    async def finish(self, key: str, value: Any) -> None: ...
    async def partial(self, key: str, text: str) -> None: ...
    async def failure(self, key: str, payload: dict) -> None: ...


_journal = ContextVar[ExecutionJournal | None]("execution_journal", default=None)
_step = ContextVar[tuple[str, dict[str, int]]]("execution_step")
_replay = RunnablePassthrough().with_config(run_name="journal.replay")


async def trace_replay(kind: str, key: str):
    await _replay.ainvoke({"kind": kind, "step_key": key})


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


@cache
def _types():
    from form_agent import contracts, requirements, turn_state
    from form_agent.create_form import state
    from form_agent.integrations import compiler

    return {
        cls.__module__ + "." + cls.__name__: cls
        for module in (contracts, requirements, turn_state, state, compiler)
        for cls in vars(module).values()
        if isinstance(cls, type)
        and cls.__module__ == module.__name__
        and (issubclass(cls, BaseModel) or is_dataclass(cls))
    }


def pack(value: Any) -> Any:
    cls = type(value)
    tag = cls.__module__ + "." + cls.__name__
    if isinstance(value, BaseModel):
        return [tag, value.model_dump(mode="json")]
    if is_dataclass(value):
        return [tag, {f.name: pack(getattr(value, f.name)) for f in fields(value)}]
    if isinstance(value, dict):
        return {k: pack(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [cls.__name__, [pack(v) for v in value]]
    return value


def unpack(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: unpack(v) for k, v in value.items()}
    if not isinstance(value, list):
        return value
    tag, data = value
    if tag in ("list", "tuple", "set"):
        return {"list": list, "tuple": tuple, "set": set}[tag](unpack(v) for v in data)
    cls = _types()[tag]
    if issubclass(cls, BaseModel):
        return cls.model_validate(data)
    return cls(**{k: unpack(v) for k, v in data.items()})


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


def model_request(model, messages):
    # Framework-generated message IDs change when a graph is restored.
    serialized = [message_to_dict(m) for m in messages]
    for m in serialized:
        m["data"].pop("id", None)
    return {
        "model": getattr(model, "model_name", None) or type(model).__name__,
        "messages": serialized,
    }


async def structured(model, schema, messages, **options):
    journal = _journal.get()
    if journal is None:
        return await model.with_structured_output(schema, **options).ainvoke(messages)
    request = {
        **model_request(model, messages),
        "schema": schema.model_json_schema(),
        **options,
    }

    key = _key("llm", request)
    previous = await journal.begin(key, "llm", request)
    if previous is not None:
        await trace_replay("llm", key)
        return schema.model_validate(previous["value"]["parsed"])

    packet = await model.with_structured_output(
        schema, include_raw=True, **options
    ).ainvoke(messages)
    raw = message_to_dict(packet["raw"])
    parsed = packet["parsed"]
    if packet["parsing_error"] or parsed is None:
        reason = str(packet["parsing_error"] or "Model returned no structured result")
        await journal.failure(key, {"raw": raw, "error": reason})
        raise ValueError(reason)
    await journal.finish(key, {"raw": raw, "parsed": parsed.model_dump(mode="json")})
    return parsed


async def stream(model, messages, *, require_text=False):
    journal = _journal.get()
    if journal is None:
        found_text = False
        async for chunk in model.astream(messages):
            found_text |= bool(chunk.text.strip())
            yield chunk
        if require_text and not found_text:
            raise ValueError("Model returned no reply text")
        return
    request = model_request(model, messages)
    key = _key("llm", request)
    previous = await journal.begin(key, "llm", request)
    if previous is not None:
        await trace_replay("llm", key)
        for chunk in messages_from_dict(previous["value"]):
            yield chunk
        return
    chunks, buffer = [], ""
    found_text = False
    try:
        async for chunk in model.astream(messages):
            chunks.append(message_to_dict(chunk))
            found_text |= bool(chunk.text.strip())
            buffer += chunk.text
            if buffer and (len(chunks) == 1 or len(buffer) >= 256 or "\n" in buffer):
                await journal.partial(key, buffer)
                buffer = ""
            yield chunk
    except Exception:
        if buffer:
            await journal.partial(key, buffer)
        raise
    if buffer:
        await journal.partial(key, buffer)
    if require_text and not found_text:
        await journal.failure(
            key, {"raw": chunks, "error": "Model returned no reply text"}
        )
        raise ValueError("Model returned no reply text")
    await journal.finish(key, chunks)


async def compose_response(handler, request):
    if _journal.get() is None:
        return await handler(request)
    from langchain.agents.middleware import ModelResponse
    from langchain_core.utils.function_calling import convert_to_openai_tool

    messages = (
        [request.system_message] if request.system_message else []
    ) + request.messages
    prompt = {
        **model_request(request.model, messages),
        "tools": [convert_to_openai_tool(t) for t in request.tools],
        "response_schemas": [
            spec.json_schema for spec in request.response_format.schema_specs
        ],
        "settings": request.model_settings,
    }

    def encode(result):
        return {
            "messages": [message_to_dict(m) for m in result.result],
            "structured": pack(result.structured_response),
        }

    def decode(value):
        return ModelResponse(
            result=messages_from_dict(value["messages"]),
            structured_response=unpack(value["structured"]),
        )

    return await call("llm", prompt, lambda: handler(request), encode, decode)


def journal_tools(tools):
    from form_agent.integrations.dependencies import CreateFormTools

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

    return CreateFormTools(
        *(wrap(f.name, getattr(tools, f.name)) for f in fields(CreateFormTools))
    )
