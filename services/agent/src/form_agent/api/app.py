from collections.abc import Callable
from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.language_models import BaseChatModel

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.api.conversations import conversation_router
from form_agent.business.conversations.store import (
    ConversationConflict,
    ConversationStore,
    MissingConversation,
    StoreUnavailable,
)


def create_app(
    *,
    model: BaseChatModel | None,
    tools: AgentToolDependencies | None,
    service_token: str,
    store: ConversationStore,
    timeout_seconds: float = 60,
    trace_callback_factory: Callable[[UUID], list[BaseCallbackHandler]] | None = None,
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
            trace_callback_factory=trace_callback_factory,
        )
    )
    return app
