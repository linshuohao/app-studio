from typing import Protocol, TypedDict

from pydantic import JsonValue


class FillAssistanceInput(TypedDict):
    instance_ref: str
    snapshot_ref: str
    message: str
    source_refs: list[str]


class FieldSuggestion(TypedDict):
    field_ref: str
    value: JsonValue
    source_refs: list[str]


class FillAssistanceOutput(TypedDict):
    suggestions: list[FieldSuggestion]
    questions: list[str]


class FillAssistanceAgent(Protocol):
    """Future suggestions for a Host to present and confirm."""

    async def __call__(self, task: FillAssistanceInput) -> FillAssistanceOutput: ...
