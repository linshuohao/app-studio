from form_agent.agent.state import TurnGraphState


def observe(state: TurnGraphState):
    step_count = state.get("steps", 0)
    event = state.get("observation")
    if event is None or step_count == state.get("observed", 0):
        return {}
    return {**event.updates, "observed": step_count}
