"""Model selection for CreateForm. Codex CLI is an opt-in local acceptance transport."""

import asyncio
import json
import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
from uuid import uuid4

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.messages.ai import UsageMetadata
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import BaseModel, PrivateAttr


class FunctionCall(BaseModel, extra="forbid"):
    name: str
    arguments_json: str


class FunctionCalls(BaseModel, extra="forbid"):
    calls: list[FunctionCall]


def codex_usage(raw: dict | None) -> UsageMetadata | None:
    if not raw:
        return None
    input_tokens, output_tokens = raw.get("input_tokens"), raw.get("output_tokens")
    if not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
        return None
    usage = UsageMetadata(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
    )
    if isinstance(cached := raw.get("cached_input_tokens"), int):
        usage["input_token_details"] = {"cache_read": cached}
    if isinstance(reasoning := raw.get("reasoning_output_tokens"), int):
        usage["output_token_details"] = {"reasoning": reasoning}
    return usage


class LocalChatGPT(BaseChatModel):
    model_name: str
    _functions: list[dict] = PrivateAttr(default_factory=list)

    @property
    def _llm_type(self):
        return "local-chatgpt"

    def bind_tools(self, tools, **kwargs):
        bound = self.model_copy()
        bound._functions = [convert_to_openai_tool(tool)["function"] for tool in tools]
        return bound

    def _generate(self, messages, **kwargs):
        raise NotImplementedError("Local ChatGPT requires async invocation")

    async def _agenerate(self, messages: list[BaseMessage], **kwargs):
        started = monotonic()
        envelope = {
            "functions": self._functions,
            "messages": [
                {
                    "role": m.type,
                    "content": m.content,
                    "name": m.name,
                    **(
                        {"tool_calls": m.tool_calls} if isinstance(m, AIMessage) else {}
                    ),
                }
                for m in messages
            ],
        }
        logging.getLogger("uvicorn.error").info(
            "model_context %s",
            json.dumps(
                {
                    "functions": [f["name"] for f in self._functions],
                    "schema_chars": len(
                        json.dumps(self._functions, ensure_ascii=False)
                    ),
                    "messages": [
                        {
                            "role": m["role"],
                            "name": m["name"],
                            "chars": len(json.dumps(m, ensure_ascii=False)),
                            "calls": [c["name"] for c in m.get("tool_calls", [])],
                        }
                        for m in envelope["messages"]
                    ],
                }
            ),
        )
        prompt = (
            "Act as a chat model with function calling. Return the requested function calls "
            "with arguments encoded as JSON strings. The caller executes them. Use only the "
            "listed functions, without accessing files or invoking CLI tools.\n"
            + json.dumps(envelope, ensure_ascii=False)
        )
        with TemporaryDirectory(prefix="createform-model-") as directory:
            schema = Path(directory) / "schema.json"
            schema.write_text(json.dumps(FunctionCalls.model_json_schema()))
            proc = await asyncio.create_subprocess_exec(
                "codex",
                "exec",
                "--ephemeral",
                "--ignore-user-config",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--disable",
                "shell_tool",
                "--disable",
                "unified_exec",
                "--disable",
                "multi_agent",
                "-c",
                'web_search="disabled"',
                "-m",
                self.model_name,
                "-C",
                directory,
                "--output-schema",
                str(schema),
                "--json",
                "-",
                cwd=directory,
                env={
                    k: os.environ[k]
                    for k in ("PATH", "HOME", "LANG", "TMPDIR")
                    if k in os.environ
                },
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                out, _ = await proc.communicate(prompt.encode())
            finally:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
            if proc.returncode:
                raise RuntimeError("Local ChatGPT model invocation failed")
            events = list(map(json.loads, out.splitlines()))
            usage = None
            for event in events:
                if event.get("type") == "turn.completed":
                    usage = event.get("usage")
                    logging.getLogger("uvicorn.error").info(
                        "model_call elapsed=%.2f usage=%s",
                        monotonic() - started,
                        usage,
                    )
            items = [
                event["item"] for event in events if event["type"] == "item.completed"
            ]
            if any(i["type"] not in {"agent_message", "reasoning"} for i in items):
                raise RuntimeError("Unexpected CLI tool invocation")
            packet = FunctionCalls.model_validate_json(
                next(i["text"] for i in reversed(items) if i["type"] == "agent_message")
            )
            return ChatResult(
                generations=[
                    ChatGeneration(
                        message=AIMessage(
                            content="",
                            usage_metadata=codex_usage(usage),
                            tool_calls=[
                                {
                                    "id": uuid4().hex,
                                    "name": c.name,
                                    "args": json.loads(c.arguments_json),
                                }
                                for c in packet.calls
                            ],
                        )
                    )
                ]
            )


class LocalChatGPTText(LocalChatGPT):
    """Text-only understanding call, exposed to LangChain callbacks as one model span."""

    async def _astream(self, messages, stop=None, run_manager=None, **kwargs):
        from form_agent.integrations.local_text_stream import local_text_stream

        prompt = json.dumps(
            [{"role": m.type, "content": m.content} for m in messages],
            ensure_ascii=False,
        )
        async for delta in local_text_stream(self.model_name, prompt):
            if isinstance(delta, str):
                yield ChatGenerationChunk(message=AIMessageChunk(content=delta))
            elif usage := codex_usage(delta):
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content="", usage_metadata=usage)
                )


def text_model(model):
    if isinstance(model, LocalChatGPT):
        return LocalChatGPTText(model_name=model.model_name)
    return model


def configured_model() -> BaseChatModel:
    name = os.environ["CREATE_FORM_MODEL"]
    if name.startswith("local-chatgpt:"):
        return LocalChatGPT(model_name=name.split(":", 1)[1])
    return init_chat_model(name)
