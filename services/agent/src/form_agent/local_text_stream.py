"""Stream final-answer text from the local Codex stdio API."""

import asyncio
import json
import logging
import os
from tempfile import TemporaryDirectory
from time import monotonic


async def local_text_stream(model: str, prompt: str):
    with TemporaryDirectory(prefix="createform-read-") as cwd:
        proc = await asyncio.create_subprocess_exec(
            "codex",
            "app-server",
            "--disable",
            "shell_tool",
            "--disable",
            "unified_exec",
            "--disable",
            "multi_agent",
            "-c",
            'web_search="disabled"',
            "-c",
            "mcp_servers={}",
            cwd=cwd,
            env={
                k: os.environ[k]
                for k in ("HOME", "PATH", "LANG", "TMPDIR")
                if k in os.environ
            },
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            limit=4 * 1024 * 1024,
        )
        stdin, stdout = proc.stdin, proc.stdout
        assert stdin and stdout

        async def send(packet):
            stdin.write(json.dumps(packet).encode() + b"\n")
            await stdin.drain()

        async def receive():
            line = await stdout.readline()
            if not line:
                raise RuntimeError("Codex stream ended before turn completion")
            return json.loads(line)

        async def call(i, method, params):
            await send({"id": i, "method": method, "params": params})
            while True:
                packet = await receive()
                if packet.get("id") == i:
                    if "error" in packet:
                        raise RuntimeError("Codex failed to initialize " + method)
                    return packet["result"]

        try:
            await call(
                1,
                "initialize",
                {
                    "clientInfo": {"name": "create_form", "version": "1"},
                    "capabilities": {"experimentalApi": True},
                },
            )
            await send({"method": "initialized"})
            thread = await call(
                2,
                "thread/start",
                {
                    "model": model,
                    "cwd": cwd,
                    "ephemeral": True,
                    "approvalPolicy": "never",
                    "sandbox": "read-only",
                    "baseInstructions": "Return only the requested answer in the format specified in the supplied messages. Never use tools or access files.",
                },
            )
            await send(
                {
                    "id": 3,
                    "method": "turn/start",
                    "params": {
                        "threadId": thread["thread"]["id"],
                        "input": [{"type": "text", "text": prompt}],
                    },
                }
            )
            started = monotonic()
            usage = None
            final_items = set()
            while True:
                packet = await receive()
                name = packet.get("method")
                data = packet.get("params", {})
                if "id" in packet and name:
                    raise RuntimeError("Unexpected Codex server request")
                if packet.get("id") == 3 and "error" in packet:
                    raise RuntimeError("Codex failed to start turn")
                if name == "item/started":
                    item = data["item"]
                    if (
                        item["type"] == "agentMessage"
                        and item.get("phase") != "commentary"
                    ):
                        final_items.add(item["id"])
                    elif item["type"] not in {
                        "agentMessage",
                        "userMessage",
                        "reasoning",
                    }:
                        raise RuntimeError("Unexpected Codex tool invocation")
                elif (
                    name == "item/agentMessage/delta" and data["itemId"] in final_items
                ):
                    yield data["delta"]
                elif name == "thread/tokenUsage/updated":
                    usage = data.get("tokenUsage", {}).get("total")
                elif name == "turn/completed":
                    logging.getLogger("uvicorn.error").info(
                        "understand elapsed=%.2f usage=%s", monotonic() - started, usage
                    )
                    if data["turn"]["status"] != "completed":
                        raise RuntimeError("Codex turn failed")
                    return
        finally:
            if proc.returncode is None:
                proc.kill()
            await proc.wait()
