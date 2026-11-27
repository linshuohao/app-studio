"""State and action observations for one unified assistant turn."""

from dataclasses import dataclass
from typing import Any, Literal, NotRequired

from pydantic import BaseModel, JsonValue

from form_agent.agent.authoring_state import (
    FormAuthoringState,
)
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.business.form_authoring.contracts import (
    Answer,
    Blocked,
)

Action = Literal[
    "chat", "lookup", "understand", "compose", "check", "repair", "deliver"
]


class Lookup(BaseModel):
    source: Literal["protocol", "material", "pure_function", "host"]
    query: str


@dataclass(frozen=True)
class Observation:
    action: Action
    updates: dict[str, Any]


ActionObservation = Observation


class TurnGraphState(FormAuthoringState):
    generate_conversation_title: NotRequired[bool]
    conversation_title: NotRequired[str | None]
    action: NotRequired[Action]
    observation: NotRequired[ActionObservation]
    observed: NotRequired[int]
    steps: NotRequired[int]
    lookup_request: NotRequired[Lookup]
    verify_candidate: NotRequired[str]
    check_only: NotRequired[bool]
    read_tools: NotRequired[AgentToolDependencies]
    facts: NotRequired[dict[str, JsonValue]]
    reply: NotRequired[Answer | Blocked]
