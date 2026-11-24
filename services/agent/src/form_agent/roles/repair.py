from typing import Protocol, TypedDict

from pydantic import JsonValue


class RepairInput(TypedDict):
    baseline_text: str
    baseline_digest: str
    diagnostics: list[dict[str, JsonValue]]


class RepairOutput(TypedDict):
    explanation: str
    candidate_text: str | None
    evidence_refs: list[str]


class RepairAgent(Protocol):
    """Future repair of an existing baseline, distinct from draft compilation feedback."""

    async def __call__(self, task: RepairInput) -> RepairOutput: ...
