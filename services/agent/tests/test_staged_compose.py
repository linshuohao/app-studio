import asyncio
import json

import pytest
from graph_fixture import graph_response
from pydantic import JsonValue
from test_create_form import DOCUMENT, ScriptedModel, standard_requirements, tool_call

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.business.form_authoring.contracts import (
    CheckReceipt,
)
from form_agent.integrations.compiler import candidate_digest


@pytest.mark.parametrize(
    "scenario",
    [
        "view",
        "reopen",
        "unproven",
        "unrelated",
        "runtime-counterexample",
        "binding-reopen",
        "initial-binding-gap",
    ],
)
def test_prd_schema_is_checked_and_modules_receive_only_relevant_requirements(
    monkeypatch, scenario
):
    standard = standard_requirements()
    standard["scenarios"] = [
        {
            "requirement_ids": ["R1"],
            "basis": "specified",
            "expected_behavior": "模型推导的验收场景不能增加原文里的业务要求。",
        }
    ]
    for number, kind, behavior in [
        (2, "view", "展示年龄"),
        (3, "validation", "外部核验年龄"),
        (4, "reaction", "年龄变化时重置核验结果"),
    ]:
        standard["requirements"].append(
            {
                "id": f"R{number}",
                "kind": kind,
                "subject": "被保人",
                "behavior": behavior,
                "sources": [
                    {"source_id": "document", "quote": "每位被保人的年龄为 0–80 岁。"}
                ],
            }
        )

    from form_agent.agent.nodes.compose import staged

    compiled = []
    checks = []
    projections = {}
    schema = {"type": "object", "properties": {"age": {"type": "integer"}}}
    corrected = {
        "type": "object",
        "properties": {"age": {"type": "integer", "maximum": 80}},
    }
    case = {"name": "age-over-limit", "data": {"age": 81}, "valid": False}
    if scenario == "unrelated":
        case = {
            "name": "unrelated-passport",
            "data": {"age": 20, "passport": None},
            "valid": True,
        }

    async def generate(model, output, messages, **options):
        payload = json.loads(messages[-1].content)
        assert "模型推导的验收场景" not in messages[-1].content
        if output is staged.SchemaCases:
            return output.model_validate(
                {"cases": [{"name": "age", "data": {"age": 20}, "valid": True}]}
            )
        if output is staged.SchemaDraft:
            assert {item["id"] for item in payload["requirements"]} == {"R1", "R3"}
            next_schema = (
                corrected
                if len(checks) == 3
                else schema
                if checks
                else {"type": "unknown"}
            )
            return output(
                schema_text=json.dumps(next_schema),
                remaining_validation={"R3": "外部核验年龄"},
                coverage={"R1": ["/type"]},
            )
        if output is staged.CapabilitySelection:
            return output(material=["number-input"], pure_function=[])
        if output is staged.CounterexampleReview:
            return output(
                isolates_requirement=scenario
                in {
                    "reopen",
                    "binding-reopen",
                    "initial-binding-gap",
                    "runtime-counterexample",
                },
                expressible_in_data_schema=scenario != "runtime-counterexample",
            )
        if output is staged.Reflection:
            return output.model_validate(
                {
                    "reason": "约束和 Schema 需要核对。",
                    "counterexample": {
                        "requirement_id": "R1",
                        "source_quote": "每位被保人的年龄为 0–80 岁。"
                        if scenario != "unproven"
                        else "未知来源",
                        "case": case,
                    },
                }
            )
        name = payload["module"]
        if name == "view":
            assert "R3" in {item["id"] for item in payload["related_rules"]}
        if scenario == "initial-binding-gap" and name == "view" and len(checks) == 2:
            return output(blocker="物料与工作字段不兼容。")
        if scenario == "binding-reopen" and "previous_fragment" in payload:
            return output(blocker="没有兼容当前字段形状的控件。")
        assert checks[-1] == payload["schema"]
        projections.setdefault(name, []).append(
            {item["id"] for item in payload["requirements"]}
        )
        fragment = {
            "view": {"views": {"default": {"material": "number-input"}}},
            "validation": {"constraints": [{"id": "age-check"}]},
            "reaction": {"reactions": [{"id": "clear-age-check"}]},
        }[name]
        if name == "view" and compiled and scenario == "view":
            fragment["views"]["default"]["props"] = {"label": "年龄"}
        paths = {
            "view": ("R2", "/views/default"),
            "validation": ("R3", "/constraints/0"),
            "reaction": ("R4", "/reactions/0"),
        }
        key, path = paths[name]
        return output(fragment_text=json.dumps(fragment), coverage={key: [path]})

    monkeypatch.setattr(staged, "structured", generate)

    async def read_protocol(context, query) -> JsonValue:
        return {"markdown": "## 3. 视图、物料和互动\n\n视图。"}

    async def catalog(context, kind, query) -> JsonValue:
        if kind == "material":
            return [{"id": "number-input"}] if query else ["number-input"]
        return {} if kind == "host" else []

    async def check_schema(context, text, cases):
        checks.append(json.loads(text))
        diagnostic = {1: "DATA_SCHEMA_INVALID", 3: "DATA_SCHEMA_CASE_MISMATCH"}.get(
            len(checks)
        )
        if len(checks) == 3:
            assert cases == [case]
        if len(checks) == 4:
            assert cases[-1] == case and cases[0]["valid"]
        return CheckReceipt(
            check_id="schema",
            candidate_digest=candidate_digest(text),
            success=diagnostic is None,
            diagnostics=[{"code": diagnostic}] if diagnostic else [],
        )

    async def compile_form(context, text):
        compiled.append(json.loads(text))
        return CheckReceipt(
            check_id="form",
            candidate_digest=candidate_digest(text),
            success=len(compiled) == 2 or scenario == "initial-binding-gap",
            diagnostics=[]
            if len(compiled) == 2 or scenario == "initial-binding-gap"
            else [
                {
                    "code": "MATERIAL_PROPS_INVALID"
                    if scenario == "view"
                    else "BINDING_INCOMPATIBLE"
                    if scenario == "binding-reopen"
                    else "DATA_SCHEMA_INVALID",
                    "sourcePointer": "/views/default/props"
                    if scenario in {"view", "binding-reopen"}
                    else "/data/schema",
                }
            ],
        )

    model = ScriptedModel(
        [
            tool_call("TurnDecision", "route", action="understand"),
            tool_call(
                "DocumentUnderstanding",
                "understand",
                decision="create",
                standard=standard,
            ),
        ]
    )
    response = graph_response(
        {
            "message": "创建旅险",
            "context": {"target": "web"},
            "requirements_document": DOCUMENT,
        },
        model,
        AgentToolDependencies(
            read_protocol, catalog, compile_form, check_schema=check_schema
        ),
        stream=True,
    )
    assert response.status_code == 200, response.text
    frames = [json.loads(line) for line in response.iter_lines()]
    result = frames[-1]["result"]
    milestones = [
        (e["stage"], e["status"]) for e in frames if e["type"] == "compose_phase"
    ]
    for stage in ("schema", "view", "validation", "reaction", "compile"):
        assert (stage, "started") in milestones
    assert milestones.index(("schema", "retrying")) < milestones.index(
        ("schema", "completed")
    )
    for module in ("view", "validation", "reaction"):
        assert milestones.index(("schema", "completed")) < milestones.index(
            (module, "started")
        )
    if scenario == "view":
        assert milestones.count(("view", "retrying")) == 1
        assert milestones.count(("compile", "retrying")) == 1
        assert milestones[-1] == ("compile", "completed")
    if scenario == "initial-binding-gap":
        assert result["kind"] == "proposal"
        assert len(compiled) == 1 and compiled[0]["data"] == {"schema": corrected}
        return
    assert compiled[0]["data"] == {"schema": schema}
    if scenario in {"unproven", "unrelated", "runtime-counterexample"}:
        assert result["kind"] == "blocked"
        assert len(compiled) == 1 and len(checks) == (
            2 if scenario == "unproven" else 3
        )
        partial = result["partial_draft"]
        assert json.loads(partial["candidate_text"]) == compiled[0]
        assert partial["issues"][0]["sourcePointer"] == "/data/schema"
    elif scenario in {"reopen", "binding-reopen", "initial-binding-gap"}:
        assert result["kind"] == "proposal"
        assert compiled[1]["data"] == {"schema": corrected}
        assert projections == {
            "view": [{"R2"}] * 2,
            "validation": [{"R3"}] * 2,
            "reaction": [{"R4"}] * 2,
        }
    else:
        assert result["kind"] == "proposal"
        assert projections == {
            "view": [{"R2"}] * 2,
            "validation": [{"R3"}],
            "reaction": [{"R4"}],
        }
        assert compiled[1]["data"] == {"schema": schema}
        assert compiled[0]["constraints"] == compiled[1]["constraints"]
        assert compiled[0]["reactions"] == compiled[1]["reactions"]


