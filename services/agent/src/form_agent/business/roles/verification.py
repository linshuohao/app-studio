from typing import Protocol, TypedDict


class VerificationInput(TypedDict):
    candidate_ref: str
    candidate_digest: str
    scenario_refs: list[str]


class VerificationOutput(TypedDict):
    candidate_digest: str
    evidence_refs: list[str]
    coverage_gaps: list[str]


class VerificationAgent(Protocol):
    """Future explanation and collection of evidence from scenario executors."""

    async def __call__(self, task: VerificationInput) -> VerificationOutput: ...
