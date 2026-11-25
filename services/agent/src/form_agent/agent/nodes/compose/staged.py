"""Compose a new structured PRD from a checked schema and owned protocol fragments."""

import asyncio
import json
import re
from dataclasses import replace
from typing import Literal, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from pydantic import BaseModel, Field, JsonValue

from form_agent.agent.authoring_state import CheckEvidence, Composition, RepairRound
from form_agent.agent.events import emit_compose_phase
from form_agent.agent.nodes.compose.prepare_binding import CapabilitySelection
from form_agent.agent.tools.candidate_checks import submit_candidate
from form_agent.business.form_authoring.contracts import (
    BindingEvidence,
    Blocked,
    ComposeCheckpoint,
)
from form_agent.business.form_authoring.errors import InvalidCreateFormResult
from form_agent.business.form_authoring.evidence import environment
from form_agent.business.form_authoring.requirements import ConfigurationMapping
from form_agent.execution.errors import interruption_reason
from form_agent.execution.model_calls import structured
from form_agent.integrations.compiler import candidate_digest

Module = Literal["view", "validation", "reaction"]
Output = TypeVar("Output", bound=BaseModel)
OWNED: dict[Module, tuple[str, ...]] = {
    "view": ("views", "viewTemplates"),
    "validation": ("constraints", "validationMessages"),
    "reaction": ("reactions",),
}
GUIDE = {
    "view": ("视图", "物料契约", "数据命令", "Host事件", "Host契约", "创作简写"),
    "validation": ("表达式、校验", "校验与消息", "纯函数签名", "Host契约"),
    "reaction": (
        "表达式、校验",
        "数据命令",
        "表单与联动",
        "Reaction：",
        "Host事件",
        "纯函数签名",
    ),
}


class SchemaCase(BaseModel, extra="forbid"):
    name: str = Field(min_length=1, max_length=100)
    data: JsonValue
    valid: bool
    layer: Literal["schema", "runtime", "host"] = "schema"

    def check_input(self):
        return self.model_dump(mode="json", exclude={"layer"})


class SchemaDraft(BaseModel, extra="forbid"):
    schema_text: str
    remaining_validation: dict[str, str]
    coverage: dict[str, list[str]]


class SchemaCases(BaseModel, extra="forbid"):
    cases: list[SchemaCase] = Field(max_length=16)


class Fragment(BaseModel, extra="forbid"):
    fragment_text: str = "{}"
    coverage: dict[str, list[str]] = Field(default_factory=dict)
    deferred: dict[str, str] = Field(default_factory=dict)
    blocker: str | None = None


class SchemaCounterexample(BaseModel, extra="forbid"):
    requirement_id: str
    source_quote: str
    case: SchemaCase


class Reflection(BaseModel, extra="forbid"):
    module: Module | None = None
    counterexample: SchemaCounterexample | None = None
    reason: str = Field(min_length=1)


class CounterexampleReview(BaseModel, extra="forbid"):
    isolates_requirement: bool
    expressible_in_data_schema: bool


def json_text(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


async def ask(model, result_type: type[Output], instructions, payload) -> Output:
    async def generate(messages):
        return await structured(model, result_type, messages, method="function_calling")

    phase = payload.get("module", result_type.__name__)
    return await RunnableLambda(generate, name=f"compose.{phase}").ainvoke(
        [SystemMessage(content=instructions), HumanMessage(content=json_text(payload))]
    )


async def parallel(*operations):
    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(operation) for operation in operations]
    return [task.result() for task in tasks]


def object_from(text: str) -> dict:
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def parse_schema(text: str):
    # The model transports Schema as JSON inside a structured result. Restore
    # single-escaped regex metacharacters at the decoder's exact error location.
    for _ in range(64):
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            if (
                error.msg == "Invalid \\escape"
                and error.pos + 1 < len(text)
                and text[error.pos + 1] in r"dDsSwWbB.+*?^$()[]{}|-/pPkK"
            ):
                text = text[: error.pos] + chr(92) + text[error.pos :]
                continue
            return {}, {
                "code": "DATA_SCHEMA_JSON_INVALID",
                "offset": error.pos,
                "message": error.msg,
            }
        if isinstance(value, dict) and value:
            return value, None
        return {}, {"code": "DATA_SCHEMA_OBJECT_REQUIRED"}
    return {}, {
        "code": "DATA_SCHEMA_JSON_INVALID",
        "message": "Too many invalid escapes",
    }


def named_requests(requirements, requests):
    text = "\n".join(source.quote for req in requirements for source in req.sources)
    return {
        name
        for name in requests
        if re.search(
            r"(?<![\w.])" + re.escape(name) + r"(?![\w.])", text, flags=re.ASCII
        )
    }


def request_projection(standard, ids):
    return {
        "shared_assumptions": list(dict.fromkeys(standard.assumptions)),
        "requirements": [
            req.model_dump(mode="json", exclude_defaults=True, exclude_none=True)
            for req in standard.requirements
            if req.id in ids
        ],
        "issues": [
            issue.model_dump(mode="json")
            for issue in standard.issues
            if ids.intersection(issue.requirement_ids)
        ],
    }


def require_schema_receipt(context, text, receipt):
    environment = context.get("check_environment")
    if (
        receipt.candidate_digest != candidate_digest(text)
        or (environment and receipt.check_environment != environment)
        or (not receipt.success and not receipt.diagnostics)
    ):
        raise InvalidCreateFormResult("Invalid Data Schema check receipt")


def host_data_contracts(standard, host):
    if not isinstance(host, dict) or not isinstance(
        requests := host.get("requests"), dict
    ):
        return {}
    requested = named_requests(
        (req for req in standard.requirements if req.kind in {"field", "data", "host"}),
        requests,
    )
    return {
        name: signature["resultSchema"]
        for name, signature in requests.items()
        if isinstance(signature, dict)
        and "resultSchema" in signature
        and name in requested
    }


