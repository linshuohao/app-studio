import json
from collections.abc import Iterator
from typing import Any

import pytest
from graph_fixture import graph_response, run_graph
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import JsonValue, PrivateAttr

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.integrations.compiler import CheckReceipt, candidate_digest


class ScriptedModel(BaseChatModel):
    _steps: Iterator[AIMessage] = PrivateAttr()
    _inputs: list[dict] = PrivateAttr(default_factory=list)

    def __init__(self, steps: list[AIMessage]):
        super().__init__()
        self._steps = iter(steps)

    @property
    def _llm_type(self) -> str:
        return "create-form-test"

    def bind_tools(self, tools, **kwargs):
        allowed = {
            "read_protocol",
            "query_capabilities",
            "check_candidate",
            "record_configuration_mapping",
            "repair_field",
            "Clarification",
            "ChatReply",
            "TurnDecision",
            "Answer",
            "RequirementsUnmet",
            "CheckedDraft",
        }
        names = {convert_to_openai_tool(tool)["function"]["name"] for tool in tools}
        assert (
            names
            in (
                {"ChatUnderstanding"},
                {"DocumentUnderstanding"},
                {"ClarificationPatch"},
                {"SchemaDraft"},
                {"CapabilitySelection"},
                {"RepairDecision"},
                {"SyntaxRepairDecision"},
            )
            or names <= allowed
        )
        return self

    def _generate(
        self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs: Any
    ) -> ChatResult:
        self._inputs.append(
            json.loads(str(next(m.content for m in messages if m.type == "human")))
        )
        payload = self._inputs[-1]
        if "available" in payload:
            message = tool_call(
                "CapabilitySelection",
                "selection",
                material=payload["available"]["material"],
                pure_function=[],
            )
        elif set(payload) == {"requirements"}:
            message = tool_call(
                "SchemaDraft", "schema", schema_text='{"type":"object"}'
            )
        else:
            message = next(self._steps)
        if message.tool_calls[0]["id"] == "scope":
            assert any("记录每位被保人的年龄" in str(item.content) for item in messages)
        if message.tool_calls[0]["id"] == "protocol":
            contents = "\n".join(str(item.content) for item in messages)
            assert "standard_requirements" in contents
            assert "# 旅险" not in contents
        if message.tool_calls[0]["id"] == "catalog-result":
            contents = [
                item.content
                for item in messages
                if isinstance(item, ToolMessage) and item.name == "query_capabilities"
            ]
            assert len(contents) == 2
            assert "text-input" in contents[0]
            assert "already_returned" in contents[1] and "text-input" not in contents[1]
        if message.tool_calls[0]["id"] == "fix":
            assert (
                payload["receipt"]["diagnostics"][0]["message"]
                == "unknown age reference"
            )
        if message.tool_calls[0][
            "name"
        ] == "DocumentUnderstanding" and "newline-delimited JSON" in str(
            messages[-1].content
        ):
            args = message.tool_calls[0]["args"]
            standard = dict(args["standard"])
            records = [{"requirement": r} for r in standard.pop("requirements", [])]
            records.extend({"issue": i} for i in standard.pop("issues", []))
            records.append(
                {"finish": {"decision": args["decision"], "standard": standard}}
            )
            message = AIMessage(content="\n".join(json.dumps(r) for r in records))
        if message.tool_calls and message.tool_calls[0]["name"] == "ChatReply":
            message = AIMessage(content=message.tool_calls[0]["args"]["message"])
        return ChatResult(generations=[ChatGeneration(message=message)])


def tool_call(name: str, call_id: str, **args) -> AIMessage:
    return AIMessage(
        content="", tool_calls=[{"name": name, "id": call_id, "args": args}]
    )


