import httpx
from langchain_core.runnables.config import ensure_config

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.integrations.compiler import CheckReceipt


def platform_tools(base, token, reader):
    async def post(action, body):
        trace = (ensure_config().get("metadata") or {}).get("creation_trace_id")
        headers = {"X-Agent-Service-Token": token}
        if trace:
            headers["X-Trace-Id"] = trace
        async with httpx.AsyncClient(
            base_url=base,
            headers=headers,
            timeout=30,
            trust_env=False,
        ) as client:
            response = await client.post("/internal/agent-tools/" + action, json=body)
            response.raise_for_status()
            return response.json()

    async def query_capabilities(context, kind, query):
        return await post(
            "catalog",
            {
                "kind": kind,
                "query": query,
                **(
                    {"check_environment": context["check_environment"]}
                    if context.get("check_environment")
                    else {}
                ),
            },
        )

    async def check_candidate(context, text):
        return CheckReceipt.model_validate(
            await post(
                "check",
                {
                    "candidate_text": text,
                    **(
                        {"check_environment": context["check_environment"]}
                        if context.get("check_environment")
                        else {}
                    ),
                },
            )
        )

    return AgentToolDependencies(reader, query_capabilities, check_candidate)