def scalar_choice_diagnostics(schema, path=""):
    if not isinstance(schema, dict):
        return []
    diagnostics = []
    branches = schema.get("oneOf")
    if (
        schema.get("type") in (None, "string")
        and isinstance(branches, list)
        and branches
        and all(
            isinstance(branch, dict)
            and set(branch) <= {"const", "title"}
            and isinstance(branch.get("const"), str)
            for branch in branches
        )
        and len({branch["const"] for branch in branches}) == len(branches)
    ):
        diagnostics.append(
            {
                "code": "DATA_SCHEMA_SCALAR_ENUM_REQUIRED",
                "sourcePointer": path + "/oneOf",
                "message": "Use type string and enum with the same codes for material binding proof. Keep choice labels in the view.",
            }
        )
    properties = schema.get("properties")
    if isinstance(properties, dict):
        for name, field in properties.items():
            token = name.replace("~", "~0").replace("/", "~1")
            diagnostics.extend(
                scalar_choice_diagnostics(field, path + "/properties/" + token)
            )
    diagnostics.extend(scalar_choice_diagnostics(schema.get("items"), path + "/items"))
    return diagnostics


def seed_editable_objects(schema, coverage, fields):
    """Initialize required object parents needed to write authored descendant fields."""
    for key in fields:
        for path in coverage.get(key, []):
            current = schema
            parts = path.split("/")[1:]
            for position in range(0, len(parts) - 2, 2):
                if parts[position] != "properties" or not isinstance(current, dict):
                    break
                props = current.get("properties")
                if not isinstance(props, dict):
                    break
                name = parts[position + 1].replace("~1", "/").replace("~0", "~")
                required = current.get("required", [])
                if not isinstance(required, list) or name not in required:
                    break
                current = props.get(name)
                if isinstance(current, dict) and current.get("type") == "object":
                    current.setdefault("default", {})


async def schema_stage(
    model,
    standard,
    context,
    check_schema,
    reopen=None,
    contracts=None,
    checkpoint=None,
    validator_usage=None,
    event_usage=None,
):
    ids = {
        item.id
        for item in standard.requirements
        if item.kind in {"field", "data", "validation"}
    }
    fields = {item.id for item in standard.requirements if item.kind == "field"}
    data_ids = {
        item.id for item in standard.requirements if item.kind == "data"
    } | fields
    projection = request_projection(standard, ids)
    if contracts:
        projection["host_result_schemas"] = contracts
    if validator_usage:
        projection["validator_usage"] = validator_usage
    if event_usage:
        projection["event_usage"] = event_usage
    projection["view_facts"] = [
        req.behavior for req in standard.requirements if req.kind == "view"
    ]
    extra_allowed = {
        item.id
        for item in standard.requirements
        if item.kind == "validation"
        or (item.kind == "field" and item.field and item.field.validation)
    }
    cases: list[JsonValue]
    if reopen is not None:
        cases = reopen["cases"]
        repair = {
            "previous_schema": reopen["schema"],
            "diagnostics": reopen["diagnostics"],
        }
    elif checkpoint is not None and any(
        isinstance(case, dict) and case.get("valid") is True
        for case in checkpoint.schema_cases or []
    ):
        cases = checkpoint.schema_cases or []
        repair = {}
        if checkpoint.previous_schema is not None:
            repair = {
                "previous_schema": checkpoint.previous_schema,
                "diagnostics": checkpoint.diagnostics,
            }
        await emit_compose_phase("schema", "started", detail="已复用上次 Schema 用例。")
    else:
        plan = (
            await ask(
                model,
                SchemaCases,
                "Derive examples independently from the source requirements. Include a valid root data "
                "instance and targeted invalid cases (bound exceeded, required or conditional field "
                "missing) wherever supported by the source. Preserve explicitly named field paths and "
                "choose concise stable paths only when the source does not supply them. "
                "Use matching paths from applicable Host usage for requirements without exact keys. "
                "For a roster with a fixed self card and a shared applicant use one working identity. Keep "
                "unrelated values valid in negative examples. Set layer to schema only for an "
                "assertion standard JSON Schema 2020-12 can decide on this instance alone. "
                "Classify comparisons of two dates, business today, actual calendar/date format, "
                "normalization, uniqueness by member property, computed age, editing and reactions "
                "as runtime, and external service responses as host. Put the decisive layer in each "
                "case; provide at least one valid schema case. Reuse minimal fixtures.",
                projection,
            )
            if ids
            else SchemaCases(cases=[])
        )
        cases = [
            sample.check_input() for sample in plan.cases if sample.layer == "schema"
        ]
        if checkpoint is not None:
            checkpoint.schema_cases = cases
            checkpoint.later_cases = [
                sample.model_dump(mode="json")
                for sample in plan.cases
                if sample.layer != "schema"
            ]
        repair = {}
    if ids and not any(
        isinstance(case, dict) and case.get("valid") is True for case in cases
    ):
        return {}, {}, {}, cases, None, [{"code": "DATA_SCHEMA_VALID_CASE_REQUIRED"}]
    seen = set()
    for attempt in range(1, 4):
        if attempt > 1:
            await emit_compose_phase(
                "schema",
                "retrying",
                attempt=attempt,
                detail="上次未通过数据或需求覆盖检查。",
            )
        draft = await ask(
            model,
            SchemaDraft,
            "Author data.schema from the supplied confirmed business requirements. Use JSON Schema "
            "2020-12 and express data-based cross-field constraints. Format is annotation only. "
            "For a fixed set of scalar string codes use type string and enum; option labels "
            "belong in the view. Compiler binding proof accepts this form. "
            "Use explicit object/null anyOf branches for nullable objects. A label, visibility, UI, "
            "missing default, Host action and data mutation never belong in remaining_validation. "
            "When a sourced default or initial member is required, define the JSON Schema "
            "default on the owning property; Runtime fills it on initialization. Read view_facts "
            "for explicitly sourced first-render behavior. For a fixed self roster initialize "
            "the roster property with one self marker; do not duplicate the applicant identity "
            "in Working Data. A tolerant field pattern can validate the trimmed interpretation "
            "of an email using optional leading/trailing whitespace. Forbid internal whitespace. "
            "Submission projection owns the actual trim. "
            "For editable member lists use one shared items schema. The target Compiler cannot "
            "prove scoped bindings into prefixItems tuples. Express a locked first member and "
            "position-dependent validity in the view/runtime, with residual validation when "
            "applicable. Keep list cardinality and the common item shape in data.schema. "
            "Prefer short ASCII working paths for fields without sourced storage keys. Keep "
            "customer-facing labels in Chinese. If a relevant target validator requires exact "
            "working paths, align the editable data shape to its documented paths unless the "
            "requirements already specify different paths. "
            "If a field explicitly stores a complete item from an identified Host result, preserve "
            "that item's declared required keys, types and additionalProperties exactly. "
            "For a real non-Schema assertion, use only allowed_validation_ids and describe the "
            "assertion still needed. Preserve each field and data requirement in Schema coverage. "
            "Map every implemented field and assertion to existing JSON pointers relative to the "
            "root Schema in coverage. Field pointers must resolve below a properties declaration. "
            "Use the supplied independently derived root data cases and keep their expectations.",
            {
                **projection,
                **repair,
                "cases": cases,
                "allowed_validation_ids": sorted(extra_allowed),
            },
        )
        schema, parse_error = parse_schema(draft.schema_text)
        remaining = {
            key: behavior
            for key, behavior in draft.remaining_validation.items()
            if key in extra_allowed and behavior.strip()
        }
        coverage = {key: paths for key, paths in draft.coverage.items() if key in ids}
        seed_editable_objects(schema, coverage, fields)
        missing = (ids - (set(coverage) | set(remaining))) | (data_ids - set(coverage))
        invalid_pointers = {
            key: paths
            for key, paths in coverage.items()
            if not paths
            or any(not pointer_exists(schema, path) for path in paths)
            or (key in fields and not any("/properties/" in path for path in paths))
        }
        if parse_error:
            diagnostics = [parse_error]
        elif missing or invalid_pointers:
            diagnostics = [
                {
                    "code": "DATA_SCHEMA_COVERAGE_INCOMPLETE",
                    "missing_ids": sorted(missing),
                    "invalid_pointers": invalid_pointers,
                }
            ]
        elif choice_diagnostics := scalar_choice_diagnostics(schema):
            diagnostics = choice_diagnostics
        else:
            text = json_text(schema)
            receipt = await check_schema(context, text, cases)
            require_schema_receipt(context, text, receipt)
            if receipt.success:
                return (
                    schema,
                    remaining,
                    coverage,
                    cases,
                    receipt,
                    [],
                )
            diagnostics = receipt.diagnostics
        failure = json_text([schema or draft.schema_text, diagnostics])
        if failure in seen:
            break
        seen.add(failure)
        repair.update(
            previous_schema=json_text(schema) if schema else draft.schema_text,
            diagnostics=diagnostics,
        )
        if checkpoint is not None:
            checkpoint.previous_schema = repair["previous_schema"]
            checkpoint.diagnostics = diagnostics
    return {}, {}, {}, cases, None, repair["diagnostics"]


