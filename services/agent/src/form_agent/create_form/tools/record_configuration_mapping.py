from pydantic import JsonValue

from form_agent.create_form.nodes.compose.reads import AuthoringReads
from form_agent.create_form.state import CheckEvidence
from form_agent.requirements import ConfigurationMapping, StandardRequirements


def bind_record_configuration_mapping(
    standard: StandardRequirements, reads: AuthoringReads, checks: CheckEvidence
):
    async def record_configuration_mapping(items: list[ConfigurationMapping]) -> dict[str, JsonValue]:
        """Record protocol and catalog checked destinations for every standard requirement.
        Use deferred_to_host for requirements that depend on production Context,
        Host binding, or submission integration and do not prevent local preview.
        Describe the required binding and the unverified behavior in detail.
        Use open statuses for missing evidence, decisions or unavailable capabilities.
        Call before submitting any candidate to the Compiler.
        """
        if not reads.protocol_read or not reads.catalog_results:
            return {"status": "protocol_and_target_catalog_required"}
        ids = {item.id for item in standard.requirements}
        if len(items) != len(ids) or {item.requirement_id for item in items} != ids:
            return {
                "status": "incomplete_mapping",
                "expected_requirement_ids": list[JsonValue](sorted(ids)),
            }
        if checks.attempted:
            return {"status": "mapping_locked_after_first_compiler_check"}
        checks.configuration_mapping = items
        return {"status": "recorded"}

    return record_configuration_mapping
