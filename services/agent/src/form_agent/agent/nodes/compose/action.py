from form_agent.agent.nodes.compose.node import compose
from form_agent.agent.state import TurnGraphState
from form_agent.agent.tools.turn_reads import turn_tools


async def compose_candidate(state: TurnGraphState, *, model):
    updates = await compose(
        state,
        model=model,
        tools=turn_tools(state),
        verify_candidate=state.get("verify_candidate"),
    )

    previous = state.get("composition")
    if state.get("verify_candidate") and previous:
        # Reuse this turn's exact receipt after refreshing coverage of the same
        # immutable candidate. Copy the attempt budget as well as the artifacts.
        checks = updates["composition"].checks
        checks.receipts.update(previous.checks.receipts)
        checks.passed_text.update(previous.checks.passed_text)
        checks.failed_text.update(previous.checks.failed_text)
        checks.attempted.update(previous.checks.attempted)
    return updates
