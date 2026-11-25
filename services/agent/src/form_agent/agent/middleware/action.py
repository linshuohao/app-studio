from collections.abc import Awaitable, Callable

from form_agent.agent.state import Action, ActionObservation, TurnGraphState


def action_node(name: Action, run: Callable[[TurnGraphState], Awaitable[dict]]):
    async def execute(state: TurnGraphState):
        state_updates = await run(state)
        return {
            "steps": state.get("steps", 0) + 1,
            "observation": ActionObservation(name, state_updates),
        }

    return execute
