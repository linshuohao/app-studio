from typing import Protocol, TypedDict


class RuntimeDiagnosticsInput(TypedDict):
    release_ref: str
    symptom: str
    evidence_refs: list[str]


class RuntimeDiagnosticsOutput(TypedDict):
    explanation: str
    evidence_refs: list[str]
    missing_evidence: list[str]


class RuntimeDiagnosticsAgent(Protocol):
    """Future runtime issue analysis bound to a particular release and evidence."""

    async def __call__(
        self, task: RuntimeDiagnosticsInput
    ) -> RuntimeDiagnosticsOutput: ...
