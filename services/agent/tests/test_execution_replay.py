"""A process restart can restore typed graph state and an orphaned model result."""

import json

import pytest
from pydantic import JsonValue
from test_agent_turn import decision, invoke, tool_call

from form_agent.agent.state import ActionObservation
from form_agent.business.form_authoring.contracts import Answer
from form_agent.execution.codec import pack, unpack
from form_agent.execution.journal import execution_scope


def test_journal_retains_pre_layout_type_tags():
    old_value = [
        "form_agent.turn_state.Observation",
        {
            "action": "chat",
            "updates": {
                "reply": [
                    "form_agent.contracts.Answer",
                    Answer(kind="answer", message="已保存的回答").model_dump(
                        mode="json"
                    ),
                ],
            },
        },
    ]

    observation = unpack(old_value)

    assert isinstance(observation, ActionObservation)
    assert observation.updates["reply"].message == "已保存的回答"
    assert pack(observation) == old_value


class RestartJournal:
    def __init__(self, fail_before_finish):
        self.results = {}
        self.requests = {}
        self.failures = []
        self.fail_before_finish = fail_before_finish

    async def begin(self, key, kind, request):
        self.requests[key] = (kind, json.loads(json.dumps(request)))
        return self.results.get(key)

    async def finish(self, key, value):
        if key == self.fail_before_finish:
            self.fail_before_finish = None
            raise RuntimeError("process stopped")
        self.results[key] = {"value": json.loads(json.dumps(value))}

    async def failure(self, key, payload):
        self.failures.append((key, payload))

    async def partial(self, key, text):
        pass


@pytest.mark.parametrize(
    "interrupted", ["0:understand", "1:compose", "2:check", "3:deliver"]
)
def test_resume_reuses_completed_model_and_compiler_results(interrupted):
    journal = RestartJournal(interrupted)
    steps = [
        decision("understand"),
        tool_call(
            "ChatUnderstanding",
            "u",
            decision={"kind": "ready", "requirements": ["金额"]},
        ),
        tool_call("check_candidate", "submit", candidate_text='{"value":"ok"}'),
    ]
    request = {"message": "创建金额表"}
    with execution_scope(journal):
        with pytest.raises(AssertionError, match="process stopped"):
            invoke(steps, request)
        # Earlier calls cannot be made again: provide only the remaining script.
        consumed = sum(
            k == "llm" and key in journal.results
            for key, (k, _) in journal.requests.items()
        )
        result, checked, _, _ = invoke(steps[consumed:], request)
    assert result["kind"] == "proposal"
    if interrupted in ("2:check", "3:deliver"):
        assert checked == []


def test_malformed_model_response_is_audited_then_retried():
    journal = RestartJournal(None)
    failures = journal.failures
    with execution_scope(journal):
        request = {"message": "你好"}
        with pytest.raises(AssertionError):
            invoke([tool_call("TurnDecision", "bad", action="unknown")], request)
        result, _, _, prompts = invoke(
            [decision("chat"), tool_call("ChatReply", "ok", message="你好。")], request
        )
    assert result["message"] == "你好。"
    assert len(prompts) == 2
    assert len(failures) == 1
    assert failures[0][1]["raw"]["data"]["tool_calls"][0]["id"] == "bad"


def test_public_answer_survives_mid_stream_provider_failure(tmp_path, monkeypatch):
    from uuid import uuid4

    from fastapi.testclient import TestClient
    from langchain_core.messages import AIMessageChunk
    from test_conversations import AUTH, TurnModel, app, database, message

    attempts = 0

    async def scripted_stream(self, messages, **options):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            yield AIMessageChunk(content="已经发送的半句")
            raise ConnectionError("provider disconnected")
        yield AIMessageChunk(content="新的")
        yield AIMessageChunk(content="完整回答")

    monkeypatch.setattr(TurnModel, "astream", scripted_stream)
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    body = message()
    with TestClient(app(engine, [decision("chat")])) as client:
        response = client.post(
            url + "/turns",
            headers={**AUTH, "Accept": "application/x-ndjson"},
            json=body,
        )
        failure = json.loads(list(response.iter_lines())[-1])
        assert failure["status"] == 502
        assert failure["reason"] == "无法连接上游服务，请稍后继续。"
        attempt = client.get(url, headers=AUTH).json()["attempts"][0]
        assert attempt["status"] == "interrupted" and attempt["resumable"]
        assert attempt["interruptionReason"] == failure["reason"]
        interrupted_ms = attempt["elapsedMs"]
        before_restart = attempt["events"]
        assert {"type": "text_delta", "delta": "已经发送的半句"} in before_restart
    with TestClient(app(engine, [])) as client:
        res = client.post(url + "/turns/" + body["turnId"] + "/resume", headers=AUTH)
        assert res.status_code == 200, res.text
        saved = res.json()["conversation"]
        assert saved["turns"][0]["result"]["message"] == "新的完整回答"
        assert "interruptionReason" not in saved["attempts"][0]
        assert saved["attempts"][0]["elapsedMs"] >= interrupted_ms
        assert "interruptionTraceId" not in saved["attempts"][0]
        events = saved["attempts"][0]["events"]
        assert events[: len(before_restart)] == before_restart
        resumed_text_events = [
            event["type"]
            for event in events[len(before_restart) :]
            if event["type"] in {"text_reset", "text_delta"}
        ]
        assert resumed_text_events[0] == "text_reset"
        projected = ""
        for event in events:
            if event["type"] == "text_reset":
                projected = ""
            elif event["type"] == "text_delta":
                projected += event["delta"]
        assert projected == "新的完整回答"
    assert attempts == 2