async def catalog_stage(model, standard, context, query):
    materials, functions, host = await parallel(
        *(query(context, kind, "") for kind in ("material", "pure_function", "host"))
    )

    def catalog_ids(entries):
        return (
            [entry for entry in entries if isinstance(entry, str)]
            if isinstance(entries, list)
            else []
        )

    available = {
        "material": catalog_ids(materials),
        "pure_function": catalog_ids(functions),
    }
    selected = await ask(
        model,
        CapabilitySelection,
        "Select real material and pure_function IDs for these requirements. Include compatible "
        "view containers, conditional layout and controls. Never invent IDs.",
        {
            "requirements": [req.behavior for req in standard.requirements],
            "available": available,
            "contract_questions": [
                issue.detail
                for issue in standard.issues
                if issue.disposition == "look_up_source"
            ],
        },
    )

    async def manifests(kind):
        names = [
            name
            for name in dict.fromkeys(getattr(selected, kind))
            if name in available[kind]
        ]
        return await query(context, kind, " ".join(names)) if names else []

    materials, functions = await parallel(
        manifests("material"), manifests("pure_function")
    )
    return {"material": materials, "pure_function": functions, "host": host}


def manual_excerpt(manual, module: Module) -> JsonValue:
    if not isinstance(manual, dict) or not isinstance(
        markdown := manual.get("markdown"), str
    ):
        return manual
    sections = re.split(r"(?=^#{1,6}\s+)", markdown, flags=re.MULTILINE)
    selected = [
        section
        for section in sections
        if section
        and any(
            word in section.splitlines()[0]
            for word in (*GUIDE[module], "引用与作用域", "表达式与值")
        )
    ]
    return "\n".join(selected)


def module_ids(standard, module: Module, constraint_ids):
    if module == "validation":
        return set(constraint_ids)
    kinds = {"view", "field"} if module == "view" else {module}
    return {req.id for req in standard.requirements if req.kind in kinds}


def pointer_exists(fragment, pointer):
    if not pointer.startswith("/"):
        return False
    value = fragment
    try:
        for token in pointer[1:].split("/"):
            key = token.replace("~1", "/").replace("~0", "~")
            value = (
                value[int(key)]
                if isinstance(value, list) and key.isdecimal()
                else value[key]
            )
    except (IndexError, KeyError, TypeError, ValueError):
        return False
    return True


def map_declared_view_requests(fragment, standard, host, coverage):
    requests = host.get("requests")
    if not isinstance(requests, dict):
        return coverage
    paths = {}
    visited_templates = set()
    templates = fragment.get("viewTemplates")
    templates = templates if isinstance(templates, dict) else {}

    def visit(node, pointer):
        if not isinstance(node, dict):
            return
        if "material" in node and isinstance(bindings := node.get("requests"), dict):
            for port, binding in bindings.items():
                if (
                    not isinstance(binding, dict)
                    or binding.get("type") != "host.request"
                ):
                    continue
                name = binding.get("request")
                if isinstance(name, str) and name in requests:
                    paths.setdefault(name, []).append(
                        pointer + "/requests/" + escape(port)
                    )
        if isinstance(children := node.get("children"), list):
            for index, child in enumerate(children):
                visit(child, f"{pointer}/children/{index}")
        if isinstance(slots := node.get("slots"), dict):
            for slot, children in slots.items():
                if isinstance(children, list):
                    for index, child in enumerate(children):
                        visit(child, f"{pointer}/slots/{escape(slot)}/{index}")
        if "scope" in node:
            visit(node.get("node"), pointer + "/node")
        template_name = node.get("$use")
        if isinstance(template_name, str) and template_name not in visited_templates:
            visited_templates.add(template_name)
            if isinstance(template := templates.get(template_name), dict):
                visit(
                    template.get("node"), f"/viewTemplates/{escape(template_name)}/node"
                )

    def escape(key):
        return key.replace("~", "~0").replace("/", "~1")

    if isinstance(views := fragment.get("views"), dict):
        visit(views.get("default"), "/views/default")
    reported = dict(coverage)
    for requirement in standard.requirements:
        if requirement.kind == "host" and requirement.id not in reported:
            names = named_requests([requirement], requests)
            if len(names) == 1 and (name := next(iter(names))) in paths:
                reported[requirement.id] = paths[name]
    return reported


