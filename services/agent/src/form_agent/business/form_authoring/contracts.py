from typing import Annotated, Literal

from pydantic import BaseModel, Field, JsonValue, model_validator

from form_agent.business.conversations.references import MessageReference
from form_agent.business.form_authoring.requirements import (
    ConfigurationMapping,
    RequirementsDocument,
    RequirementsTrace,
    StandardRequirements,
)
from form_agent.integrations.compiler import CheckReceipt as CheckReceipt


class BindingEvidence(BaseModel):
    target: str
    knowledge_version: str | None = None
    capabilities: dict[str, JsonValue]
    schema_check: CheckReceipt | None = None
    remaining_validation: dict[str, str] = Field(default_factory=dict)
    schema_coverage: dict[str, list[str]] = Field(default_factory=dict)
    schema_cases: list[JsonValue] = Field(default_factory=list[JsonValue])
    later_cases: list[JsonValue] = Field(default_factory=list[JsonValue])
    schema_reopened: bool = False
    reflection_rounds: int = 0
    view_array_remove_ids: list[str] = Field(default_factory=list)
    module_deferrals: dict[str, dict[str, str]] = Field(default_factory=dict)


class ComposeCheckpoint(BaseModel):
    inputs: str
    schema_cases: list[JsonValue] | None = None
    later_cases: list[JsonValue] = Field(default_factory=list)
    previous_schema: str | None = None
    diagnostics: list[dict[str, JsonValue]] = Field(default_factory=list)
    evidence: BindingEvidence | None = None
    previous_view_fragment: dict[str, JsonValue] | None = None
    fragments: dict[str, JsonValue] = Field(default_factory=dict)
    missing_host_ids: list[str] = Field(default_factory=list)
    module_diagnostics: dict[str, str] = Field(default_factory=dict)


class PreviousReview(BaseModel):
    binding_evidence: BindingEvidence | None = None
    trace: RequirementsTrace
    check: CheckReceipt


class RepairScope(BaseModel):
    path: tuple[str | int, ...]
    value: str


class RepairContext(BaseModel):
    candidate_text: str = Field(min_length=1)
    check: CheckReceipt
    context: dict[str, JsonValue]
    configuration_mapping: list[ConfigurationMapping]
    binding_evidence: BindingEvidence | None = None
    requirements: list[str] = Field(default_factory=list)
    scope: RepairScope | None = None
    edit_instruction: str = ""
    needs_coverage: bool = False


class CreateFormInput(BaseModel):
    read_only: bool = False
    message: str = Field(min_length=1)
    references: list[MessageReference] = Field(default_factory=list, max_length=5)
    requirements_document: RequirementsDocument | None = None
    previous_standard: StandardRequirements | None = None
    history: list[dict[str, JsonValue]] = Field(
        default_factory=list[dict[str, JsonValue]]
    )
    previous_review: PreviousReview | None = None
    previous_working_check: CheckReceipt | None = None
    previous_failure: RepairContext | None = None
    previous_compose: ComposeCheckpoint | None = None
    open_questions: list[str] = Field(default_factory=list)
    referenced_candidate: str | None = None
    context: dict[str, JsonValue]


class CreateFormBusinessResult(BaseModel):
    requirements_trace: RequirementsTrace | None = None


class Clarification(CreateFormBusinessResult):
    repair_context: RepairContext | None = None
    kind: Literal["clarification"]
    message: str
    questions: list[str] = Field(min_length=1)


class Answer(CreateFormBusinessResult):
    repair_context: RepairContext | None = None
    check: CheckReceipt | None = None
    kind: Literal["answer"]
    message: str


class DraftIssue(BaseModel):
    message: str
    sourcePointer: str = ""
    requirementIds: list[str] = Field(default_factory=list)


class PartialDraft(BaseModel):
    candidate_text: str
    issues: list[DraftIssue] = Field(min_length=1)


class Blocked(CreateFormBusinessResult):
    partial_draft: PartialDraft | None = None
    compose_checkpoint: ComposeCheckpoint | None = None
    repair_context: RepairContext | None = None
    kind: Literal["blocked"]
    reason: str


class RequirementIssue(BaseModel):
    category: Literal["material", "function", "interaction", "host", "conflict"]
    status: Literal[
        "capability_gap", "contract_unclear", "evidence_missing", "decision_required"
    ]
    title: str = Field(min_length=1)
    finding: str = Field(min_length=1)
    action: str = Field(min_length=1)
    requirement_ids: list[str] = Field(default_factory=list)
    claims: list[str] = Field(default_factory=list)
    question: str | None = None

    @model_validator(mode="after")
    def validate_conflict(self):
        if self.category == "conflict":
            if (
                self.status != "decision_required"
                or len(set(self.claims)) < 2
                or not self.question
            ):
                raise ValueError(
                    "A conflict needs two distinct requirements and a decision question"
                )
        elif self.status == "decision_required" or self.claims or self.question:
            raise ValueError(
                "Decision questions and conflicting claims belong to conflicts"
            )
        return self


class RequirementsUnmet(BaseModel):
    kind: Literal["requirements_unmet"]
    summary: str = Field(min_length=1)
    issues: list[RequirementIssue] = Field(min_length=1)


class CompilationEvidence(BaseModel):
    compilation: Literal["unverified", "failed", "passed"]
    checkCode: str | None = None
    candidateDigest: str | None = None


class UnmetReport(RequirementsUnmet, CreateFormBusinessResult):
    verification: CompilationEvidence


class CheckedDraft(BaseModel):
    """Internal model output selecting a checked draft by digest."""

    kind: Literal["proposal"]
    candidate_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    summary: str


class CandidatePendingItem(BaseModel):
    title: str
    details: list[str]
    requirementIds: list[str]


class CandidateGuide(BaseModel):
    title: str | None = None
    hostPending: list[CandidatePendingItem] = Field(default_factory=list)
    previewPending: list[CandidatePendingItem] = Field(default_factory=list)
    exampleCode: str | None = None
    exampleUnavailable: bool = False


class Proposal(CreateFormBusinessResult):
    binding_evidence: BindingEvidence | None = None
    kind: Literal["proposal"]
    candidate_text: str = Field(min_length=1)
    summary: str
    check: CheckReceipt
    guide: CandidateGuide | None = None


CreateFormResult = Annotated[
    Clarification | Answer | Blocked | Proposal | UnmetReport,
    Field(discriminator="kind"),
]

# Retain the Pydantic model name in schemas and journal payloads.
TurnInput = CreateFormInput
TurnResult = CreateFormResult
