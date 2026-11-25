from typing import Protocol, TypedDict

from pydantic import JsonValue


class RequirementAnalysisInput(TypedDict):
    message: str
    history: list[dict[str, JsonValue]]
    source_refs: list[str]


class RequirementAnalysisOutput(TypedDict):
    requirements: list[dict[str, JsonValue]]
    assumptions: list[str]
    questions: list[str]


class RequirementsAgent(Protocol):
    """Future standalone requirements analysis, extracted from CreateForm if needed."""

    async def __call__(
        self, task: RequirementAnalysisInput
    ) -> RequirementAnalysisOutput: ...