async def author_fragment(
    model,
    standard,
    module: Module,
    schema,
    evidence,
    manual,
    previous=None,
    missing_host_ids=(),
):
    await emit_compose_phase(module, "retrying" if previous else "started")
    try:
        result = await generate_fragment(
            model,
            standard,
            module,
            schema,
            evidence,
            manual,
            previous,
            missing_host_ids,
        )
    except Exception as error:
        await emit_compose_phase(module, "failed", detail=interruption_reason(error))
        raise
    if result[3]:
        await emit_compose_phase(module, "failed", detail=result[3])
    else:
        await emit_compose_phase(module, "completed")
    return result


async def generate_fragment(
    model,
    standard,
    module: Module,
    schema,
    evidence,
    manual,
    previous,
    missing_host_ids=(),
):
    required = module_ids(standard, module, evidence.remaining_validation)
    host_ids = {req.id for req in standard.requirements if req.kind == "host"}
    if module != "view" and not required and not host_ids:
        return {}, {}, {}, None
    catalog = evidence.capabilities
    host = catalog.get("host")
    host = host if isinstance(host, dict) else {}
    requests = host.get("requests")
    requests = requests if isinstance(requests, dict) else {}
    host_without_request = {
        req.id
        for req in standard.requirements
        if req.id in host_ids and not named_requests([req], requests)
    }
    allowed_deferrals = host_without_request if module != "reaction" else set()
    host_keys = {
        "view": ("requests", "events", "eventUsage", "context"),
        "validation": (
            "validators",
            "validatorUsage",
            "events",
            "eventUsage",
            "context",
        ),
        "reaction": ("events", "context"),
    }
    payload = {
        **request_projection(standard, required | host_ids),
        "required_ids": sorted(required),
        **(
            {"remaining_validation": evidence.remaining_validation}
            if module == "validation"
            else {}
        ),
        "module": module,
        "schema": schema,
        "owned_keys": OWNED[module],
        "protocol": manual_excerpt(manual, module),
        "host": {key: host[key] for key in host_keys[module] if key in host},
        "pure_functions": catalog.get("pure_function"),
    }
    support_kinds = {
        "view": {"data", "reaction", "validation"},
        "validation": {"data", "reaction"},
        "reaction": {"data", "validation"},
    }
    payload["related_rules"] = [
        {
            key: value
            for key, value in {
                "id": req.id,
                "behavior": req.behavior,
                "condition": req.condition,
                "exceptions": req.exceptions,
            }.items()
            if value
        }
        for req in standard.requirements
        if req.kind in support_kinds[module] and req.id not in required
    ]
    if module == "view":
        payload["materials"] = catalog.get("material")
    if module in {"validation", "reaction"} and evidence.later_cases:
        layers = {"runtime", "host"} if module == "validation" else {"runtime"}
        payload["acceptance"] = [
            {
                "name": case["name"],
                "expected_valid": case["valid"],
                "layer": case["layer"],
            }
            for case in evidence.later_cases
            if isinstance(case, dict) and case.get("layer") in layers
        ]
    if missing_host_ids:
        payload["missing_host_requirements"] = missing_host_ids
    for key in ("pure_functions", "materials"):
        if isinstance(payload.get(key), list):
            payload[key] = list(
                {json_text(entry): entry for entry in payload[key]}.values()
            )
    notes = {}
    if previous:
        notes = {"previous_fragment": previous[0], "diagnostics": previous[1]}
    for attempt in range(1, 4):
        if attempt > 1:
            await emit_compose_phase(
                module,
                "retrying",
                attempt=attempt,
                detail="上次未通过写入范围或需求映射检查。",
            )
        result = await ask(
            model,
            Fragment,
            "Author only the listed owned_keys of an Authoring FormDefinition. Implement only the residual behaviors listed in remaining_validation when it is supplied. Return a JSON object "
            "in fragment_text. The data schema is immutable. Use inline expressions and real target "
            "contracts. In coverage, map each required ID to one or more existing JSON pointers "
            "inside your fragment. Map every collected field to its actual control. For Host "
            "requirements claim only behavior you own. Resolve issues using supplied contracts. "
            "Treat exact source excerpts as the definition of business behavior. Storing a complete "
            "Host option means retaining its declared fields, without assuming undocumented keys. "
            "When a declared production dependency allows local preview but isn't verified, record its "
            "ID, the exact dependency and the preview limit in deferred. A production Host "
            "requirement with no local configuration may be deferred without a coverage pointer. "
            "View and Validation may record production-only gaps where no target request exists. Do not "
            "invent a Host name or store its verdict in user data. Missing required local "
            "material/function or unproven implementation is a blocker. Complete the locally "
            "supported part before deferring a specifically identified production dependency. "
            "For a validation needing an unavailable Host input, map the local field or rule "
            "pointer and record that dependency in deferred. Related rules supply dependencies "
            "such as age thresholds; their ownership remains with their original modules. "
            "A restriction on the accepted document type alone does not imply an identity "
            "verification service; preserve the stated eligibility and format. "
            "In the view use declared button events with protocol array commands when a specialized "
            "list material lacks controls, and check property-level Schema defaults before reporting "
            "missing startup data. Shared edit bindings and validation reads are owned by their "
            "modules; do not duplicate them as copy-on-change reactions. Date expiry validation "
            "asserts date.inclusiveDays(endDate, passportExpiry) is non-null, allowing the same "
            "day and watching both reads through the assertion. Use the person's passportExpiry "
            "as target. Array commands belong in a declared button activate intent. Insert at "
            "{kind: index, index: 1} after a guaranteed first member and use the member Scope "
            "handle for array.remove. The render scope is distinct from the value of its row. "
            "For an underwriting preview event use the declared no-payload event and record "
            "channel screening as a production dependency. Submission normalization and copying "
            "the applicant into the first output row are done by that event; keep shared input bindings. "
            "Only pass context references to functions whose input accepts any JSON. "
            "For today's date window, if the catalog provides travel.isTripRangeAllowed, "
            "the upper bound is expressed with the inclusive-day limit and excluding "
            "today uses the negation of that same function with limit 1. "
            "Before comparing date.inclusiveDays or date.ageInYears numerically, explicitly "
            "guard the same expression from null with core.ne inside core.and. "
            "For view authoring include one view named default. Return a concise blocker in the "
            "user's language if this module cannot proceed. "
            + (
                "Every evaluated dynamic prop must return its declared type when referenced data "
                "is absent on first render or removed later. For a dependent search that becomes "
                "available after selecting its parent field, wrap the control in a condition "
                "whose visible is core.exists(parentRef). Inside that condition the search's "
                "filterKey can directly reference the parent. Put any country-dependent notes "
                "inside a condition too. Use core.and(core.exists(ref), text.isNonBlank(ref)) "
                "if an existing string can be blank. The condition does not mount children "
                "while false, and core.and short-circuits. Preserve these guards when repairing "
                "compiler diagnostics. Omit props that only restate material defaults. "
                "Prefer inline controls with direct schema references when the applicant and "
                "family rows differ in shape. Do not require a shared whole-object template "
                "binding: the applicant and self card can bind the same individual paths, "
                "and family cards can bind their own scoped fields. "
                "For a control shown by a computed classification, use the evaluated classification "
                "field when declared by Schema. Read the rule and thresholds in related_rules "
                "to preserve the intended conditions across modules. If there is no persisted "
                "classification, compute the display predicate from the declared date functions "
                "and the current member's dates. "
                if module == "view"
                else ""
            )
            + (
                "A data watch already reacts to actual changes. For clearing a dependent value "
                "when a parent changes, use the parent watch and a set-to-null command as in the "
                "published travel example. Do not require a previous-value field for this behavior."
                " For category-specific data, target only the affected member. When the new "
                "classification can be determined and the data no longer applies, clear the "
                "member's stale values. Keep values during an indeterminate classification. "
                "For clearing a guardian declaration or emergency contact when a member becomes "
                "an adult, gate on the computed adult classification and clear only that member's "
                "inapplicable data. A same-category date edit with no stale data makes no change. "
                "The cleanup requires neither a persisted age classification nor an old value "
                "in the watch. For other rules requiring transition-specific behavior, compare "
                "a declared existing derived category with the new value before writing it."
                if module == "reaction"
                else ""
            ),
            {**payload, **notes},
        )
        if result.blocker:
            return {}, {}, {}, result.blocker
        fragment = object_from(result.fragment_text)
        coverage = result.coverage
        if module == "view":
            coverage = map_declared_view_requests(fragment, standard, host, coverage)
        if (
            not set(fragment) - set(OWNED[module])
            and (
                module != "view"
                or (
                    isinstance(fragment.get("views"), dict)
                    and "default" in fragment["views"]
                )
            )
            and required <= set(coverage)
            and set(coverage) <= required | host_ids
            and set(missing_host_ids) <= set(coverage) | set(result.deferred)
            and set(result.deferred) <= set(coverage) | allowed_deferrals
            and all(reason.strip() for reason in result.deferred.values())
            and all(
                paths and all(pointer_exists(fragment, path) for path in paths)
                for paths in coverage.values()
            )
        ):
            return fragment, coverage, result.deferred, None
        problems = []
        if missing := required - set(coverage):
            problems.append(
                f"Missing local requirement coverage: {', '.join(sorted(missing))}."
            )
        if unmapped := set(result.deferred) - set(coverage) - allowed_deferrals:
            problems.append(f"Unmapped deferrals: {', '.join(sorted(unmapped))}.")
        if unexpected := set(coverage) - required - host_ids:
            problems.append(
                f"Unexpected requirement coverage: {', '.join(sorted(unexpected))}."
            )
        for key, paths in coverage.items():
            if not paths or any(not pointer_exists(fragment, path) for path in paths):
                problems.append(
                    f"{key} has missing or invalid configuration pointers: {paths}."
                )
        notes = {
            "previous_fragment": result.fragment_text,
            "diagnostics": [
                "Emit only owned keys and supply existing JSON pointers for each required ID.",
                *problems,
            ],
        }
    return {}, {}, {}, "片段未通过写入范围或需求映射检查。" + " ".join(problems)


