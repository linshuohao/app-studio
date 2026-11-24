from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from langchain_core.language_models import BaseChatModel

from form_agent.api.conversations import conversation_router
from form_agent.conversations.store import (
    ConversationConflict,
    ConversationStore,
    MissingConversation,
    StoreUnavailable,
)
from form_agent.integrations.dependencies import CreateFormTools


def create_app(
    *,
    model: BaseChatModel | None,
    tools: CreateFormTools | None,
    service_token: str,
    store: ConversationStore,
    timeout_seconds: float = 60,
) -> FastAPI:
    if not service_token:
        raise ValueError("Agent requires a service token")
    app = FastAPI(title="Studio Agent")

    @app.exception_handler(StoreUnavailable)
    async def unavailable(request: Request, error: StoreUnavailable):
        return JSONResponse(
            {"detail": "Conversation store in maintenance"}, status_code=503
        )

    @app.exception_handler(MissingConversation)
    async def not_found(request: Request, error: MissingConversation):
        return JSONResponse({"detail": "Conversation not found"}, status_code=404)

    @app.exception_handler(ConversationConflict)
    async def conflict(request: Request, error: ConversationConflict):
        return JSONResponse({"detail": str(error)}, status_code=409)

    app.include_router(
        conversation_router(
            model=model,
            tools=tools,
            service_token=service_token,
            store=store,
            timeout_seconds=timeout_seconds,
        )
    )
    return app