def request(
    steps: list[AIMessage],
    checked: list[str],
    *,
    decision=None,
    authorized=True,
    stream=False,
    fail_check=False,
    catalog_result: JsonValue = None,
    document: dict | None = None,
    standard: dict | None = None,
    message="创建旅险表",
    history=None,
    captured=None,
    previous_standard=None,
    patch=None,
):
    async def read_protocol(context, query) -> JsonValue:
        assert context["target"] == "web"
        return {"section": "scope"}

    async def query_capabilities(context, kind, query):
        return catalog_result if catalog_result is not None else []

    async def check_candidate(context, text):
        if fail_check:
            raise ConnectionError("compiler offline")
        checked.append(text)
        return CheckReceipt(
            check_id=f"check-{len(checked)}",
            candidate_digest=candidate_digest(text),
            success="unknownAge" not in text,
            diagnostics=(
                [{"message": "unknown age reference"}] if "unknownAge" in text else []
            ),
        )

    is_answer = isinstance(decision, dict) and decision.get("kind") == "answer"
    model = ScriptedModel(
        [
            tool_call(
                "TurnDecision", "route", action="chat" if is_answer else "understand"
            ),
            tool_call("ChatReply", "reply", message=(decision or {})["message"])
            if is_answer
            else tool_call("ClarificationPatch", "patch", **patch)
            if patch
            else tool_call(
                "DocumentUnderstanding" if document else "ChatUnderstanding",
                "understand",
                decision=decision
                if decision is not None
                else "create"
                if document
                else {
                    "kind": "ready",
                    "requirements": ["记录每位被保人的年龄"],
                },
                **({"standard": standard} if standard is not None else {}),
            ),
            *steps,
        ]
    )
    response = graph_response(
        {
            "message": message,
            "history": history or [],
            "context": {"target": "web"},
            "requirements_document": document,
            "previous_standard": previous_standard,
        },
        model,
        AgentToolDependencies(read_protocol, query_capabilities, check_candidate),
        stream,
    )
    if captured is not None:
        captured.extend(model._inputs)
    return response


def test_framework_calls_tools_and_repairs_after_check():
    original = '{"reference":"/unknownAge"}'
    revised = '{"reference":"/age"}'
    checked = []
    response = request(
        [
            tool_call("read_protocol", "scope", query="成员 scope"),
            tool_call("check_candidate", "first", candidate_text=original),
            tool_call(
                "RepairDecision",
                "fix",
                action={
                    "kind": "edit",
                    "before": "/unknownAge",
                    "after": "/age",
                    "summary": "修正年龄引用",
                },
            ),
        ],
        checked,
    )

    assert response.status_code == 200, response.text
    assert checked == [original, revised]
    assert response.json()["check"]["check_id"] == "check-2"
    assert response.json()["candidate_text"] == revised


def test_stream_includes_nested_tools_before_committed_candidate():
    text = '{"reference":"/age"}'
    response = request(
        [
            tool_call("read_protocol", "scope", query="成员 scope"),
            tool_call("check_candidate", "first", candidate_text=text),
            tool_call(
                "CheckedDraft",
                "result",
                kind="proposal",
                candidate_digest=candidate_digest(text),
                summary="旅险",
            ),
        ],
        [],
        stream=True,
    )
    events = [json.loads(line) for line in response.iter_lines()]
    assert len({e["traceId"] for e in events}) == 1
    assert [
        e["message"]
        for e in events[:-1]
        if e["type"] == "progress" and e["message"] != "正在判断下一步"
    ] == [
        "正在理解需求",
        "正在生成候选",
        "正在读取配置手册",
        "正在编译检查候选",
        "正在整理结果",
    ]
    assert events[-1]["result"]["candidate_text"] == text