def blocked(checks, reason, evidence=None, checkpoint=None):
    return Composition(
        Blocked(kind="blocked", reason=reason),
        checks,
        evidence,
        compose_checkpoint=checkpoint,
    )


def normalize_issue_messages(fragment):
    # Plain strings from an authoring fragment have exactly the meaning of
    # an explicit inline MessageSpec. Keep constraints and their pointers intact.
    constraints = fragment.get("constraints")
    if not isinstance(constraints, list):
        return
    for constraint in constraints:
        if not isinstance(constraint, dict):
            continue
        issue = constraint.get("issue")
        if isinstance(issue, dict) and isinstance(issue.get("message"), str):
            issue["message"] = {"text": issue["message"]}


async def refresh_evidence(request, model, tools, standard, schema, evidence):
    if tools.check_schema is None:
        return evidence, "当前目标无法重新检查数据 Schema。"
    text = json_text(schema)
    if candidate_digest(text) != evidence.schema_check.candidate_digest:
        raise InvalidCreateFormResult("Staged candidate lost its checked Data Schema")
    context = request.context
    receipt = await tools.check_schema(context, text, evidence.schema_cases)
    require_schema_receipt(context, text, receipt)
    if not receipt.success:
        return evidence, "数据 Schema 未通过当前目标的检查：" + json_text(
            receipt.diagnostics
        )
    capabilities = await catalog_stage(
        model, standard, context, tools.query_capabilities
    )
    version = context.get("knowledge_version")
    return evidence.model_copy(
        update={
            "schema_check": receipt,
            "capabilities": capabilities,
            "target": str(context.get("target", "")),
            "knowledge_version": version if isinstance(version, str) else None,
        }
    ), None


