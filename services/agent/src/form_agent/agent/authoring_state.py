from dataclasses import dataclass, field
from typing import Annotated, Literal, NotRequired, TypedDict

from pydantic import BaseModel, Field, JsonValue

from form_agent.business.form_authoring.contracts import (
    Answer,
    BindingEvidence,
    Blocked,
    Clarification,
    ComposeCheckpoint,
    TurnInput,
    TurnResult,
)
from form_agent.business.form_authoring.requirements import (
    ConfigurationMapping,
    StandardRequirements,
)
from form_agent.integrations.compiler import CheckReceipt


class ReadyToCompose(BaseModel, extra="forbid"):
    kind: Literal["ready"]


class ChatReady(ReadyToCompose):
    requirements: list[str] = Field(min_length=1)
    assumptions: list[str] = Field(default_factory=list[str])


UnderstandingDecision = Annotated[
    ChatReady | Clarification | Answer | Blocked, Field(discriminator="kind")
]


class ChatUnderstanding(BaseModel, extra="forbid"):
    decision: UnderstandingDecision


class DocumentUnderstanding(BaseModel, extra="forbid"):
    decision: Literal["create"] | Answer | Blocked
    standard: StandardRequirements


class Understanding(BaseModel):
    decision: ChatReady | ReadyToCompose | Clarification | Answer | Blocked
    standard: StandardRequirements | None = None


@dataclass
class CheckEvidence:
    """Request-local evidence collected by the tools inside the composition node."""

    receipts: dict[str, CheckReceipt] = field(default_factory=dict[str, CheckReceipt])
    failed_text: dict[str, str] = field(default_factory=dict)
    passed_text: dict[str, str] = field(default_factory=dict[str, str])
    attempted: set[str] = field(default_factory=set[str])
    configuration_mapping: list[ConfigurationMapping] = field(
        default_factory=list[ConfigurationMapping]
    )
    mapping_check_blocked: bool = False
    pending_candidate: str | None = None
    tool_failure: Exception | None = None


@dataclass(frozen=True)
class Composition:
    draft: object
    checks: CheckEvidence
    binding_evidence: BindingEvidence | None = None
    failed_digest: str | None = None
    catalog: list[JsonValue] = field(default_factory=list)
    compose_checkpoint: ComposeCheckpoint | None = None


@dataclass(frozen=True)
class RepairRound:
    change: str
    before: str
    after: str


@dataclass(frozen=True)
class PlaceholderEdit:
    path: tuple[str | int, ...]
    value: str


class FormAuthoringState(TypedDict):
    request: TurnInput
    understanding: NotRequired[Understanding]
    placeholder_edit: NotRequired[PlaceholderEdit]
    composition: NotRequired[Composition]
    repairs: NotRequired[list[RepairRound]]
    repair_manual: NotRequired[JsonValue]
    result: NotRequired[TurnResult]
