import httpx
from langchain_core.runnables.config import ensure_config

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.execution.errors import CompilerEnvironmentUnavailable
from form_agent.integrations.compiler import CheckReceipt
from form_agent.integrations.diagnostic_replay import (
    BlockedReplay,
    Reproduced,
    VerifiedConditionRepair,
    replay_outcome,
)


def platform_tools(base, token, reader):
    async def post(action, body, actor_headers=None):
        trace = (ensure_config().get("metadata") or {}).get("creation_trace_id")
        headers = {"X-Agent-Service-Token": token, **(actor_headers or {})}
        if trace:
            headers["X-Trace-Id"] = trace
        async with httpx.AsyncClient(
            base_url=base,
            headers=headers,
            timeout=30,
            trust_env=False,
        ) as client:
            response = await client.post("/internal/agent-tools/" + action, json=body)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as error:
                if response.status_code == 503:
                    try:
                        failure = response.json()
                    except ValueError:
                        failure = None
                    if (
                        isinstance(failure, dict)
                        and failure.get("message")
                        == "Requested compiler environment unavailable"
                    ):
                        raise CompilerEnvironmentUnavailable(action) from error
                raise
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

    async def check_schema(context, text, cases):
        return CheckReceipt.model_validate(
            await post(
                "check-schema",
                {
                    "schema_text": text,
                    "cases": cases,
                    **(
                        {"check_environment": context["check_environment"]}
                        if context.get("check_environment")
                        else {}
                    ),
                },
            )
        )

    async def replay_diagnostic(reference, user, space):
        try:
            receipt = await post(
                "replay-diagnostic",
                {
                    "diagnosticId": reference.diagnosticId,
                    "releaseId": reference.releaseId,
                    "proposeRepair": True,
                },
                {"X-Agent-User": user, "X-Agent-Space": space},
            )
            outcome = replay_outcome.validate_python(receipt)
            if (
                isinstance(outcome, Reproduced)
                and isinstance(outcome.repair, VerifiedConditionRepair)
                and outcome.repair.versionId != reference.versionId
            ):
                return outcome.model_copy(update={"repair": None})
            return outcome
        except (httpx.HTTPError, ValueError):
            return BlockedReplay(status="blocked", reason="executor_unavailable")

    return AgentToolDependencies(
        reader, query_capabilities, check_candidate, check_schema, replay_diagnostic
    )
