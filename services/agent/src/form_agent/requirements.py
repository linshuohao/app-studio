"""Contracts for reading and mapping a versioned requirements document."""

from typing import Literal

from pydantic import BaseModel, Field


class RequirementsDocument(BaseModel):
    document_id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    markdown: str = Field(min_length=1)


class SourceExcerpt(BaseModel):
    source_id: str
    quote: str = Field(min_length=1)


class EnumOption(BaseModel):
    label: str
    value: str | int | float | bool | None = None


class FieldDefinition(BaseModel):
    group: str
    name: str
    description: str
    value_type: str
    presence: Literal["required", "optional", "conditional", "unspecified"]
    options: list[EnumOption] = Field(default_factory=list[EnumOption])
    option_source: str | None = None
    validation: list[str] = Field(default_factory=list[str])
    rule_ids: list[str] = Field(default_factory=list[str])


class Requirement(BaseModel):
    id: str = Field(pattern=r"^R[1-9][0-9]*$")
    kind: Literal["field", "data", "view", "validation", "reaction", "host"]
    subject: str
    behavior: str
    field: FieldDefinition | None = None
    condition: str = ""
    exceptions: list[str] = Field(default_factory=list[str])
    sources: list[SourceExcerpt] = Field(min_length=1)


class RequirementIssue(BaseModel):
    requirement_ids: list[str]
    disposition: Literal["look_up_source", "ask_user", "agent_resolve"]
    detail: str
    blocking: bool
    sources: list[SourceExcerpt] = Field(default_factory=list[SourceExcerpt])


class AcceptanceScenario(BaseModel):
    requirement_ids: list[str] = Field(min_length=1)
    expected_behavior: str
    basis: Literal["specified", "suggested"]


class StandardRequirements(BaseModel):
    goal: str
    scope: str
    requirements: list[Requirement] = Field(min_length=1)
    assumptions: list[str] = Field(default_factory=list[str])
    issues: list[RequirementIssue] = Field(default_factory=list[RequirementIssue])
    scenarios: list[AcceptanceScenario] = Field(default_factory=list[AcceptanceScenario])

    def markdown(self) -> str:
        lines = [f"# {self.goal}", "", f"范围：{self.scope}", "", "## 需求"]
        for item in self.requirements:
            lines.append(f"- {item.id} [{item.kind}] {item.subject}：{item.behavior}")
            if item.field is not None:
                field = item.field
                lines.append(f"  - {field.group} / {field.name}（{field.value_type}，{field.presence}）：{field.description}")
                for option in field.options:
                    value = "存储值未指定" if option.value is None else option.value
                    lines.append(f"  - 选项：{option.label} → {value}")
                if field.option_source:
                    lines.append(f"  - 选项来源：{field.option_source}")
                lines.extend(f"  - 校验：{rule}" for rule in field.validation)
                if field.rule_ids:
                    lines.append(f"  - 关联规则：{', '.join(field.rule_ids)}")
            if item.condition:
                lines.append(f"  - 条件：{item.condition}")
            lines.extend(f"  - 例外：{value}" for value in item.exceptions)
            lines.extend(
                f"  - 来源 {source.source_id}：{source.quote}"
                for source in item.sources
            )
        lines.extend(["", "## 假设与待办"])
        lines.extend(f"- 假设：{item}" for item in self.assumptions)
        for issue in self.issues:
            lines.append(f"- {', '.join(issue.requirement_ids)} [{issue.disposition}] {issue.detail}")
            lines.extend(f"  - 来源 {s.source_id}：{s.quote}" for s in issue.sources)
        lines.extend(["", "## 验收场景"])
        lines.extend(
            f"- {', '.join(item.requirement_ids)} [{item.basis}] {item.expected_behavior}"
            for item in self.scenarios
        )
        return "\n".join(lines)


class ConfigurationMapping(BaseModel):
    requirement_id: str
    destinations: list[str] = Field(min_length=1)
    status: Literal["ready", "deferred_to_host", "needs_source", "needs_user", "unavailable"]
    detail: str


class RequirementsTrace(BaseModel):
    document_id: str
    document_version: str
    standard: StandardRequirements
    markdown: str
    configuration_mapping: list[ConfigurationMapping] = Field(default_factory=list[ConfigurationMapping])
