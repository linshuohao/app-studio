"""Configured service factory for Platform's synchronous CreateForm endpoint."""

import os

import httpx
from langchain_core.runnables.config import ensure_config

from form_agent.contracts import CheckReceipt
from form_agent.conversations.store import ConversationStore, postgres_engine
from form_agent.integrations.dependencies import CreateFormTools, PostgresProtocolReader
from form_agent.main import create_app
from form_agent.model_adapters import configured_model


def create_configured_app():
    base = os.environ["CREATE_FORM_PLATFORM_URL"]
    token = os.environ["AGENT_SERVICE_TOKEN"]
    reader = PostgresProtocolReader(os.environ["AGENT_DATABASE_URL"])

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

    async def catalog(context, kind, query):
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

    async def check(context, text):
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

    app = create_app(
        model=configured_model(),
        tools=CreateFormTools(reader, catalog, check),
        service_token=token,
        store=ConversationStore(postgres_engine(os.environ["AGENT_DATABASE_URL"])),
        timeout_seconds=600,
    )

    @app.get("/health")
    async def health():
        return {"running": True, "create_form_ready": True}

    return app
