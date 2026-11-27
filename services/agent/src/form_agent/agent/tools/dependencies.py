from dataclasses import dataclass

from form_agent.integrations.catalog import QueryCapabilities
from form_agent.integrations.compiler import CheckCandidate, CheckSchema
from form_agent.integrations.diagnostic_replay import ReplayDiagnostic
from form_agent.integrations.protocol import ReadProtocol


@dataclass(frozen=True)
class AgentToolDependencies:
    """Platform compiler/catalog and knowledge reader supplied at service startup."""

    read_protocol: ReadProtocol
    query_capabilities: QueryCapabilities
    check_candidate: CheckCandidate
    check_schema: CheckSchema | None = None
    replay_diagnostic: ReplayDiagnostic | None = None
