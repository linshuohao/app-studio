import json

from graph_fixture import graph_response
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import JsonValue
from test_create_form import DOCUMENT, ScriptedModel, standard_requirements, tool_call

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.business.form_authoring.contracts import (
    CheckReceipt,
)
from form_agent.integrations.compiler import candidate_digest


class TurnModel(ScriptedModel):
    def __init__(self, steps: list[AIMessage]):
        super().__init__(steps)

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(
        self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs
    ):
        self._inputs.append(
            json.loads(str(next(m.content for m in messages if m.type == "human")))
        )
        payload = self._inputs[-1]
        if "first_message" in payload:
            message = tool_call("ConversationTitle", "title", title="表单协作")
        elif "host_pending" in payload:
            message = tool_call(
                "IntegrationExample",
                "integration-example",
                code="validateCandidate(snapshot)",
            )
        elif "available" in payload:
            message = tool_call(
                "CapabilitySelection", "caps", material=["text-input"], pure_function=[]
            )
        elif set(payload) in ({"requirements"}, {"requirements", "current_schema"}):
            message = tool_call(
                "SchemaDraft", "schema", schema_text='{"type":"object"}'
            )
        else:
            message = next(self._steps)
        if message.tool_calls and message.tool_calls[0]["name"] == "ChatReply":
            message = AIMessage(content=message.tool_calls[0]["args"]["message"])
        return ChatResult(generations=[ChatGeneration(message=message)])


def invoke(steps: list[AIMessage], request: dict, *, stream=False):
    checked, catalog = [], []

    async def protocol(context, query):
        return "协议手册"

    async def query(context, kind, term) -> JsonValue:
        catalog.append((kind, term))
        return ["text-input"]

    async def check(context, text):
        checked.append(text)
        bad = "bad" in text
        return CheckReceipt(
            check_id="real",
            check_environment=context.get("check_environment"),
            candidate_digest=candidate_digest(text),
            success=not bad,
            diagnostics=[{"message": "invalid field"}] if bad else [],
        )

    model = TurnModel(steps)
    response = graph_response(
        {"context": {"target": "web"}, **request},
        model,
        AgentToolDependencies(protocol, query, check),
        stream,
    )
    assert response.status_code == 200, response.text
    result = (
        json.loads(response.text.splitlines()[-1])["result"]
        if stream
        else response.json()
    )
    return result, checked, catalog, model._inputs


def decision(action, **fields):
    return tool_call("TurnDecision", "route", action=action, **fields)


def test_lookup_chat_observes_once_without_creating():
    query = decision("lookup", lookup={"source": "material", "query": "text-input"})
    result, checked, catalog, prompts = invoke(
        [query, query, tool_call("ChatReply", "reply", message="可以使用文本框。")],
        {"message": "有哪些文本输入物料？", "open_questions": ["门槛是多少？"]},
        stream=True,
    )
    assert result == {"kind": "answer", "message": "可以使用文本框。"}
    assert checked == [] and catalog == [("material", "text-input")]
    assert prompts[-1]["lookup_results"] and prompts[-1]["open_questions"] == [
        "门槛是多少？"
    ]


def test_generate_check_fail_resume_and_repair():
    candidate = '{"value":"bad"}'
    result, checked, _, _ = invoke(
        [
            decision("understand"),
            tool_call(
                "ChatUnderstanding",
                "u",
                decision={"kind": "ready", "requirements": ["记录金额"]},
            ),
            tool_call("check_candidate", "first", candidate_text=candidate),
            tool_call(
                "RepairDecision",
                "stop",
                action={
                    "kind": "clarification",
                    "message": "需要确认",
                    "questions": ["修正金额吗？"],
                },
            ),
        ],
        {"message": "创建金额表"},
    )
    assert checked == [candidate]
    assert result["kind"] == "clarification"
    saved = result["repair_context"]
    explained, checked, _, _ = invoke(
        [decision("chat"), tool_call("ChatReply", "r", message="字段无效。")],
        {"message": "为什么失败？", "previous_failure": saved},
    )
    assert explained["kind"] == "answer" and not checked
    repaired, checked, _, _ = invoke(
        [
            decision("repair"),
            tool_call(
                "RepairDecision",
                "fix",
                action={
                    "kind": "edit",
                    "before": "bad",
                    "after": "good",
                    "summary": "修正金额",
                },
            ),
        ],
        {"message": "只修正金额", "previous_failure": saved},
    )
    assert checked == ['{"value":"good"}']
    assert repaired["candidate_text"] == checked[0]
    assert repaired["check"]["candidate_digest"] == candidate_digest(checked[0])


