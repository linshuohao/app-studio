from itertools import chain

from form_agent.contracts import Clarification
from form_agent.create_form.errors import InvalidCreateFormResult
from form_agent.create_form.state import (
    ChatUnderstanding,
    DocumentUnderstanding,
    ReadyToCompose,
    Understanding,
)


def validate_understanding(result, source_texts) -> Understanding:
    if isinstance(result, ChatUnderstanding):
        return Understanding(decision=result.decision)
    if isinstance(result, DocumentUnderstanding):
        standard = result.standard
        rule_ids = {
            item.id
            for item in standard.requirements
            if item.kind in ("validation", "reaction", "host", "view")
        }
        ids = {item.id for item in standard.requirements}
        if len(ids) != len(standard.requirements):
            raise InvalidCreateFormResult("Duplicate requirement IDs")
        for item in standard.requirements:
            if (item.kind == "field") != (item.field is not None):
                raise InvalidCreateFormResult(
                    "Field requirements must carry a field definition"
                )
            if item.field and not set(item.field.rule_ids) <= rule_ids:
                raise InvalidCreateFormResult(
                    "Field rule references must identify a validation, reaction, Host or view requirement"
                )
        for item in chain(standard.requirements, standard.issues):
            for source in item.sources:
                if not source.quote.strip() or source.quote not in source_texts.get(
                    source.source_id, ""
                ):
                    raise InvalidCreateFormResult(
                        "Requirement excerpt does not match its source"
                    )
        for item in chain(standard.issues, standard.scenarios):
            if not set(item.requirement_ids) <= ids:
                raise InvalidCreateFormResult(
                    "Unknown requirement ID in issue or scenario"
                )
        for issue in standard.issues:
            if not issue.sources and not issue.requirement_ids:
                raise InvalidCreateFormResult(
                    "Issue needs a source or affected requirement"
                )
            issue.blocking = issue.disposition == "ask_user"
        questions = [issue.detail for issue in standard.issues if issue.blocking]
        if questions:
            decision = Clarification(
                kind="clarification",
                message="请确认以下业务需求。",
                questions=questions,
            )
        elif result.decision == "create":
            decision = ReadyToCompose(kind="ready")
        else:
            decision = result.decision
        return Understanding(decision=decision, standard=standard)
    raise InvalidCreateFormResult("Understanding returned no structured decision")