def test_clarification_ends_the_call_without_checking():
    checked = []
    response = request(
        [],
        checked,
        decision={
            "kind": "clarification",
            "message": "需要确认年龄线",
            "questions": ["未成年人按几岁划分？"],
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "clarification"
    assert checked == []


def test_rejects_candidate_changed_after_check():
    checked = []
    response = request(
        [
            tool_call(
                "check_candidate", "first", candidate_text='{"reference":"/age"}'
            ),
            tool_call(
                "CheckedDraft",
                "result",
                kind="proposal",
                candidate_digest=candidate_digest("{}"),
                summary="旅险",
            ),
        ],
        checked,
    )

    assert (
        response.status_code == 200 and response.json()["candidate_text"] == checked[0]
    )
    assert checked == ['{"reference":"/age"}']


def test_compiler_fault_is_an_execution_error():
    response = request(
        [
            tool_call("check_candidate", "first", candidate_text="{}"),
        ],
        [],
        fail_check=True,
    )

    assert response.status_code == 502


def test_rejects_framework_tools_outside_create_form():
    response = request(
        [
            tool_call(
                "write_file",
                "unexpected",
                file_path="/unexpected.txt",
                content="unexpected",
            ),
            tool_call("Answer", "result", kind="answer", message="unexpected"),
        ],
        [],
    )

    assert response.status_code == 502


def test_answer_from_understanding_skips_authoring():
    response = request(
        [], [], decision={"kind": "answer", "message": "监护人姓名由年龄条件控制。"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "answer"


def test_authoring_can_clarify_after_mapping():
    response = request(
        [
            tool_call(
                "query_capabilities", "catalog", kind="material", query="远程选城市"
            ),
            tool_call(
                "Clarification",
                "result",
                kind="clarification",
                message="目录没有符合要求的远程选择物料",
                questions=["可以改用业务提供的固定选项吗？"],
            ),
        ],
        [],
    )

    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "clarification"


def test_identical_catalog_results_are_injected_only_once():
    response = request(
        [
            tool_call(
                "query_capabilities", "catalog-first", kind="material", query="姓名"
            ),
            tool_call(
                "query_capabilities", "catalog-second", kind="material", query="文本"
            ),
            tool_call(
                "Answer", "catalog-result", kind="answer", message="可用文本输入。"
            ),
        ],
        [],
        catalog_result=[{"id": "text-input"}],
    )
    assert response.status_code == 200, response.text


DOCUMENT = {
    "document_id": "travel",
    "version": "pm-1",
    "markdown": "# 旅险\n\n每位被保人的年龄为 0–80 岁。\n\n> 提交时才核验。\n> 希望填写时尽早核验。",
}


def standard_requirements(*, quote: str = "每位被保人的年龄为 0–80 岁。", issues=None):
    return {
        "goal": "旅险投保",
        "scope": "网页填写",
        "requirements": [
            {
                "id": "R1",
                "kind": "data",
                "subject": "每位被保人",
                "behavior": "年龄 0–80 岁",
                "sources": [{"source_id": "document", "quote": quote}],
            },
        ],
        "issues": issues or [],
    }


def test_markdown_clarification_preserves_sources_and_skips_compiler():
    issues = [
        {
            "requirement_ids": [],
            "disposition": "ask_user",
            "detail": "填写时核验还是仅在提交时核验？",
            "sources": [
                {"source_id": "document", "quote": "提交时才核验。"},
                {"source_id": "document", "quote": "希望填写时尽早核验。"},
            ],
            "blocking": True,
        }
    ]
    checked = []
    response = request(
        [],
        checked,
        document=DOCUMENT,
        standard=standard_requirements(issues=issues),
    )
    assert response.status_code == 200, response.text
    trace = response.json()["requirements_trace"]
    assert trace["document_version"] == "pm-1"
    streamed = request(
        [],
        [],
        document=DOCUMENT,
        standard=standard_requirements(issues=issues),
        stream=True,
    )
    events = [json.loads(line) for line in streamed.iter_lines()]
    items = [e for e in events if e["type"] == "understanding_item"]
    assert items[0]["kind"] == "requirement"
    assert items[-1]["text"] == issues[0]["detail"]
    assert events[-1]["result"] == response.json()
    assert trace["standard"]["issues"] == issues
    assert "来源 document：每位被保人的年龄为 0–80 岁。" in trace["markdown"]
    assert trace["configuration_mapping"] == []
    assert checked == []


def test_markdown_rejects_unverifiable_quote():
    response = request(
        [],
        [],
        document=DOCUMENT,
        standard=standard_requirements(quote="文档未提供的证据"),
    )
    assert response.status_code == 502


@pytest.mark.parametrize("defer_host", [False, True])
def test_markdown_passes_standard_requirements_and_returns_checked_mapping(defer_host):
    candidate = '{"data":{"schema":{}}}'
    mapping = {
        "requirement_id": "R1",
        "destinations": ["data.schema"],
        "status": "ready",
        "detail": "目标数字物料与年龄字段连接",
    }
    mappings = [mapping]
    standard = standard_requirements()
    if defer_host:
        standard["requirements"].append(
            {
                "id": "R2",
                "kind": "host",
                "subject": "渠道核验",
                "behavior": "提交时才核验",
                "sources": [{"source_id": "document", "quote": "提交时才核验。"}],
            }
        )
        mappings.append(
            {
                "requirement_id": "R2",
                "destinations": ["Host 渠道核验"],
                "status": "deferred_to_host",
                "detail": "正式应用装载核验服务，本地预览不执行核验。",
            }
        )
    checked = []
    response = request(
        [
            tool_call("read_protocol", "protocol", query="数据结构"),
            tool_call(
                "query_capabilities", "catalog", kind="material", query="number-input"
            ),
            tool_call("record_configuration_mapping", "mapping", items=mappings),
            tool_call("check_candidate", "first", candidate_text=candidate),
            tool_call(
                "CheckedDraft",
                "result",
                kind="proposal",
                candidate_digest=candidate_digest(candidate),
                summary="旅险",
            ),
        ],
        checked,
        document=DOCUMENT,
        standard=standard,
        catalog_result=[{"id": "number-input"}],
    )
    assert response.status_code == 200, response.text
    assert checked == [candidate]
    assert response.json()["requirements_trace"]["configuration_mapping"] == mappings


def test_markdown_cannot_check_candidate_without_ready_mapping():
    checked = []
    response = request(
        [
            tool_call("check_candidate", "early", candidate_text="{}"),
            tool_call(
                "RequirementsUnmet",
                "result",
                kind="requirements_unmet",
                summary="尚未核对映射",
                issues=[
                    {
                        "category": "material",
                        "status": "evidence_missing",
                        "title": "物料待核对",
                        "finding": "没有绑定证据",
                        "action": "核对物料清单",
                    }
                ],
            ),
        ],
        checked,
        document=DOCUMENT,
        standard=standard_requirements(),
    )
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "requirements_unmet"
    assert response.json()["verification"] == {
        "compilation": "unverified",
        "checkCode": "ready_configuration_mapping_required",
    }
    assert checked == []


def test_unsourced_business_question_is_rejected():
    issue = {
        "requirement_ids": [],
        "disposition": "ask_user",
        "detail": "何时核验？",
        "blocking": True,
    }
    assert (
        request(
            [], [], document=DOCUMENT, standard=standard_requirements(issues=[issue])
        ).status_code
        == 502
    )


def test_chat_cannot_inject_document_standard():
    assert request([], [], standard=standard_requirements()).status_code == 502


def test_field_cannot_reference_itself_as_a_rule():
    standard = standard_requirements()
    item = standard["requirements"][0]
    item.update(
        kind="field",
        field={
            "group": "被保人",
            "name": "年龄",
            "description": "出行时年龄",
            "value_type": "整数",
            "presence": "required",
            "rule_ids": ["R1"],
        },
    )
    assert request([], [], document=DOCUMENT, standard=standard).status_code == 502


def test_city_answer_reaches_compose_with_reaction_and_outstanding_lookup():
    doc = {**DOCUMENT, "markdown": "按国家搜索城市。更换国家后清空城市。"}
    standard = standard_requirements(quote="更换国家后清空城市。")
    rule = standard["requirements"][0]
    rule.update(kind="reaction", subject="城市", behavior="更换国家后清空城市")
    lookup = {
        "requirement_ids": [],
        "disposition": "look_up_source",
        "detail": "核对搜索签名",
        "blocking": False,
        "sources": [{"source_id": "document", "quote": "按国家搜索城市。"}],
    }
    standard["issues"] = [
        lookup,
        {
            "requirement_ids": ["R1"],
            "disposition": "ask_user",
            "detail": "城市保存什么？",
            "blocking": False,
        },
    ]
    standard["requirements"].append(
        {
            "id": "R2",
            "kind": "field",
            "subject": "城市",
            "behavior": "按国家搜索城市",
            "sources": [{"source_id": "document", "quote": "按国家搜索城市。"}],
            "field": {
                "group": "旅程",
                "name": "城市",
                "description": "城市编码",
                "presence": "unspecified",
                "value_type": "编码",
                "rule_ids": ["R1"],
            },
        }
    )
    standard["issues"][1]["requirement_ids"] = ["R2"]
    captured = []
    first = request([], [], document=doc, standard=standard, captured=captured).json()
    assert first["questions"] == ["城市保存什么？"]
    assert len(captured) == 2

    answer = "城市只存编码"
    second = request(
        [
            tool_call(
                "RequirementsUnmet",
                "stop",
                kind="requirements_unmet",
                summary="观测完成",
                issues=[
                    {
                        "category": "material",
                        "status": "evidence_missing",
                        "title": "物料待核对",
                        "finding": "没有绑定证据",
                        "action": "核对物料清单",
                    }
                ],
            )
        ],
        [],
        message=answer,
        history=[
            {"role": "user", "content": doc["markdown"]},
            {"role": "assistant", "content": first["questions"][0]},
        ],
        previous_standard=first["requirements_trace"]["standard"],
        patch={
            "needs_full_read": False,
            "resolved_issue_indexes": [1],
            "edits": [
                {"requirement_id": "R2", "behavior": answer, "field_value_type": "编码"}
            ],
        },
        document=doc,
        standard=standard,
        captured=captured,
    )
    assert second.status_code == 200
    assert len(captured) == 7
    assert [r["id"] for r in captured[3]["requirements"]] == ["R2"]
    assert captured[3]["answer"] == answer
    assert (
        first["requirements_trace"]["standard"]["requirements"][0]
        == second.json()["requirements_trace"]["standard"]["requirements"][0]
    )
    assert set(captured[-1]) == {
        "standard_requirements",
        "schema_draft",
        "capabilities",
    }
    facts = captured[-1]["standard_requirements"]
    assert [item["behavior"] for item in facts["requirements"]] == [
        "更换国家后清空城市",
        answer,
    ]
    assert facts["issues"] == [lookup]


def test_compose_context_restores_full_manual_for_authoring_and_repair():
    from form_agent.agent.authoring_state import CheckEvidence
    from form_agent.agent.middleware.authoring import project_tool_results
    from form_agent.business.form_authoring.requirements import ConfigurationMapping

    checks = CheckEvidence()
    messages = [
        tool_call("read_protocol", "manual", query=""),
        ToolMessage(
            name="read_protocol", tool_call_id="manual", content="full pinned manual"
        ),
        tool_call(
            "query_capabilities", "lookup", kind="material", query="remote-select"
        ),
        ToolMessage(
            name="query_capabilities", tool_call_id="lookup", content="manifest"
        ),
    ]
    assert project_tool_results(messages, checks)[1].content != messages[1].content
    checks.configuration_mapping = [
        ConfigurationMapping(
            requirement_id="R1",
            destinations=["views"],
            status="ready",
            detail="checked",
        )
    ]
    assert project_tool_results(messages, checks) == messages
    checks.passed_text["successful-digest"] = "checked candidate"
    final = project_tool_results(messages, checks)
    assert final[1].content != messages[1].content
    assert final[3].content != messages[3].content
    assert final[1].tool_call_id == "manual" and final[3].tool_call_id == "lookup"


def test_binding_repair_only_changes_diagnosed_field():
    import asyncio

    from form_agent.agent.authoring_state import CheckEvidence
    from form_agent.agent.tools.candidate_checks import (
        bind_repair_field,
        compile_candidate,
    )

    original = {
        "data": {
            "schema": {
                "properties": {
                    "city": {"type": "string"},
                    "country": {"type": "string"},
                }
            }
        },
        "views": {"default": {"material": "remote-select", "bind": "/city"}},
        "reactions": [{"id": "clear-on-country"}],
    }
    texts = []

    async def compiler(context, text):
        texts.append(text)
        success = (
            json.loads(text)["data"]["schema"]["properties"]["city"]["type"] == "object"
        )
        return CheckReceipt(
            check_id="check",
            candidate_digest=candidate_digest(text),
            success=success,
            diagnostics=[]
            if success
            else [
                {"code": "BINDING_INCOMPATIBLE", "sourcePointer": "/views/default/bind"}
            ],
        )

    async def exercise():
        checks = CheckEvidence()
        first = await compile_candidate(json.dumps(original), {}, compiler, checks, 2)
        repair = bind_repair_field(checks)
        digest = first["candidate_digest"]
        assert isinstance(digest, str)
        assert (
            await repair(digest, "/data/schema/properties/country", '{"type":"object"}')
        )["status"] == "field_not_identified_by_binding_diagnostic"
        final = await repair(
            digest, "/data/schema/properties/city", '{"type":"object"}'
        )
        assert checks.pending_candidate is not None
        final = await compile_candidate(
            checks.pending_candidate, {}, compiler, checks, 2
        )
        assert final["success"] and len(texts) == 2
        passed_digest = final["candidate_digest"]
        assert isinstance(passed_digest, str)
        repaired = json.loads(checks.passed_text[passed_digest])
        repaired["data"]["schema"]["properties"]["city"] = {"type": "string"}
        assert repaired == original

    asyncio.run(exercise())


def test_capability_preparation_distinguishes_exact_host_signatures():
    from form_agent.agent.nodes.compose.prepare_binding import (
        exact_request_matches,
    )

    port = {"payloadSchema": {"type": "object"}, "resultSchema": {"type": "array"}}
    material = {"id": "remote-select", "requests": {"search": port}}
    host = {
        "requests": {
            "travel.searchCities": port,
            "other": {**port, "resultSchema": {"type": "string"}},
        }
    }
    assert exact_request_matches([material], host) == {
        "remote-select.search": ["travel.searchCities"]
    }
    assert exact_request_matches([material], {}) == {"remote-select.search": []}


def test_resumed_view_copy_preserves_verified_evidence_across_two_revisions():
    import asyncio

    from form_agent.agent.nodes.understand.revision import (
        identify_placeholder_edit,
    )
    from form_agent.business.form_authoring.contracts import (
        BindingEvidence,
        PreviousReview,
        TurnInput,
    )
    from form_agent.business.form_authoring.requirements import (
        RequirementsDocument,
        RequirementsTrace,
        StandardRequirements,
    )

    text = json.dumps(
        {
            "data": {"schema": {"type": "object"}},
            "views": {
                "default": {
                    "material": "field",
                    "props": {"label": "城市"},
                    "children": [
                        {
                            "material": "remote-select",
                            "bind": "/city",
                            "props": {"filterKey": "CN"},
                        }
                    ],
                }
            },
            "reactions": [{"id": "clear-city"}],
        }
    )
    standard = StandardRequirements.model_validate(standard_requirements())
    trace = RequirementsTrace(
        document_id=DOCUMENT["document_id"],
        document_version=DOCUMENT["version"],
        standard=standard,
        markdown=standard.markdown(),
    )
    evidence = BindingEvidence(
        target="web",
        knowledge_version="v1",
        capabilities={
            "material": [{"id": "remote-select"}],
            "host": {"requests": {"search": {}}},
        },
    )

    def receipt(value):
        return CheckReceipt(
            check_id="test", candidate_digest=candidate_digest(value), success=True
        )

    request = TurnInput(
        message="只把城市搜索框的提示文字改为「目的地」",
        requirements_document=RequirementsDocument.model_validate(DOCUMENT),
        referenced_candidate=text,
        previous_review=PreviousReview(
            trace=trace, check=receipt(text), binding_evidence=evidence
        ),
        context={"target": "web", "knowledge_version": "v1"},
    )
    checked = []

    async def compile_form(context, value):
        checked.append(value)
        return receipt(value)

    async def unexpected(*args):
        raise AssertionError("revision queried the manual or catalog")

    tools = AgentToolDependencies(unexpected, unexpected, compile_form)
    for word in ["目的地", "请搜索城市"]:
        request.message = f"只把城市搜索框的提示文字改为「{word}」"
        result = asyncio.run(run_graph(request, model=ScriptedModel([]), tools=tools))
        assert result.kind == "proposal" and result.binding_evidence == evidence
        updated = json.loads(result.candidate_text)
        assert (
            updated["views"]["default"]["children"][0]["props"].pop("placeholder")
            == word
        )
        assert updated == json.loads(text)
        assert result.requirements_trace is not None
        request.previous_review = PreviousReview(
            trace=result.requirements_trace,
            check=result.check,
            binding_evidence=result.binding_evidence,
        )
        request.referenced_candidate = result.candidate_text
    assert len(checked) == 2

    async def reject_form(context, value):
        return CheckReceipt(
            check_id="failed",
            candidate_digest=candidate_digest(value),
            success=False,
            diagnostics=[{"message": "其他字段的类型不兼容"}],
        )

    async def manual(context, query) -> JsonValue:
        return {"manual": "fixture"}

    repair_model = ScriptedModel(
        [
            tool_call(
                "RepairDecision",
                "repair-placeholder",
                action={
                    "kind": "edit",
                    "before": "remote-select",
                    "after": "text-input",
                    "summary": "更换物料",
                },
            )
        ]
    )
    result = asyncio.run(
        run_graph(
            request,
            model=repair_model,
            tools=AgentToolDependencies(manual, unexpected, reject_form),
        )
    )
    assert result.kind == "clarification"
    assert "扩大修改范围" in result.questions[0]
    assert repair_model._inputs[-1]["edit_scope"]["requested_value"] == "请搜索城市"
    request.message += "，再删除国家字段"
    assert identify_placeholder_edit(request) is None
    request.message = "把城市搜索框的提示文字改为「搜索」"
    request.context["knowledge_version"] = "v2"
    assert identify_placeholder_edit(request) is None
    request.context["knowledge_version"] = "v1"
    assert request.referenced_candidate is not None
    request.referenced_candidate += " "
    assert identify_placeholder_edit(request) is None


@pytest.mark.parametrize("last", ["age", "unknownAge-10", "unchanged"])
def test_repair_loop_stops_at_ten_rounds(last):
    steps = [
        tool_call("check_candidate", "initial", candidate_text='{"ref":"unknownAge"}')
    ]
    current = "unknownAge"
    for index in range(1, 11):
        updated = (
            current
            if last == "unchanged"
            else last
            if index == 10
            else f"unknownAge-{index}"
        )
        steps.append(
            tool_call(
                "RepairDecision",
                f"edit-{index}",
                action={
                    "kind": "edit",
                    "before": current,
                    "after": updated,
                    "summary": f"调整引用 {index}",
                },
            )
        )
        current = updated
    calls, inputs = [], []
    response = request(steps, calls, captured=inputs, stream=True)
    events = [json.loads(line) for line in response.iter_lines()]
    result = events[-1]["result"]
    rounds = 1 if last == "unchanged" else 10
    assert len([i for i in inputs if "previous_attempts" in i]) == rounds
    assert len(calls) == (1 if last == "unchanged" else 11)
    assert [
        len(i["previous_attempts"]) for i in inputs if "previous_attempts" in i
    ] == list(range(rounds))
    if last == "age":
        assert result["kind"] == "proposal"
        assert result["check"]["candidate_digest"] == candidate_digest(calls[-1])
    else:
        assert result["kind"] == "blocked"
        for detail in (
            f"{rounds} 轮",
            "unknown age reference",
            "未修改" if last == "unchanged" else "调整引用 10",
        ):
            assert detail in result["reason"]


@pytest.mark.parametrize(
    "decision",
    [
        {"kind": "blocked", "reason": "目标目录缺少所需物料"},
        {
            "kind": "clarification",
            "message": "业务取值有冲突",
            "questions": ["是否允许改为对象？"],
        },
    ],
)
def test_repair_stops_for_gap_or_business_decision(decision):
    calls = []
    result = request(
        [
            tool_call("check_candidate", "initial", candidate_text="unknownAge"),
            tool_call("RepairDecision", "decision", action=decision),
        ],
        calls,
    )
    assert result.status_code == 200, result.text
    assert result.json()["kind"] == decision["kind"]
    assert len(calls) == 1


def test_failed_receipt_without_diagnostic_stops_before_repair():
    import asyncio

    from form_agent.agent.authoring_state import CheckEvidence
    from form_agent.agent.tools.candidate_checks import compile_candidate
    from form_agent.business.form_authoring.errors import InvalidCreateFormResult

    async def empty_receipt(context, text):
        return CheckReceipt(
            check_id="empty", candidate_digest=candidate_digest(text), success=False
        )

    checks = CheckEvidence()
    with pytest.raises(InvalidCreateFormResult, match="no actionable diagnostics"):
        asyncio.run(compile_candidate("{}", {}, empty_receipt, checks, 1))
    assert not checks.failed_text and checks.tool_failure is not None


def test_repairs_invalid_json_at_compiler_offset_despite_repeated_text():
    import asyncio

    from form_agent.agent.authoring_state import (
        ChatReady,
        CheckEvidence,
        Composition,
        FormAuthoringState,
        Understanding,
    )
    from form_agent.agent.nodes.repair import repair
    from form_agent.agent.tools.candidate_checks import compile_candidate
    from form_agent.business.form_authoring.contracts import TurnInput

    original = '{"note":"🎯,}","value":1,}'
    expected = '{"note":"🎯,}","value":1}'

    async def exercise():
        checks = CheckEvidence()
        offset = len(original[:-1].encode("utf-16-le")) // 2

        async def compiler(context, text):
            try:
                json.loads(text)
                diagnostics = []
            except ValueError:
                diagnostics = [{"code": "JSON_SYNTAX", "location": {"offset": offset}}]
            return CheckReceipt(
                check_id="syntax",
                candidate_digest=candidate_digest(text),
                success=not diagnostics,
                diagnostics=diagnostics,
            )

        await compile_candidate(original, {}, compiler, checks, 1)
        requirement = "修复配置语法"
        state: FormAuthoringState = {
            "composition": Composition(
                None, checks, failed_digest=candidate_digest(original)
            ),
            "understanding": Understanding(
                decision=ChatReady(kind="ready", requirements=[requirement])
            ),
            "request": TurnInput(message=requirement, context={"target": "web"}),
        }
        model = ScriptedModel(
            [
                tool_call(
                    "SyntaxRepairDecision",
                    "choose",
                    action={
                        "kind": "syntax_edit",
                        "delete_before": 1,
                        "delete_after": 0,
                        "replacement": "",
                        "summary": "删除尾随逗号",
                    },
                )
            ]
        )

        async def unexpected_read(*_args: object) -> JsonValue:
            raise AssertionError("syntax repair should not query protocol or catalog")

        await repair(
            state,
            model=model,
            tools=AgentToolDependencies(unexpected_read, unexpected_read, compiler),
            max_checks=4,
        )
        assert model._inputs[-1]["syntax_anchor"] == {
            "before": original[:-1],
            "after": "}",
        }
        assert checks.pending_candidate == expected
        await compile_candidate(expected, {}, compiler, checks, 2)
        assert checks.receipts[candidate_digest(expected)].success

    asyncio.run(exercise())


@pytest.mark.parametrize("requires_string", [False, True])
def test_city_binding_guide_uses_target_manifest_and_preserves_host_obligation(
    requires_string,
):
    import asyncio

    from form_agent.agent.authoring_state import (
        ChatReady,
        CheckEvidence,
        Composition,
        FormAuthoringState,
        Understanding,
    )
    from form_agent.agent.nodes.repair import repair
    from form_agent.agent.tools.candidate_checks import compile_candidate
    from form_agent.business.form_authoring.contracts import (
        CheckedDraft,
        Clarification,
        TurnInput,
    )
    from form_agent.business.form_authoring.requirements import ConfigurationMapping

    async def exercise():
        checks = CheckEvidence(
            configuration_mapping=[
                ConfigurationMapping(
                    requirement_id="R1",
                    destinations=["host"],
                    status="deferred_to_host",
                    detail="生产提交需把城市对象映射成城市 ID",
                )
            ]
        )
        texts = []

        async def compiler(context, text):
            texts.append(text)
            success = (
                json.loads(text)["data"]["schema"]["properties"]["city"]["type"]
                == "object"
            )
            return CheckReceipt(
                check_id="city",
                candidate_digest=candidate_digest(text),
                success=success,
                diagnostics=[]
                if success
                else [
                    {
                        "code": "BINDING_INCOMPATIBLE",
                        "sourcePointer": "/views/default/bind",
                        "relatedLocations": [
                            {
                                "pointer": "/materials/remote-select/manifest/bindings/value"
                            }
                        ],
                    }
                ],
            )

        async def manual(context, query) -> JsonValue:
            return "固定版本手册"

        async def catalog(context, kind, query) -> JsonValue:
            assert (context, kind, query) == (
                {"target": "web"},
                "material",
                "remote-select",
            )
            return [
                {
                    "id": "remote-select",
                    "bindings": {"value": {"schema": {"type": "object"}}},
                }
            ]

        original = json.dumps(
            {
                "views": {"default": {"bind": "/city"}},
                "data": {"schema": {"properties": {"city": {"type": "string"}}}},
            }
        )
        await compile_candidate(original, {}, compiler, checks, 1)
        requirement = "工作字段必须为字符串" if requires_string else "提交时提取城市 ID"
        state: FormAuthoringState = {
            "composition": Composition(
                None, checks, failed_digest=candidate_digest(original)
            ),
            "understanding": Understanding(
                decision=ChatReady(kind="ready", requirements=[requirement])
            ),
            "request": TurnInput(message=requirement, context={"target": "web"}),
        }
        action = (
            {
                "kind": "clarification",
                "message": "需要确认工作值",
                "questions": ["是否允许改用对象？"],
            }
            if requires_string
            else {
                "kind": "field",
                "schema_pointer": "/data/schema/properties/city",
                "property_schema_json": '{"type":"object"}',
                "summary": "按物料声明修正城市字段",
            }
        )
        model = ScriptedModel([tool_call("RepairDecision", "choose", action=action)])
        update = await repair(
            state,
            model=model,
            tools=AgentToolDependencies(manual, catalog, compiler),
            max_checks=4,
        )
        assert (
            model._inputs[-1]["current_diagnostic_manifests"][0]["id"]
            == "remote-select"
        )
        repaired_composition = update["composition"]
        assert isinstance(repaired_composition, Composition)
        draft = repaired_composition.draft
        if requires_string:
            assert isinstance(draft, Clarification) and len(texts) == 1
        else:
            from typing import cast

            from form_agent.agent.nodes.check import check
            from form_agent.agent.state import TurnGraphState

            checked_state = cast(
                TurnGraphState,
                {
                    **state,
                    "composition": update["composition"],
                    "repairs": update["repairs"],
                },
            )
            verified = await check(
                checked_state,
                tools=AgentToolDependencies(manual, catalog, compiler),
                max_checks=4,
            )
            verified_composition = verified["composition"]
            assert isinstance(verified_composition, Composition)
            draft = verified_composition.draft
            assert isinstance(draft, CheckedDraft) and len(texts) == 2
            assert draft.candidate_digest == candidate_digest(texts[-1])
            assert "生产提交需把城市对象映射成城市 ID" in draft.summary

    asyncio.run(exercise())
