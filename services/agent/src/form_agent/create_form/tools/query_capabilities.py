import json

from pydantic import JsonValue

from form_agent.create_form.nodes.compose.reads import AuthoringReads
from form_agent.create_form.state import CheckEvidence
from form_agent.integrations.catalog import QueryCapabilities


def bind_query_capabilities(
    query_catalog: QueryCapabilities,
    context: dict[str, JsonValue],
    reads: AuthoringReads,
    checks: CheckEvidence,
):
    async def query_capabilities(kind: str, query: str) -> JsonValue:
        """Use kind material, pure_function or host. Query exact space-separated IDs for manifests; unknown terms list available IDs. Host returns preview signatures."""
        try:
            lookup = (kind, query.strip())
            if lookup in reads.completed_queries:
                return {"status": "already_returned", "first_query": query}
            result = await query_catalog(context, kind, query)
            if not result:
                return result
            reads.completed_queries.add(lookup)
            key = (kind, json.dumps(result, ensure_ascii=False, sort_keys=True))
            previous = reads.catalog_results.get(key)
            if previous is not None:
                return {"status": "already_returned", "first_query": previous}
            reads.catalog_results[key] = query
            return result
        except Exception as error:
            checks.tool_failure = error
            raise

    return query_capabilities
