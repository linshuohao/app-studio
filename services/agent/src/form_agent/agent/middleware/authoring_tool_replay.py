"""Restore both a completed authoring tool message and its local evidence."""

from typing import Any

from langchain_core.messages import ToolMessage, message_to_dict, messages_from_dict

from form_agent.execution.codec import pack, unpack
from form_agent.execution.journal import call


async def tool_response(request, handler, reads, checks):
    name = request.tool_call["name"]

    def encode(message):
        if checks.tool_failure is not None:
            raise checks.tool_failure
        if not isinstance(message, ToolMessage):
            raise TypeError("A form authoring tool must return a tool message")
        value: dict[str, Any] = {"message": message_to_dict(message)}
        if name == "read_protocol":
            value.update(read=reads.protocol_read, protocol=reads.protocol_result)
        elif name == "query_capabilities":
            args = request.tool_call["args"]
            kind, query = args.get("kind"), args.get("query")
            lookup = (kind, query.strip()) if isinstance(query, str) else None
            value.update(
                completed=[list(lookup)]
                if lookup is not None and lookup in reads.completed_queries
                else [],
                catalog=[
                    [*key, term]
                    for key, term in reads.catalog_results.items()
                    if key[0] == kind and term == query
                ],
            )
        elif name == "record_configuration_mapping":
            value["mapping"] = pack(checks.configuration_mapping)
        else:
            value.update(
                pending=checks.pending_candidate, blocked=checks.mapping_check_blocked
            )
        return value

    def restore(value):
        if name == "read_protocol":
            reads.protocol_read = value["read"]
            reads.protocol_result = value["protocol"]
        elif name == "query_capabilities":
            reads.completed_queries.update(tuple(k) for k in value["completed"])
            reads.catalog_results.update(
                {(kind, raw): term for kind, raw, term in value["catalog"]}
            )
        elif name == "record_configuration_mapping":
            checks.configuration_mapping = unpack(value["mapping"])
        else:
            checks.pending_candidate = value["pending"]
            checks.mapping_check_blocked = value["blocked"]
        return messages_from_dict([value["message"]])[0]

    return await call(
        "tool",
        {"authoring": request.tool_call},
        lambda: handler(request),
        encode,
        restore,
    )
