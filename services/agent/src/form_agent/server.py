"""Configured entry point for the Agent Server."""

import os

from form_agent.api.app import create_app
from form_agent.business.conversations.store import ConversationStore, postgres_engine
from form_agent.integrations.models import configured_model
from form_agent.integrations.platform_tools import platform_tools
from form_agent.integrations.protocol import PostgresProtocolReader
from form_agent.observability.callbacks import evaluation_callback_factory


def create_configured_app():
    base = os.environ["CREATE_FORM_PLATFORM_URL"]
    token = os.environ["AGENT_SERVICE_TOKEN"]
    reader = PostgresProtocolReader(os.environ["AGENT_DATABASE_URL"])

    app = create_app(
        model=configured_model(),
        tools=platform_tools(base, token, reader),
        service_token=token,
        store=ConversationStore(postgres_engine(os.environ["AGENT_DATABASE_URL"])),
        timeout_seconds=600,
        trace_callback_factory=evaluation_callback_factory(),
    )

    @app.get("/health")
    async def health():
        return {"running": True, "create_form_ready": True}

    return app
