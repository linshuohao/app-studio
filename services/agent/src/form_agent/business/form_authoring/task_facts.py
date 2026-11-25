from pydantic import BaseModel, Field

from form_agent.business.conversations.model import Message
from form_agent.business.form_authoring.contracts import (
    CheckReceipt,
    PreviousReview,
    RepairContext,
    TurnInput,
)
from form_agent.business.form_authoring.requirements import (
    RequirementsDocument,
    RequirementsTrace,
    StandardRequirements,
)
from form_agent.integrations.compiler import candidate_digest


class FormAuthoringTaskFacts(BaseModel):
    """One trusted task snapshot per conversation, updated only by the Agent."""

    pending_message: str | None = None
    document: RequirementsDocument | None = None
    standard: StandardRequirements | None = None
    review: PreviousReview | None = None
    candidate: str | None = None
    questions: list[str] = Field(default_factory=list)
    failure: RepairContext | None = None
    failure_base: str | None = None
    working_check: CheckReceipt | None = None
    draft_id: str | None = None

    def graph_input(
        self, conversation: str, message: Message, turns: list[dict]
    ) -> TurnInput:
        base = (
            message.workingText if message.workingText is not None else self.candidate
        )
        source_ids = set()
        if self.standard:
            for item in [*self.standard.requirements, *self.standard.issues]:
                source_ids.update(s.source_id for s in item.sources)
        history = []
        for i, turn in enumerate(turns, 1):
            recent = i > len(turns) - 20
            key = f"turn:{i}"
            if recent or key in source_ids:
                history.append(
                    {"role": "user", "source_id": key, "content": turn["message"]}
                )
            if recent:
                result = turn["result"]
                text = (
                    result.get("summary")
                    or result.get("message")
                    or result.get("reason")
                )
                history.append(
                    {
                        "role": "assistant",
                        "content": "\n".join(
                            filter(None, [text, *result.get("questions", [])])
                        ),
                    }
                )
        doc = self.document or RequirementsDocument(
            document_id=conversation,
            version="1",
            markdown=message.document or self.pending_message or message.message,
        )
        return TurnInput(
            message=message.message,
            context=message.context.model_dump(exclude_none=True),
            history=history,
            requirements_document=doc,
            previous_standard=self.standard,
            referenced_candidate=base,
            previous_review=self.review,
            previous_working_check=self.working_check,
            previous_failure=self.failure if base == self.failure_base else None,
            open_questions=self.questions,
        )

    def advance(
        self,
        conversation: str,
        revision: int,
        message: str,
        document: str | None,
        base: str | None,
        result: dict,
    ):
        kind = result["kind"]
        original = document or self.pending_message or message
        self.pending_message = None
        if kind != "answer":
            if not self.document:
                self.document = RequirementsDocument(
                    document_id=conversation, version="1", markdown=original
                )
            self.questions = result.get("questions", [])
            self.failure = None
            self.failure_base = None
            self.review = None
            if trace_data := result.get("requirements_trace"):
                trace = RequirementsTrace.model_validate(trace_data)
                for entry in [*trace.standard.requirements, *trace.standard.issues]:
                    for source in entry.sources:
                        if source.source_id == "message":
                            source.source_id = f"turn:{revision}"
                self.standard = trace.standard
                if kind == "proposal":
                    self.review = PreviousReview(
                        binding_evidence=result.get("binding_evidence"),
                        trace=trace,
                        check=result["check"],
                    )
            if kind == "proposal":
                text = result["candidate_text"]
                check = CheckReceipt.model_validate(result["check"])
                if (
                    not check.success
                    or candidate_digest(text) != check.candidate_digest
                ):
                    raise ValueError("Proposal receipt does not match candidate")
                self.candidate = text
        if data := result.get("check"):
            self.working_check = CheckReceipt.model_validate(data)
        if data := result.get("repair_context"):
            self.failure = RepairContext.model_validate(data)
            self.failure_base = base