def test_restores_deep_agent_tool_messages_without_reading_protocol_again():
    journal = RestartJournal("1:compose")
    request = {"message": "创建金额表"}
    with execution_scope(journal):
        with pytest.raises(AssertionError, match="process stopped"):
            invoke(
                [
                    decision("understand"),
                    tool_call(
                        "ChatUnderstanding",
                        "u",
                        decision={"kind": "ready", "requirements": ["金额"]},
                    ),
                    tool_call("read_protocol", "manual", query="data"),
                    tool_call(
                        "check_candidate", "submit", candidate_text='{"ok":true}'
                    ),
                ],
                request,
            )
        restored, _, _, prompts = invoke([], request)
    assert restored["kind"] == "proposal"
    # Delivery can prepare a Host example for the restored, already-checked candidate.
    # The requirements, composition, and protocol reads must still come from the journal.
    assert len(prompts) == 1
    assert prompts[0]["candidate_text"] == '{"ok":true}'
    assert prompts[0]["host_requirements"] == {}
    assert restored["guide"]["exampleCode"] == "validateCandidate(snapshot)"
    with execution_scope(journal):
        replayed, _, _, prompts = invoke([], request)
    assert replayed["guide"] == restored["guide"]
    assert prompts == []
    authoring = {
        data["authoring"]["name"]
        for kind, data in journal.requests.values()
        if kind == "tool" and "authoring" in data
    }
    assert authoring == {"read_protocol", "check_candidate"}


def test_resumed_execution_replays_completed_repairs_and_starts_a_fresh_budget():
    from test_agent_turn import numbered_repair_steps

    journal = RestartJournal("4:check")
    steps = numbered_repair_steps(11)
    request = {"message": "创建金额表"}
    with execution_scope(journal):
        with pytest.raises(AssertionError, match="process stopped"):
            invoke(steps, request)
    with execution_scope(journal, resume=True):
        result, checked, _, _ = invoke(steps[4:], request)
    assert result["kind"] == "blocked"
    assert "本次已完成 10 轮修复" in result["reason"]
    assert checked == [f'{{"value":"bad-{i}"}}' for i in range(2, 12)]


def test_resume_endpoint_grants_ten_more_repairs_after_an_interrupted_check(
    tmp_path, monkeypatch
):
    from uuid import uuid4

    from fastapi.testclient import TestClient
    from test_agent_turn import numbered_repair_steps
    from test_conversations import AUTH, LocalTestStore, TurnModel, database, message

    from form_agent.agent.tools.dependencies import AgentToolDependencies
    from form_agent.api.app import create_app
    from form_agent.business.conversations.store import TurnJournal
    from form_agent.business.form_authoring.contracts import CheckReceipt
    from form_agent.business.form_authoring.task_facts import FormAuthoringTaskFacts
    from form_agent.integrations.compiler import candidate_digest

    checked = []
    interrupted = False
    finish = TurnJournal.finish

    async def interrupted_finish(self, key, value):
        nonlocal interrupted
        if not interrupted and key == "4:check":
            interrupted = True
            raise TimeoutError()
        await finish(self, key, value)

    monkeypatch.setattr(TurnJournal, "finish", interrupted_finish)

    graph_input = FormAuthoringTaskFacts.graph_input

    def scripted_graph_input(self, conversation, request, turns):
        return graph_input(self, conversation, request, turns).model_copy(
            update={"requirements_document": None}
        )

    monkeypatch.setattr(FormAuthoringTaskFacts, "graph_input", scripted_graph_input)

    async def protocol(context, query):
        return "协议手册"

    async def catalog(context, kind, term) -> JsonValue:
        return ["text-input"]

    async def compile_candidate(context, text):
        checked.append(text)
        return CheckReceipt(
            check_id="check",
            check_environment=context["check_environment"],
            candidate_digest=candidate_digest(text),
            success=False,
            diagnostics=[{"message": "候选未通过"}],
        )

    body = message(text="创建金额表")
    url = "/internal/v1/conversations/" + str(uuid4())
    app = create_app(
        model=TurnModel(numbered_repair_steps(11)),
        tools=AgentToolDependencies(protocol, catalog, compile_candidate),
        store=LocalTestStore(database(tmp_path)),
        service_token="service",
    )
    with TestClient(app) as client:
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 504
        assert len(checked) == 2
        response = client.post(
            url + "/turns/" + body["turnId"] + "/resume", headers=AUTH
        )
        assert response.status_code == 200, response.text
        result = response.json()["conversation"]["turns"][0]["result"]
        assert result["kind"] == "blocked"
        assert "本次已完成 10 轮修复" in result["reason"]
        assert len(checked) == 12