def test_check_only_preserves_exact_working_candidate_even_when_it_fails():
    text = '{ "binding" : "bad" }'
    result, checked, _, _ = invoke(
        [decision("check")],
        {"message": "只检查当前工作稿", "referenced_candidate": text},
    )
    assert checked == [text]
    assert result["kind"] == "answer" and not result["check"]["success"]


def test_same_candidate_can_reuse_prior_check_without_rewriting():
    text = '{"value":"ok"}'
    standard = {
        "goal": "登记",
        "scope": "",
        "requirements": [
            {
                "id": "R1",
                "kind": "data",
                "subject": "金额",
                "behavior": "记录金额",
                "sources": [{"source_id": "document", "quote": "金额"}],
            }
        ],
    }
    receipt = {
        "check_id": "saved",
        "success": True,
        "candidate_digest": candidate_digest(text),
        "check_environment": "same",
    }
    task = {
        "referenced_candidate": text,
        "context": {"target": "web", "check_environment": "same"},
        "requirements_document": {
            "document_id": "d",
            "version": "1",
            "markdown": "金额",
        },
        "previous_standard": standard,
        "previous_review": {
            "check": receipt,
            "trace": {
                "standard": standard,
                "markdown": "金额",
                "document_id": "d",
                "document_version": "1",
                "configuration_mapping": [],
            },
        },
    }
    result, checked, _, _ = invoke(
        [decision("present")], {**task, "message": "继续预览"}
    )
    assert (
        not checked
        and result["kind"] == "proposal"
        and result["check"]["check_id"] == "saved"
    )


def test_changed_compiler_environment_forces_fresh_check_before_repair():
    text = '{"value":"bad"}'
    persisted = {
        "candidate_text": text,
        "requirements": ["金额"],
        "configuration_mapping": [],
        "context": {
            "target": "web",
            "knowledge_version": None,
            "check_environment": "old",
        },
        "check": {
            "candidate_digest": candidate_digest(text),
            "check_environment": "old",
            "check_id": "old",
            "success": False,
            "diagnostics": [{"message": "old error"}],
        },
    }
    result, checked, _, _ = invoke(
        [
            decision("resume_check"),
            tool_call(
                "RepairDecision",
                "fix",
                action={
                    "kind": "edit",
                    "before": "bad",
                    "after": "good",
                    "summary": "修复",
                },
            ),
        ],
        {
            "message": "继续修复",
            "context": {"target": "web", "check_environment": "new"},
            "previous_failure": persisted,
        },
    )
    assert (
        checked == [text, '{"value":"good"}']
        and result["check"]["check_environment"] == "new"
    )


def test_explicit_permission_resumes_scoped_failure():
    text = '{"placeholder":"new","field":"bad"}'
    saved = {
        "candidate_text": text,
        "requirements": ["保留提示文字"],
        "configuration_mapping": [],
        "scope": {"path": ["placeholder"], "value": "new"},
        "edit_instruction": "只改提示文字",
        "context": {"target": "web", "knowledge_version": None},
        "check": {
            "candidate_digest": candidate_digest(text),
            "success": False,
            "check_id": "prev",
            "diagnostics": [{"message": "invalid field"}],
        },
    }
    result, checked, _, _ = invoke(
        [
            decision("expand_repair"),
            tool_call(
                "RepairDecision",
                "field",
                action={
                    "kind": "edit",
                    "before": "bad",
                    "after": "good",
                    "summary": "修复字段",
                },
            ),
        ],
        {
            "message": "我同意扩大到字段修复",
            "open_questions": ["是否允许扩大修改范围以处理编译诊断？"],
            "previous_failure": saved,
        },
    )
    assert checked == ['{"placeholder":"new","field":"good"}']
    assert result["kind"] == "proposal"