async def verify_staged(request, model, tools, standard, failure):
    schema = json.loads(failure.candidate_text)["data"]["schema"]
    checks = CheckEvidence(configuration_mapping=failure.configuration_mapping)
    evidence, problem = await refresh_evidence(
        request, model, tools, standard, schema, failure.binding_evidence
    )
    if problem:
        return blocked(checks, problem, evidence)
    submit_candidate(checks, failure.candidate_text)
    return Composition(None, checks, evidence)


def compose_inputs(request, standard):
    facts = standard.model_dump(mode="json", exclude_defaults=True)
    for record in (*facts["requirements"], *facts.get("issues", [])):
        # The Store promotes a current message reference to turn:N when it
        # commits the turn. The verified quote stays identical.
        for source in record.get("sources", []):
            source.pop("source_id", None)
    document = request.requirements_document
    return candidate_digest(
        json_text(
            [
                1,
                environment(request),
                candidate_digest(document.markdown) if document else None,
                document.version if document else None,
                facts,
            ]
        )
    )


async def compose_staged(request, model, tools, standard):
    context = request.context
    checks = CheckEvidence()
    assert tools.check_schema is not None
    inputs = compose_inputs(request, standard)
    saved = request.previous_compose
    checkpoint = (
        saved.model_copy(deep=True)
        if saved is not None and saved.inputs == inputs
        else ComposeCheckpoint(inputs=inputs)
    )
    await emit_compose_phase("schema", "started")
    evidence = checkpoint.evidence
    if evidence is None:
        contracts = {}
        validator_usage = {}
        event_usage = {}
        if any(
            req.kind == "host" or (req.field and req.field.option_source)
            for req in standard.requirements
        ):
            host = await tools.query_capabilities(context, "host", "")
            contracts = host_data_contracts(standard, host)
            if isinstance(host, dict):
                validator_usage = host.get("validatorUsage")
                event_usage = host.get("eventUsage")
        (
            schema,
            remaining_validation,
            coverage,
            cases,
            receipt,
            diagnostics,
        ) = await schema_stage(
            model,
            standard,
            context,
            tools.check_schema,
            contracts=contracts,
            checkpoint=checkpoint,
            validator_usage=validator_usage,
            event_usage=event_usage,
        )
        if receipt is None:
            await emit_compose_phase(
                "schema", "failed", detail="数据 Schema 未通过定版检查。"
            )
            return blocked(
                checks,
                f"数据 Schema 未通过定版检查：{json_text(diagnostics)}",
                checkpoint=checkpoint,
            )
        checkpoint.previous_schema = json_text(schema)
        checkpoint.diagnostics = []
        await emit_compose_phase("schema", "completed")
        await emit_compose_phase("capabilities", "started")
        capabilities, manual = await parallel(
            catalog_stage(model, standard, context, tools.query_capabilities),
            tools.read_protocol(context, ""),
        )
        await emit_compose_phase("capabilities", "completed")
        version = context.get("knowledge_version")
        evidence = BindingEvidence(
            target=str(context.get("target", "")),
            knowledge_version=version if isinstance(version, str) else None,
            capabilities=capabilities,
            schema_check=receipt,
            remaining_validation=remaining_validation,
            schema_coverage=coverage,
            schema_cases=cases,
            later_cases=checkpoint.later_cases,
        )
        checkpoint.evidence = evidence
    else:
        text = checkpoint.previous_schema
        assert text is not None and evidence.schema_check is not None
        require_schema_receipt(context, text, evidence.schema_check)
        schema = json.loads(text)
        await emit_compose_phase("schema", "completed", detail="已复用定版 Schema。")
        await emit_compose_phase("capabilities", "completed", detail="已复用能力选择。")
        manual = await tools.read_protocol(context, "")
    return await assemble_staged(
        request,
        model,
        standard,
        schema,
        evidence,
        manual,
        checks,
        tools=tools,
        checkpoint=checkpoint,
    )


async def assemble_staged(
    request,
    model,
    standard,
    schema,
    evidence,
    manual,
    checks,
    *,
    tools=None,
    checkpoint=None,
):
    host = evidence.capabilities.get("host")
    operations = host.get("requests") if isinstance(host, dict) else None
    operations = operations if isinstance(operations, dict) else {}
    host_owners = {
        req.id: "view" if named_requests([req], operations) else "validation"
        for req in standard.requirements
        if req.kind == "host"
    }

    async def build(module):
        if checkpoint is not None and module in checkpoint.fragments:
            await emit_compose_phase(
                module, "completed", detail="已复用通过局部检查的片段。"
            )
            return (*checkpoint.fragments[module], None)
        prior_gap = checkpoint.module_diagnostics.get(module) if checkpoint else None
        result = await author_fragment(
            model,
            standard,
            module,
            schema,
            evidence,
            manual,
            previous=({}, [{"code": "FRAGMENT_CAPABILITY_GAP", "message": prior_gap}])
            if prior_gap
            else None,
            missing_host_ids=(
                tuple(
                    key
                    for key in checkpoint.missing_host_ids
                    if host_owners[key] == module
                )
                if checkpoint is not None
                else ()
            ),
        )
        if checkpoint is not None:
            if result[3]:
                checkpoint.module_diagnostics[module] = result[3]
            else:
                checkpoint.fragments[module] = list(result[:3])
                checkpoint.module_diagnostics.pop(module, None)
        return result

    fragments = await parallel(*(build(module) for module in OWNED))
    gaps = [
        f"{module}：{result[3]}"
        for module, result in zip(OWNED, fragments)
        if result[3]
    ]
    if gaps:
        if tools is not None:
            _, evidence, resolution = await reflect(
                request,
                standard,
                checks,
                model,
                tools,
                schema,
                evidence,
                [{"code": "FRAGMENT_CAPABILITY_GAP", "message": gap} for gap in gaps],
                [],
            )
            if resolution and resolution.checks.pending_candidate:
                return resolution
        return blocked(checks, "；".join(gaps), evidence, checkpoint)
    document = request.requirements_document
    identity = document.document_id if document else standard.goal
    definition: dict = {
        "protocolVersion": "1.0",
        "id": "agent-form-" + candidate_digest(identity)[7:23],
        "version": "1.0.0",
        "data": {"schema": schema},
    }
    coverage: dict[str, list[str]] = {}
    deferrals = {}
    for module, (fragment, mapping, deferred, _) in zip(OWNED, fragments):
        if module == "validation":
            normalize_issue_messages(fragment)
        definition.update(fragment)
        if deferred:
            deferrals[module] = deferred
        for key, paths in mapping.items():
            coverage.setdefault(key, []).extend(paths)
    missing_host = [
        req
        for req in standard.requirements
        if req.kind == "host"
        and req.id not in coverage
        and not any(req.id in items for items in deferrals.values())
    ]
    if missing_host:
        if checkpoint is not None:
            checkpoint.missing_host_ids = [req.id for req in missing_host]
            for req in missing_host:
                checkpoint.fragments.pop(host_owners[req.id], None)
        return blocked(
            checks,
            "缺少 Host 绑定或明确的延期说明："
            + "；".join(f"{req.id} {req.subject}" for req in missing_host),
            evidence,
            checkpoint,
        )
    for req in standard.requirements:
        paths = list(
            dict.fromkeys(
                [
                    *(
                        "/data/schema" + path
                        for path in evidence.schema_coverage.get(req.id, [])
                    ),
                    *coverage.get(req.id, []),
                ]
            )
        )
        limits = list(
            dict.fromkeys(
                items[req.id] for items in deferrals.values() if req.id in items
            )
        )
        if not paths and not (req.kind == "host" and limits):
            return blocked(
                checks,
                f"需求 {req.id} 缺少协议落点：{req.behavior}",
                evidence,
                checkpoint,
            )
        checks.configuration_mapping.append(
            ConfigurationMapping(
                requirement_id=req.id,
                destinations=paths,
                status="deferred_to_host" if limits else "ready",
                detail="；".join([req.behavior, *limits]),
            )
        )
    submit_candidate(checks, json_text(definition))
    return Composition(
        None, checks, evidence.model_copy(update={"module_deferrals": deferrals})
    )


