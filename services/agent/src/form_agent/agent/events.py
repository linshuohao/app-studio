"""Public execution milestones for a Compose turn."""

from langchain_core.runnables.config import (
    ensure_config,
    get_async_callback_manager_for_config,
)


async def emit_compose_phase(stage, status, *, attempt=None, detail=None):
    manager = get_async_callback_manager_for_config(ensure_config())
    if manager.parent_run_id is None:
        return
    payload = {"stage": stage, "status": status}
    if attempt is not None:
        payload["attempt"] = attempt
    if detail:
        payload["detail"] = detail
    await manager.on_custom_event(
        "compose_phase", payload, run_id=manager.parent_run_id
    )
