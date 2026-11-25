from collections.abc import Awaitable, Callable
from hashlib import sha256

from pydantic import BaseModel, Field, JsonValue


class CheckReceipt(BaseModel):
    check_id: str = Field(min_length=1)
    candidate_digest: str
    check_environment: str | None = None
    success: bool
    diagnostics: list[dict[str, JsonValue]] = Field(
        default_factory=list[dict[str, JsonValue]]
    )
    host_requirements: dict[str, JsonValue] = Field(
        default_factory=dict[str, JsonValue]
    )


CheckCandidate = Callable[[dict[str, JsonValue], str], Awaitable[CheckReceipt]]
"""Check the exact candidate text under the supplied authorized context.

Configuration diagnostics return a failed receipt; execution faults are exceptions.
"""


def candidate_digest(text: str) -> str:
    return f"sha256:{sha256(text.encode('utf-8')).hexdigest()}"


CheckSchema = Callable[
    [dict[str, JsonValue], str, list[JsonValue]], Awaitable[CheckReceipt]
]