async def reflect(
    request,
    standard,
    checks,
    model,
    tools,
    schema,
    evidence: BindingEvidence,
    diagnostics,
    available: list[Module],
) -> tuple[Module | None, BindingEvidence, Composition | None]:
    if evidence.reflection_rounds >= 2:
        return None, evidence, blocked(checks, "跨模块反思额度已用尽。", evidence)
    evidence = evidence.model_copy(
        update={"reflection_rounds": evidence.reflection_rounds + 1}
    )
    eligible = [
        req for req in standard.requirements if req.id in evidence.schema_coverage
    ]
    host = evidence.capabilities.get("host")
    contracts = host_data_contracts(standard, host)
    decision = await ask(
        model,
        Reflection,
        "Locate the owning module for these compiler diagnostics. Choose only an available module. "
        "A component or function mismatch alone cannot change the data contract. If the checked "
        "schema contradicts an explicitly sourced data requirement, give a minimal root data "
        "counterexample with the exact source quote. Otherwise report a concrete capability gap "
        "or clarification needed. Use the user's language.",
        {
            "schema": schema,
            "data_requirements": [req.model_dump(mode="json") for req in eligible],
            "host_result_schemas": contracts,
            "diagnostics": diagnostics,
            "available_modules": available,
        },
    )
    example = decision.counterexample
    requirement = next(
        (
            req
            for req in eligible
            if example
            and req.id == example.requirement_id
            and any(source.quote == example.source_quote for source in req.sources)
        ),
        None,
    )
    if (
        requirement
        and example
        and example.case.layer == "schema"
        and not evidence.schema_reopened
        and tools.check_schema
    ):
        case = example.case.check_input()
        if len(evidence.schema_cases) < 16 and case not in evidence.schema_cases:
            text = json_text(schema)
            reproduction = await tools.check_schema(request.context, text, [case])
            require_schema_receipt(request.context, text, reproduction)
            if not reproduction.success and any(
                diag.get("code") == "DATA_SCHEMA_CASE_MISMATCH"
                for diag in reproduction.diagnostics
            ):
                review = await ask(
                    model,
                    CounterexampleReview,
                    "Verify independently that the case isolates the cited data requirement. "
                    "Check the expected verdict against the exact quote, the fields exercised and "
                    "the evaluator diagnostics. Reject if an unrelated failure explains the mismatch, "
                    "the source leaves the behavior open, or the case does not establish its expectation. "
                    "Set expressible_in_data_schema only if the target JSON Schema can enforce "
                    "this exact requirement using the data instance alone. Equality of two arbitrary "
                    "field values, business clock, normalization and asynchronous checks belong "
                    "to Runtime, bindings or Host. Position-specific invariants such as the "
                    "first member's role belong to View and Runtime for an editable scoped "
                    "roster: tuple schemas cannot prove the target bindings. A rejected "
                    "instance alone is insufficient.",
                    {
                        "requirement": requirement.model_dump(mode="json"),
                        "quote": example.source_quote,
                        "source_pointers": evidence.schema_coverage[requirement.id],
                        "schema": schema,
                        "host_result_schemas": contracts,
                        "case": case,
                        "diagnostics": reproduction.diagnostics,
                    },
                )
                if not (
                    review.isolates_requirement and review.expressible_in_data_schema
                ):
                    if decision.module in available:
                        return decision.module, evidence, None
                    return None, evidence, blocked(checks, decision.reason, evidence)
                await emit_compose_phase(
                    "schema",
                    "retrying",
                    detail="发现与原始需求不符的数据反例，正在重新定版。",
                )
                (
                    revised,
                    remaining,
                    coverage,
                    cases,
                    receipt,
                    errors,
                ) = await schema_stage(
                    model,
                    standard,
                    request.context,
                    tools.check_schema,
                    reopen={
                        "schema": schema,
                        "cases": [*evidence.schema_cases, case],
                        "diagnostics": reproduction.diagnostics,
                    },
                    contracts=host_data_contracts(
                        standard, evidence.capabilities.get("host")
                    ),
                    validator_usage=(
                        host.get("validatorUsage") if isinstance(host, dict) else None
                    ),
                    event_usage=host.get("eventUsage")
                    if isinstance(host, dict)
                    else None,
                )
                if receipt is None:
                    await emit_compose_phase(
                        "schema", "failed", detail="Schema 重新校验失败。"
                    )
                    return (
                        None,
                        evidence,
                        blocked(
                            checks,
                            "Schema 重新校验失败：" + json_text(errors),
                            evidence,
                        ),
                    )
                await emit_compose_phase("schema", "completed")
                updated = evidence.model_copy(
                    update={
                        "remaining_validation": remaining,
                        "schema_check": receipt,
                        "schema_coverage": coverage,
                        "schema_cases": cases,
                        "schema_reopened": True,
                    }
                )
                manual = await tools.read_protocol(request.context, "")
                result = await assemble_staged(
                    request, model, standard, revised, updated, manual, CheckEvidence()
                )
                if result.checks.pending_candidate is None:
                    return None, evidence, Composition(result.draft, checks, evidence)
                checks.configuration_mapping = result.checks.configuration_mapping
                submit_candidate(checks, result.checks.pending_candidate)
                return None, updated, Composition(None, checks, result.binding_evidence)
    if decision.module in available:
        return decision.module, evidence, None
    return None, evidence, blocked(checks, decision.reason, evidence)


