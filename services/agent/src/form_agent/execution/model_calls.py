"""Turn-local journal. Only trusted application types may be restored from JSON."""

from langchain_core.messages import message_to_dict, messages_from_dict

from form_agent.execution.codec import pack, unpack
from form_agent.execution.journal import _journal, _key, call
from form_agent.observability.replay import trace_replay


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
