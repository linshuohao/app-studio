from pydantic import JsonValue

from form_agent.create_form.nodes.compose.reads import AuthoringReads
from form_agent.create_form.state import CheckEvidence
from form_agent.integrations.protocol import ReadProtocol


def bind_read_protocol(
    reader: ReadProtocol,
    context: dict[str, JsonValue],
    reads: AuthoringReads,
    checks: CheckEvidence,
):
    async def read_protocol(query: str) -> JsonValue:
        """Read the full authoritative protocol manual for this request. Call once before composing."""
        if reads.protocol_read:
            return reads.protocol_result
        try:
            result = await reader(context, query)
            reads.protocol_result = result
            reads.protocol_read = True
            return result
        except Exception as error:
            checks.tool_failure = error
            raise

    return read_protocol
