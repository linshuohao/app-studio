from collections.abc import Awaitable, Callable

from pydantic import JsonValue

QueryCapabilities = Callable[[dict[str, JsonValue], str, str], Awaitable[JsonValue]]
"""Query the authorized target catalog with (context, kind, query).

A successful empty result indicates no match; transport errors are exceptions.
The Platform request and response schemas are pending integration design.
"""
