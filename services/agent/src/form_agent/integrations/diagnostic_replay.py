from collections.abc import Awaitable, Callable
from typing import Literal

from pydantic import BaseModel, Field, TypeAdapter

from form_agent.business.conversations.references import DiagnosticReference


class BlockedReplay(BaseModel, extra="forbid"):
    status: Literal["blocked"]
    reason: Literal[
        "evidence_unavailable",
        "unsupported_phase",
        "evidence_mismatch",
        "unsupported_input",
        "condition_budget_exceeded",
        "environment_unavailable",
        "executor_unavailable",
    ]


class VerifiedConditionRepair(BaseModel, extra="forbid"):
    status: Literal["verified"]
    versionId: str
    candidateDigest: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    pointer: str = Field(pattern=r"^/reactions/(0|[1-9][0-9]*)/when(/args/[01])*$")


class BlockedConditionRepair(BaseModel, extra="forbid"):
    status: Literal["blocked"]
    reason: Literal["original_build_unavailable", "candidate_check_failed"]


class Reproduced(BaseModel, extra="forbid"):
    status: Literal["reproduced"]
    reason: Literal["same_condition_failure"]
    repair: VerifiedConditionRepair | BlockedConditionRepair | None = None


class NotReproduced(BaseModel, extra="forbid"):
    status: Literal["not_reproduced"]
    reason: Literal["condition_failure_differed"]


ReplayOutcome = BlockedReplay | Reproduced | NotReproduced
replay_outcome = TypeAdapter(ReplayOutcome)
ReplayDiagnostic = Callable[[DiagnosticReference, str, str], Awaitable[ReplayOutcome]]