def test_parallel_failure_cancels_other_module_before_return():
    import asyncio

    from form_agent.agent.nodes.compose.staged import parallel

    async def scenario():
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def sibling():
            try:
                started.set()
                await asyncio.Future()
            finally:
                cancelled.set()

        async def fail():
            await started.wait()
            raise RuntimeError("module failed")

        with pytest.raises(ExceptionGroup):
            await parallel(sibling(), fail())
        assert cancelled.is_set()

    asyncio.run(scenario())


def test_programmatic_travel_fragments_compile_and_run(monkeypatch):
    import asyncio
    from pathlib import Path

    from form_agent.agent.nodes.compose import staged

    root = Path(__file__).resolve().parents[3]
    fixture = root / "services/agent/examples/05-clear-on-change"
    definition = json.loads((fixture / "expected.form.json").read_text())
    schema_attempts = []
    document = {
        "document_id": "travel",
        "version": "1",
        "markdown": (fixture / "complete.md").read_text(),
    }
    requirements = [
        {
            "id": "R1",
            "kind": "data",
            "subject": "城市备注",
            "behavior": "使用可空文本",
            "sources": [{"source_id": "document", "quote": "将 cityNote 置为 null。"}],
        },
        {
            "id": "R2",
            "kind": "view",
            "subject": "城市备注",
            "behavior": "选定国家后显示",
            "sources": [
                {
                    "source_id": "document",
                    "quote": "选定国家后才显示选填的城市备注 cityNote",
                }
            ],
        },
        {
            "id": "R3",
            "kind": "reaction",
            "subject": "城市备注",
            "behavior": "换国家后清空",
            "sources": [
                {"source_id": "document", "quote": "每次更换国家时清空旧城市备注"}
            ],
        },
    ]

    async def bridge(operation, **kwargs):
        process = await asyncio.create_subprocess_exec(
            "node",
            "--import",
            "./services/api/dev-loader.mjs",
            "./tools/engineering/createform-eval-runtime.mjs",
            cwd=root,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        output, error = await process.communicate(
            json.dumps({"operation": operation, **kwargs}).encode()
        )
        assert process.returncode == 0, error.decode()
        return json.loads(output)

    async def generate(model, output, messages, **options):
        payload = json.loads(messages[-1].content)
        if output is staged.SchemaCases:
            return output.model_validate(
                {
                    "cases": [
                        {
                            "name": "nullable",
                            "data": {
                                "contactName": "张",
                                "countryCode": "CN",
                                "cityNote": None,
                            },
                            "valid": True,
                        },
                        {
                            "name": "invalid type",
                            "data": {
                                "contactName": "张",
                                "countryCode": "CN",
                                "cityNote": 12,
                            },
                            "valid": False,
                        },
                    ]
                }
            )
        if output is staged.SchemaDraft:
            schema = json.loads(json.dumps(definition["data"]["schema"]))
            schema_attempts.append(payload.get("diagnostics"))
            if len(schema_attempts) == 1:
                country = schema["properties"]["countryCode"]
                country.pop("enum", None)
                country["oneOf"] = [
                    {"const": "CN", "title": "中国"},
                    {"const": "JP", "title": "日本"},
                ]
            return output(
                schema_text=json.dumps(schema),
                coverage={"R1": ["/properties/cityNote"]},
                remaining_validation={},
            )
        if output is staged.CapabilitySelection:
            return output(
                material=["section", "field", "text-input", "select", "condition"],
                pure_function=["core.exists"],
            )
        key, coverage = {
            "view": ("views", {"R2": ["/views/default/children/2"]}),
            "reaction": ("reactions", {"R3": ["/reactions/0"]}),
        }[payload["module"]]
        return output(
            fragment_text=json.dumps({key: definition[key]}), coverage=coverage
        )

    async def read_protocol(context, query) -> JsonValue:
        return {"markdown": "## 视图\n\n使用具名绑定。"}

    async def catalog(context, kind, query) -> JsonValue:
        return await bridge("catalog", kind=kind, query=query)

    async def check_schema(context, text, cases):
        return CheckReceipt.model_validate(
            await bridge("check-schema", schema=text, cases=cases)
        )

    async def compile_form(context, text):
        return CheckReceipt.model_validate(await bridge("check", candidate=text))

    monkeypatch.setattr(staged, "structured", generate)
    model = ScriptedModel(
        [
            tool_call("TurnDecision", "route", action="understand"),
            tool_call(
                "DocumentUnderstanding",
                "understand",
                decision="create",
                standard={
                    "goal": "旅险",
                    "scope": "登记",
                    "requirements": requirements,
                },
            ),
        ]
    )
    response = graph_response(
        {
            "message": "创建旅险",
            "context": {"target": "web", "check_environment": "createform-eval-web"},
            "requirements_document": document,
        },
        model,
        AgentToolDependencies(
            read_protocol, catalog, compile_form, check_schema=check_schema
        ),
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["kind"] == "proposal", result
    assert len(schema_attempts) == 2
    assert schema_attempts[1][0]["code"] == "DATA_SCHEMA_SCALAR_ENUM_REQUIRED"
    assert schema_attempts[1][0]["sourcePointer"] == "/properties/countryCode/oneOf"
    cases = json.loads((root / "services/agent/evaluation/cases.json").read_text())[
        "cases"
    ]
    case = next(case for case in cases if case["id"] == "country-change-clears-city")
    runtime = asyncio.run(
        bridge(
            "runtime", candidate=result["candidate_text"], assertions=case["assertions"]
        )
    )
    assert runtime["assertions"] == [
        {
            "id": "city.cleared-on-country-change",
            "actual": {"kind": "value", "value": None},
        },
        {
            "id": "city.preserved-on-unrelated-change",
            "actual": {"kind": "value", "value": "上海"},
        },
    ]


def test_stale_failed_candidate_is_revalidated_without_legacy_repair(monkeypatch):
    from form_agent.agent.nodes.compose import staged

    schema = {"type": "object", "properties": {"age": {"type": "integer"}}}
    candidate = staged.json_text(
        {
            "protocolVersion": "1.0",
            "id": "travel",
            "version": "1.0.0",
            "data": {"schema": schema},
            "views": {"default": {"material": "number-input"}},
        }
    )
    standard = standard_requirements()
    schema_calls = []
    compile_calls = []

    async def generate(model, output, messages, **options):
        if output is staged.CapabilitySelection:
            return output(material=["number-input"], pure_function=[])
        assert output is staged.Fragment
        payload = json.loads(messages[-1].content)
        assert payload["module"] == "view" and payload["schema"] == schema
        return output(
            fragment_text=json.dumps(
                {
                    "views": {
                        "default": {
                            "material": "number-input",
                            "props": {"label": "年龄"},
                        }
                    },
                }
            )
        )

    async def read_protocol(context, query) -> JsonValue:
        return {}

    async def catalog(context, kind, query) -> JsonValue:
        return ["number-input"] if kind == "material" else {} if kind == "host" else []

    async def check_schema(context, text, cases):
        assert context["check_environment"] == "new-target"
        schema_calls.append(json.loads(text))
        return CheckReceipt(
            check_id="schema",
            candidate_digest=candidate_digest(text),
            success=True,
            check_environment="new-target",
        )

    async def compile_candidate(context, text):
        compile_calls.append(text)
        return CheckReceipt(
            check_id=f"form-{len(compile_calls)}",
            candidate_digest=candidate_digest(text),
            success=len(compile_calls) == 2,
            check_environment="new-target",
            diagnostics=[]
            if len(compile_calls) == 2
            else [
                {"code": "BINDING_INCOMPATIBLE", "sourcePointer": "/views/default"},
            ],
        )

    monkeypatch.setattr(staged, "structured", generate)
    response = graph_response(
        {
            "message": "继续修复",
            "context": {"target": "web", "check_environment": "new-target"},
            "requirements_document": DOCUMENT,
            "previous_standard": standard,
            "previous_failure": {
                "candidate_text": candidate,
                "check": {
                    "check_id": "old",
                    "check_environment": "old-target",
                    "success": False,
                    "candidate_digest": candidate_digest(candidate),
                    "diagnostics": [
                        {
                            "code": "BINDING_INCOMPATIBLE",
                            "sourcePointer": "/views/default",
                        }
                    ],
                },
                "context": {"target": "web", "check_environment": "old-target"},
                "configuration_mapping": [
                    {
                        "requirement_id": "R1",
                        "destinations": ["/data/schema/properties/age"],
                        "status": "ready",
                        "detail": "年龄",
                    }
                ],
                "binding_evidence": {
                    "target": "web",
                    "capabilities": {},
                    "schema_check": {
                        "check_id": "old-schema",
                        "check_environment": "old-target",
                        "success": True,
                        "candidate_digest": candidate_digest(staged.json_text(schema)),
                    },
                },
            },
        },
        ScriptedModel([tool_call("TurnDecision", "route", action="resume_check")]),
        AgentToolDependencies(
            read_protocol, catalog, compile_candidate, check_schema=check_schema
        ),
    )
    assert response.status_code == 200, response.text
    assert (
        response.json()["binding_evidence"]["schema_check"]["check_environment"]
        == "new-target"
    )
    assert schema_calls == [schema]
    assert compile_calls[0] == candidate and len(compile_calls) == 2
    assert json.loads(compile_calls[1])["data"]["schema"] == schema


def test_schema_receives_only_host_result_contracts_named_in_sourced_requirements():
    from form_agent.agent.nodes.compose.staged import host_data_contracts
    from form_agent.business.form_authoring.requirements import StandardRequirements

    standard = StandardRequirements.model_validate(
        {
            "goal": "登记旅险城市",
            "scope": "城市数据",
            "requirements": [
                {
                    "id": "R1",
                    "kind": "host",
                    "subject": "城市搜索",
                    "behavior": "城市选择保存实际选项",
                    "sources": [
                        {
                            "source_id": "document",
                            "quote": "使用 travel.searchCities；保存完整选项。",
                        }
                    ],
                },
            ],
        }
    )
    result = {"type": "object", "additionalProperties": False}
    contracts = host_data_contracts(
        standard,
        {
            "requests": {
                "travel.searchCities": {"resultSchema": result, "payloadSchema": {}},
                "travel.search": {"resultSchema": {"type": "string"}},
                "claims.lookup": {"resultSchema": {"type": "string"}},
            },
        },
    )
    assert contracts == {"travel.searchCities": result}


def test_missing_host_coverage_is_derived_only_from_an_actual_request_mapping():
    from form_agent.agent.nodes.compose.staged import map_declared_view_requests
    from form_agent.business.form_authoring.requirements import StandardRequirements

    standard = StandardRequirements.model_validate(
        {
            "goal": "登记旅险城市",
            "scope": "城市搜索",
            "requirements": [
                {
                    "id": "R1",
                    "kind": "host",
                    "subject": "城市搜索",
                    "behavior": "查找城市",
                    "sources": [
                        {"source_id": "document", "quote": "使用 travel.searchCities。"}
                    ],
                },
                {
                    "id": "R2",
                    "kind": "host",
                    "subject": "资格核验",
                    "behavior": "查询承保资格",
                    "sources": [
                        {"source_id": "document", "quote": "使用 travel.eligibility。"}
                    ],
                },
            ],
        }
    )
    view = {
        "views": {
            "default": {
                "material": "section",
                "slots": {
                    "main/alt": [
                        {
                            "material": "remote-select",
                            "requests": {
                                "search": {
                                    "type": "host.request",
                                    "request": "travel.searchCities",
                                }
                            },
                            "props": {
                                "example": {
                                    "type": "host.request",
                                    "request": "travel.eligibility",
                                }
                            },
                        }
                    ]
                },
            }
        }
    }
    view["viewTemplates"] = {
        "unused": {
            "node": {
                "material": "remote-select",
                "requests": {
                    "search": {"type": "host.request", "request": "travel.eligibility"},
                },
            }
        }
    }
    host = {"requests": {"travel.searchCities": {}, "travel.eligibility": {}}}
    assert map_declared_view_requests(view, standard, host, {}) == {
        "R1": ["/views/default/slots/main~1alt/0/requests/search"],
    }


@pytest.mark.parametrize("request_available", [False, True])
def test_view_deferral_without_pointer_requires_unavailable_host(
    monkeypatch, request_available
):
    from form_agent.agent.nodes.compose import staged
    from form_agent.business.form_authoring.contracts import BindingEvidence
    from form_agent.business.form_authoring.requirements import StandardRequirements

    facts = standard_requirements()
    facts["requirements"].append(
        {
            "id": "R53",
            "kind": "host",
            "subject": "渠道核保调用",
            "behavior": "调用 travel.screen 检查每人护照号",
            "sources": [{"source_id": "document", "quote": "调用 travel.screen"}],
        }
    )
    standard = StandardRequirements.model_validate(facts)
    attempts = []

    async def ask(model, output, instructions, payload):
        attempts.append(payload.get("diagnostics", []))
        return output(
            fragment_text='{"views":{"default":{"material":"section"}}}',
            deferred={"R53": "实际渠道尚未接入。"},
        )

    monkeypatch.setattr(staged, "ask", ask)
    requests: dict[str, JsonValue] = {"travel.screen": {}} if request_available else {}
    evidence = BindingEvidence(
        target="web", capabilities={"host": {"requests": requests}}
    )
    _, _, deferred, gap = asyncio.run(
        staged.generate_fragment(None, standard, "view", {}, evidence, {}, None)
    )
    if request_available:
        assert deferred == {}
        assert gap is not None
        assert "Unmapped deferrals: R53." in attempts[-1]
    else:
        assert len(attempts) == 1
        assert deferred == {"R53": "实际渠道尚未接入。"}
        assert gap is None


def test_schema_initializes_only_typed_editable_parents_and_preserves_business_defaults():
    from form_agent.agent.nodes.compose.staged import seed_editable_objects

    schema = {
        "required": ["applicant", "travel", "insureds"],
        "properties": {
            "applicant": {
                "type": "object",
                "properties": {"email": {"type": "string"}},
            },
            "travel": {
                "type": "object",
                "default": {"country": "JP"},
                "properties": {"country": {"type": "string"}},
            },
            "insureds": {"type": "array", "default": [{"relationship": "self"}]},
            "optional": {"type": "object", "properties": {"text": {"type": "string"}}},
        },
    }
    seed_editable_objects(
        schema,
        {
            "R1": ["/properties/applicant/properties/email"],
            "R2": ["/properties/travel/properties/country"],
            "R3": ["/properties/insureds"],
            "R4": ["/properties/optional/properties/text"],
        },
        {"R1", "R2", "R3", "R4"},
    )
    assert schema["properties"]["applicant"]["default"] == {}
    assert "default" not in schema["properties"]["applicant"]["properties"]["email"]
    assert schema["properties"]["travel"]["default"] == {"country": "JP"}
    assert schema["properties"]["insureds"]["default"] == [{"relationship": "self"}]
    assert "default" not in schema["properties"]["optional"]


def test_schema_regex_json_repair_retains_offset_for_other_syntax_errors():
    from form_agent.agent.nodes.compose.staged import parse_schema

    schema, diagnostic = parse_schema(
        r'{"type":"object","properties":{"email":{"pattern":"^\s*\w+\."}}}'
    )
    assert diagnostic is None
    assert schema["properties"]["email"]["pattern"] == r"^\s*\w+\."
    _, diagnostic = parse_schema(r'{"type":"object","description":"broken\q"}')
    assert diagnostic is not None
    assert diagnostic["code"] == "DATA_SCHEMA_JSON_INVALID"
    assert isinstance(offset := diagnostic["offset"], int) and offset > 0


def test_schema_retry_reuses_plan_and_keeps_runtime_and_host_cases(monkeypatch):
    from form_agent.agent.nodes.compose import staged
    from form_agent.business.form_authoring.contracts import ComposeCheckpoint
    from form_agent.business.form_authoring.requirements import StandardRequirements

    standard = StandardRequirements.model_validate(standard_requirements())
    stages = []
    checked = []
    retrying = False
    checkpoint = ComposeCheckpoint(inputs="unchanged")

    async def generate(model, output, instructions, payload):
        stages.append(output.__name__)
        if output is staged.SchemaCases:
            return output.model_validate(
                {
                    "cases": [
                        {
                            "name": "valid structural case",
                            "data": {"age": 21},
                            "valid": True,
                        },
                        {
                            "name": "passport duplication",
                            "data": {},
                            "valid": False,
                            "layer": "runtime",
                        },
                        {
                            "name": "late response",
                            "data": {},
                            "valid": False,
                            "layer": "host",
                        },
                    ]
                }
            )
        if not retrying:
            return output(
                schema_text='{"type":"object","properties":{"age":{"type":"integer"}}}',
                coverage={"R1": []},
                remaining_validation={},
            )
        assert payload["diagnostics"][0]["code"] == "DATA_SCHEMA_COVERAGE_INCOMPLETE"
        return output(
            schema_text='{"type":"object","properties":{"age":{"type":"integer"}}}',
            coverage={"R1": ["/properties/age"]},
            remaining_validation={},
        )

    async def check_schema(context, text, cases):
        checked.extend(cases)
        return CheckReceipt(
            check_id="schema",
            candidate_digest=candidate_digest(text),
            check_environment="web",
            success=True,
        )

    monkeypatch.setattr(staged, "ask", generate)
    first = asyncio.run(
        staged.schema_stage(None, standard, {}, check_schema, checkpoint=checkpoint)
    )
    assert first[4] is None
    assert checked == []
    next_turn = ComposeCheckpoint.model_validate_json(checkpoint.model_dump_json())
    retrying = True
    second = asyncio.run(
        staged.schema_stage(None, standard, {}, check_schema, checkpoint=next_turn)
    )
    assert second[4].success
    assert stages.count("SchemaCases") == 1
    assert checked == [
        {"name": "valid structural case", "data": {"age": 21}, "valid": True}
    ]
    assert [
        staged.SchemaCase.model_validate(sample).layer
        for sample in next_turn.later_cases
    ] == ["runtime", "host"]


@pytest.mark.parametrize("owner", ["validation", "view"])
def test_retry_rebuilds_only_the_module_missing_a_host_disposition(monkeypatch, owner):
    from form_agent.agent.nodes.compose import staged
    from form_agent.agent.routing import route
    from form_agent.business.form_authoring.contracts import CreateFormInput
    from form_agent.business.form_authoring.requirements import StandardRequirements
    from form_agent.business.form_authoring.task_facts import FormAuthoringTaskFacts

    facts = standard_requirements()
    facts["requirements"].append(
        {
            "id": "R2",
            "kind": "host",
            "subject": "逐人核保结果",
            "behavior": "渠道返回逐人核保结果",
            "sources": [
                {
                    "source_id": "message",
                    "quote": "逐人核保结果 travel.screen"
                    if owner == "view"
                    else "逐人核保结果",
                }
            ],
        }
    )
    standard = StandardRequirements.model_validate(facts)
    request = CreateFormInput(
        message="逐人核保结果",
        previous_standard=standard,
        context={"target": "web", "check_environment": "v1"},
    )
    calls = []

    async def ask(model, output, instructions, payload):
        calls.append(payload.get("module", output.__name__))
        if output is staged.SchemaCases:
            assert {req["id"] for req in payload["requirements"]} == {"R1"}
            return output(
                cases=[staged.SchemaCase(name="valid", data={"age": 21}, valid=True)]
            )
        if output is staged.SchemaDraft:
            return output(
                schema_text='{"type":"object","properties":{"age":{"type":"integer"}}}',
                coverage={"R1": ["/properties/age"]},
                remaining_validation={},
            )
        if output is staged.CapabilitySelection:
            return output(material=[], pure_function=[])
        if payload["module"] == "view" and payload.get("missing_host_requirements"):
            return output(
                fragment_text=json.dumps(
                    {
                        "views": {
                            "default": {
                                "material": "remote-select",
                                "requests": {
                                    "search": {
                                        "type": "host.request",
                                        "request": "travel.screen",
                                    }
                                },
                            }
                        }
                    }
                )
            )
        if payload["module"] == "view":
            return output(fragment_text='{"views":{"default":{}}}')
        if payload.get("missing_host_requirements"):
            return output(deferred={"R2": "接入真实渠道核保，预览仅支持本地输入。"})
        return output()

    async def query(context, kind, query) -> JsonValue:
        if kind == "host" and owner == "view":
            return {"requests": {"travel.screen": {"resultSchema": {"type": "object"}}}}
        return {} if kind == "host" else []

    async def manual(context, query) -> JsonValue:
        return {"markdown": ""}

    async def check_schema(context, source, cases):
        calls.append("schema_check")
        return CheckReceipt(
            check_id="schema",
            success=True,
            candidate_digest=candidate_digest(source),
            check_environment="v1",
        )

    async def unexpected_compile(context, source):
        pytest.fail("Only the Graph may compile the assembled candidate")

    monkeypatch.setattr(staged, "ask", ask)
    tools = AgentToolDependencies(manual, query, unexpected_compile, check_schema)
    first = asyncio.run(staged.compose_staged(request, None, tools, standard))
    assert first.checks.pending_candidate is None
    checkpoint = first.compose_checkpoint
    assert checkpoint is not None
    assert checkpoint.missing_host_ids == ["R2"]
    assert set(checkpoint.fragments) == {"view", "reaction", "validation"} - {owner}

    # The store promotes current-message citations to the committed turn ID.
    task = FormAuthoringTaskFacts.model_validate_json(
        FormAuthoringTaskFacts(
            standard=standard, compose_checkpoint=checkpoint
        ).model_dump_json()
    )
    assert task.standard is not None
    task.standard.requirements[1].sources[0].source_id = "turn:1"
    retry = request.model_copy(
        update={
            "message": "继续修复",
            "previous_standard": task.standard,
            "previous_compose": task.compose_checkpoint,
        }
    )
    assert staged.compose_inputs(retry, task.standard) == checkpoint.inputs
    changed = retry.model_copy(
        update={"context": {"target": "web", "check_environment": "v2"}}
    )
    assert staged.compose_inputs(changed, task.standard) != checkpoint.inputs
    decision = asyncio.run(route({"request": retry}, model=ScriptedModel([])))
    assert decision["action"] == "compose"
    calls.clear()
    second = asyncio.run(staged.compose_staged(retry, None, tools, task.standard))
    assert calls == [owner]
    assert second.checks.pending_candidate
    mapping = second.checks.configuration_mapping[-1]
    if owner == "view":
        assert mapping.status == "ready"
        assert mapping.destinations == ["/views/default/requests/search"]
    else:
        assert mapping.status == "deferred_to_host"
        assert mapping.destinations == []


@pytest.mark.parametrize("view_succeeds", [True, False])
def test_member_delete_moves_from_reaction_to_view_without_losing_the_page(
    monkeypatch, view_succeeds
):
    from form_agent.agent.nodes.compose import staged
    from form_agent.business.form_authoring.contracts import CreateFormInput
    from form_agent.business.form_authoring.requirements import StandardRequirements

    facts = standard_requirements()
    facts["requirements"].append(
        {
            "id": "R26",
            "kind": "reaction",
            "subject": "被保人名单",
            "behavior": "点击删除成员，其他成员的错误保持归属",
            "sources": [{"source_id": "message", "quote": "可删除当前被保人"}],
        }
    )
    standard = StandardRequirements.model_validate(facts)
    request = CreateFormInput(message="可删除当前被保人", context={"target": "web"})
    schema = {"type": "object", "properties": {"age": {"type": "integer"}}}
    view = {"views": {"default": {"material": "section"}}}
    calls = []

    async def ask(model, result_type, instructions, payload):
        module = payload["module"]
        required = payload["required_ids"]
        calls.append((module, required))
        if module == "reaction":
            assert required == ["R26"]
            return result_type(view_array_remove_ids=["R26"], blocker="R26 属于视图")
        if "R26" not in required:
            return result_type(fragment_text=json.dumps(view))
        if not view_succeeds:
            return result_type(blocker="R26 缺少删除入口")
        candidate = {
            "views": {
                "default": {
                    "material": "button",
                    "on": {
                        "activate": {
                            "type": "form.command",
                            "command": {
                                "op": "array.remove",
                                "target": {"source": "data", "path": "/members"},
                                "item": {"$scope": "member"},
                            },
                        }
                    },
                }
            },
        }
        return result_type(
            fragment_text=json.dumps(candidate),
            coverage={"R26": ["/views/default/on/activate/command"]},
        )

    monkeypatch.setattr(staged, "ask", ask)
    evidence = staged.BindingEvidence(
        target="web", capabilities={}, schema_coverage={"R1": ["/properties/age"]}
    )
    checkpoint = staged.ComposeCheckpoint(inputs="test", evidence=evidence)

    def assemble():
        return asyncio.run(
            staged.assemble_staged(
                request,
                None,
                standard,
                schema,
                checkpoint.evidence,
                {},
                staged.CheckEvidence(),
                checkpoint=checkpoint,
            )
        )

    result = assemble()
    assert ("reaction", ["R26"]) in calls
    assert ("view", ["R26"]) in calls
    if view_succeeds:
        candidate = json.loads(result.checks.pending_candidate)
        assert candidate["views"]["default"]["on"]["activate"]["command"]["item"] == {
            "$scope": "member"
        }
        assert result.checks.configuration_mapping[-1].requirement_id == "R26"
    else:
        for attempt in [result, assemble()]:
            partial = attempt.draft.partial_draft
            assert json.loads(partial.candidate_text)["views"] == view["views"]
            assert json.loads(partial.candidate_text)["data"]["schema"] == schema
            assert partial.issues[0].requirementIds == ["R26"]
            assert partial.issues[0].sourcePointer == "/views"
        assert calls.count(("reaction", ["R26"])) == 1
