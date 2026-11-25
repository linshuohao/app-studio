import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from starlette.config import Config

from form_agent.api.app import create_app
from form_agent.business.conversations.store import ConversationStore, postgres_engine
from form_agent.server import create_configured_app


def create_dev_app() -> FastAPI:
    """Local process for working on the Agent before real adapters are configured."""
    local_env = Path(__file__).resolve().parents[2] / ".env.local"
    if local_env.is_file():
        for name, value in Config(local_env).file_values.items():
            os.environ.setdefault(name, value)
    if cli_dir := os.getenv("CODEX_CLI_DIR"):
        inherited = os.getenv("PATH", os.defpath)
        os.environ["PATH"] = os.pathsep.join((cli_dir, inherited))
    if os.getenv("CREATE_FORM_MODEL"):
        return create_configured_app()
    database = os.getenv("AGENT_DATABASE_URL")
    token = os.getenv("AGENT_SERVICE_TOKEN")
    if database and token:
        app = create_app(
            model=None,
            tools=None,
            service_token=token,
            store=ConversationStore(postgres_engine(database)),
        )
    else:
        app = FastAPI(title="Studio Agent (development)")

        @app.post("/internal/v1/conversations/{id}/turns")
        async def unavailable() -> None:
            raise HTTPException(
                503,
                "Configure the Agent database and model before submitting a request",
            )

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"running": True, "create_form_ready": False}

    return app