def test_check_only_evidence_survives_chat_before_authorized_repair():
    working = '{"field":"bad"}'
    first, calls, _, _ = invoke(
        [decision("check")], {"message": "只检查", "referenced_candidate": working}
    )
    assert calls == [working]
    saved = {
        "referenced_candidate": working,
        "previous_failure": first["repair_context"],
        "previous_working_check": first["check"],
    }
    again, calls, _, _ = invoke(
        [decision("check")], {**saved, "message": "再显示检查结果"}
    )
    assert calls == [] and again["check"] == first["check"]
    chat, calls, _, _ = invoke(
        [decision("chat"), tool_call("ChatReply", "info", message="字段有问题。")],
        {**saved, "message": "哪里不对？"},
    )
    assert chat["kind"] == "answer" and not calls
    repair, calls, _, _ = invoke(
        [
            decision("repair"),
            tool_call(
                "RepairDecision",
                "fix",
                action={
                    "kind": "edit",
                    "before": "bad",
                    "after": "good",
                    "summary": "修正字段",
                },
            ),
        ],
        {**saved, "message": "现在修复这个字段"},
    )
    assert repair["kind"] == "proposal" and calls == ['{"field":"good"}']


def test_creation_decision_cannot_be_replaced_by_ordinary_chat():
    result, _, _, _ = invoke(
        [
            decision("understand"),
            tool_call(
                "ChatUnderstanding",
                "answer",
                decision={"kind": "answer", "message": "能否确认审批方式？"},
            ),
            tool_call(
                "ChatUnderstanding",
                "question",
                decision={
                    "kind": "clarification",
                    "message": "需要确认",
                    "questions": ["请选择审批方式"],
                },
            ),
        ],
        {"message": "做一个采购申请表，先问我审批方式。"},
    )
    assert result["kind"] == "clarification"


def test_manual_repair_with_existing_requirements_refreshes_coverage_before_proposal():
    working = '{"field":"bad"}'
    standard = standard_requirements()
    context = {
        "referenced_candidate": working,
        "previous_standard": standard,
        "requirements_document": DOCUMENT,
    }
    first, calls, _, _ = invoke([decision("check")], {**context, "message": "先检查"})
    assert first["repair_context"]["needs_coverage"]
    result, calls, _, _ = invoke(
        [
            decision("repair"),
            tool_call(
                "RepairDecision",
                "fix",
                action={
                    "kind": "edit",
                    "before": "bad",
                    "after": "good",
                    "summary": "修正绑定",
                },
            ),
            tool_call("read_protocol", "protocol", query=""),
            tool_call(
                "record_configuration_mapping",
                "map",
                items=[
                    {
                        "requirement_id": "R1",
                        "destinations": ["field"],
                        "status": "ready",
                        "detail": "覆盖年龄",
                    }
                ],
            ),
            tool_call("verify_existing", "verify"),
        ],
        {
            **context,
            "previous_failure": first["repair_context"],
            "message": "修正这个字段",
        },
    )
    assert calls == ['{"field":"good"}']
    assert (
        result["kind"] == "proposal"
        and result["requirements_trace"]["configuration_mapping"][0]["requirement_id"]
        == "R1"
    )


def numbered_repair_steps(rounds):
    return [
        decision("understand"),
        tool_call(
            "ChatUnderstanding",
            "u",
            decision={"kind": "ready", "requirements": ["金额"]},
        ),
        tool_call("check_candidate", "initial", candidate_text='{"value":"bad-0"}'),
        *[
            tool_call(
                "RepairDecision",
                f"repair-{i}",
                action={
                    "kind": "edit",
                    "before": f'"bad-{i - 1}"',
                    "after": f'"bad-{i}"',
                    "summary": f"第 {i} 次修正",
                },
            )
            for i in range(1, rounds + 1)
        ],
    ]


def test_repair_stops_after_ten_failed_rounds():
    result, checked, _, _ = invoke(numbered_repair_steps(10), {"message": "创建金额表"})
    assert result["kind"] == "blocked"
    assert "本次已完成 10 轮修复" in result["reason"]
    assert checked == [f'{{"value":"bad-{i}"}}' for i in range(11)]
