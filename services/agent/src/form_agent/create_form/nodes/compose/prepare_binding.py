"""Prepare independent inputs to the binding step in one compose invocation."""

import asyncio
import json
import logging
from time import monotonic

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, field_validator

from form_agent.execution import structured


class SchemaDraft(BaseModel, extra="forbid"):
    schema_text: str

    @field_validator("schema_text")
    @classmethod
    def valid_schema_object(cls, value: str) -> str:
        # A regex such as \d is valid in a pattern but needs an escaped
        # backslash inside JSON. Repair only positions identified by the decoder.
        for _ in range(64):
            try:
                schema = json.loads(value)
                break
            except json.JSONDecodeError as error:
                if error.msg != "Invalid \\escape":
                    raise
                value = value[:error.pos] + chr(92) + value[error.pos:]
        else:
            raise ValueError("Too many invalid JSON escapes")
        if not isinstance(schema, dict):
            raise ValueError("Expected a JSON Schema object")
        return value


class CapabilitySelection(BaseModel, extra="forbid"):
    material: list[str]
    pure_function: list[str]


def exact_request_matches(materials, host):
    """Record exact request-contract matches. Other contracts still need binding review."""
    operations = host.get("requests", {}) if isinstance(host, dict) else {}
    matches = {}
    for material in materials if isinstance(materials, list) else []:
        if not isinstance(material, dict):
            continue
        for name, port in material.get("requests", {}).items():
            matches[f"{material['id']}.{name}"] = [
                operation
                for operation, signature in operations.items()
                if all(
                    key in port and port[key] == signature.get(key)
                    for key in ("payloadSchema", "resultSchema")
                )
            ]
    return matches


async def prepare_binding(model, standard, catalog, reference):
    facts = standard.model_dump(mode="json")
    log = logging.getLogger("uvicorn.error")

    async def schema():
        start = monotonic()
        payload = {
            "requirements": [
                r
                for r in facts["requirements"]
                if r["kind"] in ("field", "data", "validation")
            ]
        }
        if reference:
            try:
                payload["current_schema"] = json.loads(reference)["data"]["schema"]
            except (ValueError, KeyError, TypeError):
                # The binding step still receives the exact original working text.
                pass
        draft = await structured(
            model,
            SchemaDraft,
            [
                SystemMessage(
                    content="Produce the draft JSON Schema object for the business data only. Use stable field paths, preserve existing paths on revision. Dynamic selection submission shape can be adapted during binding. No view or Host configuration."
                ),
                HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
            ],
        )
        value = json.loads(draft.schema_text)
        if not isinstance(value, dict):
            raise ValueError("Expected a schema object")
        log.info(
            "binding_prepare branch=schema elapsed_ms=%d", (monotonic() - start) * 1000
        )
        return value

    async def capabilities():
        start = monotonic()
        materials, functions, host = await asyncio.gather(
            *(catalog(k, "") for k in ("material", "pure_function", "host"))
        )

        def ids(rows):
            return [r if isinstance(r, str) else r["id"] for r in rows]

        available = {"material": ids(materials), "pure_function": ids(functions)}
        selection = await structured(
            model,
            CapabilitySelection,
            [
                SystemMessage(
                    content="Select actual IDs needed for these requirements. Include layout, field wrapper, conditional mount and control materials as applicable. Core expression operators need no pure function. Never invent IDs."
                ),
                HumanMessage(
                    content=json.dumps(
                        {
                            "requirements": [
                                r["behavior"] for r in facts["requirements"]
                            ],
                            "available": available,
                        },
                        ensure_ascii=False,
                    )
                ),
            ],
        )

        async def manifests(kind):
            selected = [
                i
                for i in dict.fromkeys(getattr(selection, kind))
                if i in available[kind]
            ]
            return await catalog(kind, " ".join(selected)) if selected else []

        m, f = await asyncio.gather(manifests("material"), manifests("pure_function"))
        log.info(
            "binding_prepare branch=capabilities elapsed_ms=%d",
            (monotonic() - start) * 1000,
        )
        return {
            "material": m,
            "pure_function": f,
            "host": host,
            "exact_request_matches": exact_request_matches(m, host),
            "available_ids": available,
        }

    async with asyncio.TaskGroup() as tasks:
        a = tasks.create_task(schema())
        b = tasks.create_task(capabilities())
    return {"schema_draft": a.result(), "capabilities": b.result()}
