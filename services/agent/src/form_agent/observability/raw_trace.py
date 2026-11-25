"""Append the complete framework callback payloads for an isolated evaluation."""

import os
import traceback
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from langchain_core.callbacks import BaseCallbackHandler
from pydantic_core import to_json


def describe_object(value: Any) -> Any:
    if isinstance(value, BaseException):
        return {
            "type": type(value).__qualname__,
            "message": str(value),
            "args": value.args,
            "attributes": vars(value),
            "traceback": traceback.format_exception(value),
        }
    return {"type": type(value).__qualname__, "repr": repr(value)}


class RawTraceArchive(BaseCallbackHandler):
    """Keep an append-only record independently of dashboard display limits."""

    raise_error = True

    def __init__(self, path: Path, **context: Any) -> None:
        self.path = path
        self.context = {"capture_id": uuid4().hex, **context}
        self._lock = Lock()
        self._sequence = 0
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)

    def record(self, event: str, *args: Any, **kwargs: Any) -> None:
        with self._lock:
            self._sequence += 1
            payload = to_json(
                {
                    "version": 1,
                    "sequence": self._sequence,
                    "time": datetime.now(UTC),
                    "context": self.context,
                    "event": event,
                    "args": args,
                    "kwargs": kwargs,
                },
                fallback=describe_object,
                bytes_mode="base64",
                inf_nan_mode="strings",
                serialize_as_any=True,
            )
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "ab") as file:
                file.write(payload + b"\n")


def capture_callback(event: str):
    def capture(self: RawTraceArchive, *args: Any, **kwargs: Any) -> None:
        self.record(event, *args, **kwargs)

    return capture


# Tee the callback surface of the installed framework as-is, including new event
# types, rather than deciding which business fields will matter to later analysis.
for callback_name in dir(BaseCallbackHandler):
    if callback_name.startswith("on_") and callable(
        getattr(BaseCallbackHandler, callback_name)
    ):
        setattr(RawTraceArchive, callback_name, capture_callback(callback_name))