async def repair_staged(state, model, tools):
    composition = state["composition"]
    checks = composition.checks
    digest = composition.failed_digest
    evidence = composition.binding_evidence
    standard = state["understanding"].standard
    assert digest and evidence and standard
    diagnostics = checks.receipts[digest].diagnostics
    history = state.get("repairs", [])
    before = json.loads(checks.failed_text[digest])
    schema = before["data"]["schema"]
    if (
        not evidence.schema_check
        or candidate_digest(json_text(schema)) != evidence.schema_check.candidate_digest
    ):
        raise InvalidCreateFormResult(
            "Staged repair candidate lost its checked Data Schema"
        )
    context = state["request"].context
    version = context.get("knowledge_version")
    target = str(context.get("target", ""))
    if (
        evidence.schema_check.check_environment
        != checks.receipts[digest].check_environment
        or evidence.knowledge_version != version
        or evidence.target != target
    ):
        evidence, problem = await refresh_evidence(
            state["request"], model, tools, standard, schema, evidence
        )
        if problem:
            return {"composition": blocked(checks, problem, evidence)}
    pointer_owners = {key: module for module, fields in OWNED.items() for key in fields}
    routes = [
        pointer_owners.get(str(diag.get("sourcePointer", "")).split("/")[1])
        if str(diag.get("sourcePointer", "")).startswith("/")
        else None
        for diag in diagnostics
    ]
    available: list[Module] = [
        module
        for module in OWNED
        if sum(round.change.startswith(module + "：") for round in history) < 2
    ]
    module: Module | None = None
    for owner in available:
        if owner in routes:
            module = owner
            break

    async def consider_reflection(options, current_evidence, findings):
        owner, refreshed, result = await reflect(
            state["request"],
            standard,
            checks,
            model,
            tools,
            schema,
            current_evidence,
            findings,
            options,
        )
        if result is None:
            return owner, refreshed, None
        updates: dict[str, Composition | list[RepairRound]] = {"composition": result}
        if result.checks.pending_candidate:
            updates["repairs"] = [
                *history,
                RepairRound(
                    "Schema：反例验证后重新定版",
                    digest,
                    candidate_digest(result.checks.pending_candidate),
                ),
            ]
        return owner, refreshed, updates

    reflected = None in routes or module is None
    if reflected:
        module, evidence, updates = await consider_reflection(
            available, evidence, diagnostics
        )
        if updates:
            return updates
    assert module is not None
    previous = {key: before[key] for key in OWNED[module] if key in before}
    manual = await tools.read_protocol(state["request"].context, "")
    module_diagnostics = [
        diag for diag, owner in zip(diagnostics, routes) if owner in {None, module}
    ]
    fragment, coverage, deferred, gap = await author_fragment(
        model,
        standard,
        module,
        schema,
        evidence,
        manual,
        (previous, module_diagnostics),
    )
    binding_failure = any(
        diagnostic.get("code") in {"BINDING_INCOMPATIBLE", "BINDING_UNPROVEN"}
        for diagnostic in module_diagnostics
    )
    if gap:
        if binding_failure and not reflected:
            _, _, updates = await consider_reflection(
                [],
                evidence,
                [
                    *module_diagnostics,
                    {"code": "FRAGMENT_CAPABILITY_GAP", "message": gap},
                ],
            )
            assert updates is not None
            return updates
        return {"composition": blocked(checks, f"{module}：{gap}", evidence)}
    owned_pointers = tuple("/" + key + "/" for key in OWNED[module])

    def owned(path):
        return path in {p[:-1] for p in owned_pointers} or path.startswith(
            owned_pointers
        )

    updated_mapping = []
    deferrals = {**evidence.module_deferrals, module: deferred}
    by_id = {req.id: req for req in standard.requirements}
    for entry in checks.configuration_mapping:
        paths = [
            *(path for path in entry.destinations if not owned(path)),
            *coverage.get(entry.requirement_id, []),
        ]
        limits = [
            items[entry.requirement_id]
            for items in deferrals.values()
            if entry.requirement_id in items
        ]
        if not paths and not (by_id[entry.requirement_id].kind == "host" and limits):
            return {
                "composition": blocked(
                    checks, f"修复后缺少需求 {entry.requirement_id} 的落点。", evidence
                )
            }
        updated_mapping.append(
            entry.model_copy(
                update={
                    "destinations": paths,
                    "status": "deferred_to_host" if limits else "ready",
                    "detail": "；".join(
                        [by_id[entry.requirement_id].behavior, *limits]
                    ),
                }
            )
        )
    if module == "validation":
        normalize_issue_messages(fragment)
    after = {
        **{key: value for key, value in before.items() if key not in OWNED[module]},
        **fragment,
    }
    text = json_text(after)
    next_digest = candidate_digest(text)
    unchanged = next_digest in {digest, *(round.before for round in history)}
    if unchanged and binding_failure and not reflected:
        _, _, updates = await consider_reflection([], evidence, module_diagnostics)
        assert updates is not None
        return updates
    if not unchanged:
        checks.configuration_mapping = updated_mapping
        submit_candidate(checks, text)
        evidence = evidence.model_copy(update={"module_deferrals": deferrals})
    return {
        "composition": replace(
            composition, draft=None, failed_digest=None, binding_evidence=evidence
        ),
        "repairs": [
            *history,
            RepairRound(module + "：按编译诊断重写片段", digest, next_digest),
        ],
    }
