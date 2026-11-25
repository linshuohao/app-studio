import json

from pydantic import JsonValue

from form_agent.agent.authoring_state import CheckEvidence
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.requirements import StandardRequirements
from form_agent.integrations.compiler import CheckCandidate, candidate_digest


async def compile_candidate(
    candidate_text: str,
    context: dict[str, JsonValue],
    compiler: CheckCandidate,
    checks: CheckEvidence,
    max_checks: int,
) -> dict[str, JsonValue]:
    digest = candidate_digest(candidate_text)
    if digest in checks.receipts:
        return checks.receipts[digest].model_dump(mode="json")
    if digest in checks.attempted:
        return {"status": "check_in_progress"}
    if len(checks.attempted) >= max_checks:
        return {"status": "check_budget_exhausted"}

    checks.attempted.add(digest)
    try:
        receipt = await compiler(context, candidate_text)
        expected_environment = context.get("check_environment")
        if expected_environment and receipt.check_environment != expected_environment:
            raise InvalidCreateFormResult(
                "Compiler receipt does not match the requested environment"
            )
        if receipt.candidate_digest != digest:
            raise InvalidCreateFormResult(
                "Compiler receipt does not match the submitted candidate"
            )
        if not receipt.success and not any(
            d.get("code") or d.get("message") for d in receipt.diagnostics
        ):
            raise InvalidCreateFormResult(
                "Compiler failure has no actionable diagnostics"
            )
    except Exception as error:
        checks.tool_failure = error
        raise
    checks.receipts[digest] = receipt
    if receipt.success:
        checks.passed_text[digest] = candidate_text
    else:
        checks.failed_text[digest] = candidate_text
    return receipt.model_dump(mode="json")


def submit_candidate(checks: CheckEvidence, text: str) -> dict[str, JsonValue]:
    if checks.pending_candidate is not None and checks.pending_candidate != text:
        raise InvalidCreateFormResult(
            "Multiple candidates submitted for the same action"
        )
    checks.pending_candidate = text
    return {"status": "queued_for_check", "candidate_digest": candidate_digest(text)}


def bind_candidate_submission_tool(
    checks: CheckEvidence,
    standard: StandardRequirements | None,
):
    async def check_candidate(candidate_text: str) -> JsonValue:
        """Submit the final candidate text for the Graph to check with the target Compiler."""
        if standard is not None and (
            not checks.configuration_mapping
            or any(
                item.status not in {"ready", "deferred_to_host"}
                for item in checks.configuration_mapping
            )
        ):
            checks.mapping_check_blocked = True
            return {"status": "ready_configuration_mapping_required"}
        checks.mapping_check_blocked = False
        return submit_candidate(checks, candidate_text)

    return check_candidate


def _at_pointer(root, pointer):
    for raw in pointer.split("/")[1:]:
        key = raw.replace("~1", "/").replace("~0", "~")
        root = (
            root[int(key)] if isinstance(root, list) and key.isdecimal() else root[key]
        )
    return root


def _diagnosed_schema_paths(form, receipt):
    paths = set()
    for diagnostic in receipt.diagnostics:
        if diagnostic.get("code") not in {"BINDING_INCOMPATIBLE", "BINDING_UNPROVEN"}:
            continue
        pointer = diagnostic.get("sourcePointer")
        if not isinstance(pointer, str):
            continue
        try:
            binding = _at_pointer(form, pointer)
        except (IndexError, KeyError, TypeError):
            continue
        if isinstance(binding, dict) and binding.get("source") == "data":
            binding = binding.get("path")
        if isinstance(binding, str) and binding.startswith("/"):
            paths.add(
                "/data/schema"
                + "".join("/properties/" + part for part in binding[1:].split("/"))
            )
    return paths


def bind_repair_field(checks):
    async def repair_field(
        failed_digest: str, schema_pointer: str, property_schema_json: str
    ) -> dict[str, JsonValue]:
        """Replace one existing property under /data/schema in a failed candidate, then compile the entire merged form. Use for binding proof failures."""
        receipt = checks.receipts.get(failed_digest)
        if (
            failed_digest not in checks.failed_text
            or not receipt
            or not any(
                d.get("code") in ("BINDING_UNPROVEN", "BINDING_INCOMPATIBLE")
                for d in receipt.diagnostics
            )
        ):
            return {"status": "failed_binding_required"}
        parts = schema_pointer.split("/")[1:]
        if (
            not schema_pointer.startswith("/data/schema/")
            or len(parts) < 4
            or parts[-2] != "properties"
        ):
            return {"status": "expected_property_schema_pointer"}
        form = json.loads(checks.failed_text[failed_digest])
        if schema_pointer not in _diagnosed_schema_paths(form, receipt):
            return {"status": "field_not_identified_by_binding_diagnostic"}
        try:
            schema = json.loads(property_schema_json)
            if not isinstance(schema, (dict, bool)):
                raise ValueError()
            parent = form
            for key in parts[:-1]:
                parent = (
                    parent[int(key)]
                    if isinstance(parent, list)
                    else parent[key.replace("~1", "/").replace("~0", "~")]
                )
            key = parts[-1].replace("~1", "/").replace("~0", "~")
            if not isinstance(parent, dict) or key not in parent:
                raise KeyError(key)
        except (ValueError, KeyError, TypeError, IndexError):
            return {"status": "invalid_property_replacement"}
        if parent[key] == schema:
            return receipt.model_dump(mode="json")
        parent[key] = schema
        return submit_candidate(checks, json.dumps(form, ensure_ascii=False))

    return repair_field
