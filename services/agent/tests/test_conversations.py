import json
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from test_agent_turn import TurnModel, decision, tool_call

from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.api.app import create_app
from form_agent.business.conversations.model import stable_id
from form_agent.business.conversations.store import (
    ConversationStore,
    conversations,
    metadata,
    turns,
)
from form_agent.import_conversations import migrate_row
from form_agent.integrations.compiler import candidate_digest

AUTH = {
    "X-Agent-Service-Token": "service",
    "X-Agent-User": "alice",
    "X-Agent-Space": "team",
}
CONTEXT = {"target": "web", "knowledge_version": "v1", "check_environment": "env"}


class LocalTestStore(ConversationStore):
    """Use a disposable SQLite file for serial API/restart tests."""

    async def read(self, fn):
        with self.engine.connect() as conn:
            return fn(conn)

    @asynccontextmanager
    async def exclusive(self, cid):
        with self.engine.connect() as conn:
            yield conn


def app(engine, steps):
    async def unused(*args):
        raise AssertionError("Pure chat attempted to author")

    return create_app(
        model=TurnModel(steps),
        tools=AgentToolDependencies(unused, unused, unused),
        store=LocalTestStore(engine),
        service_token="service",
    )


def message(revision=0, text="现在可以做什么？"):
    return {
        "turnId": str(uuid4()),
        "revision": revision,
        "message": text,
        "context": CONTEXT,
    }


def database(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "agent.sqlite"))
    metadata.create_all(engine)
    return engine


def test_persist_public_reply_and_retry_after_service_restart(tmp_path):
    engine = database(tmp_path)
    cid = str(uuid4())
    url = "/internal/v1/conversations/" + cid
    body = message()
    steps = [
        decision("chat"),
        tool_call("ChatReply", "reply", message="可以讨论，也可以创建表单。"),
    ]
    with TestClient(app(engine, steps)) as client:
        assert client.get("/internal/v1/conversations").status_code == 401
        invalid = client.post(
            url + "/turns",
            headers=AUTH,
            json={**body, "previous_standard": {"forged": True}},
        )
        assert invalid.status_code == 422
        res = client.post(
            url + "/turns",
            headers={**AUTH, "Accept": "application/x-ndjson"},
            json=body,
        )
        frames = [json.loads(line) for line in res.iter_lines()]
        assert frames[-1]["type"] == "result", frames
        saved = frames[-1]["result"]
        assert saved["conversation"]["turns"][0]["result"] == {
            "kind": "answer",
            "message": "可以讨论，也可以创建表单。",
        }
        assert "delivery" not in saved
    with TestClient(app(engine, [])) as client:
        assert (
            client.get(url, headers={**AUTH, "X-Agent-Space": "other"}).status_code
            == 404
        )
        assert client.get(url, headers=AUTH).json() == saved["conversation"]
        assert client.post(url + "/turns", headers=AUTH, json=body).json() == saved
        assert (
            client.post(
                url + "/turns", headers=AUTH, json={**body, "message": "不同内容"}
            ).status_code
            == 409
        )
        assert (
            client.post(url + "/turns", headers=AUTH, json=message(0)).status_code
            == 409
        )
        assert client.delete(url, headers=AUTH).status_code == 204
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 404
        assert client.get("/internal/v1/conversations", headers=AUTH).json() == []
        paths = set(client.get("/openapi.json").json()["paths"])
        assert all(p.startswith("/internal/v1/conversations") for p in paths)


def test_legacy_and_typed_references_stay_on_their_original_turn(tmp_path):
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    form = {
        "formId": str(uuid4()),
        "versionId": str(uuid4()),
        "name": "Source",
        "savedAt": "2026-11-25",
        "text": '{"type":"string"}',
    }
    asset = {
        "kind": "function",
        "assetId": "example.fn",
        "assetVersion": "1.0.0",
        "artifactDigest": "sha256:example",
        "name": "Function",
        "text": '{"parameters":[]}',
    }
    legacy = {**message(), "references": [form]}
    pointer = {
        **form,
        "pointer": "/data/schema/properties/name",
        "objectLabel": "字段 · name",
    }
    mixed = {**message(1), "references": [pointer, asset]}
    steps = [
        decision("chat"),
        tool_call("ChatReply", "first", message="First"),
        decision("chat"),
        tool_call("ChatReply", "second", message="Second"),
    ]
    with TestClient(app(engine, steps)) as client:
        assert client.post(url + "/turns", headers=AUTH, json=legacy).status_code == 200
        assert client.post(url + "/turns", headers=AUTH, json=mixed).status_code == 200
    with TestClient(app(engine, [])) as client:
        history = client.get(url, headers=AUTH).json()["turns"]
        assert history[0]["references"] == [
            {k: v for k, v in form.items() if k != "text"}
        ]
        assert history[1]["references"] == [
            {k: v for k, v in ref.items() if k != "text"} for ref in [pointer, asset]
        ]
        assert client.post(url + "/turns", headers=AUTH, json=mixed).status_code == 200
        changed = {
            **mixed,
            "references": [
                {**pointer, "pointer": "/data/schema/properties/other"},
                asset,
            ],
        }
        assert (
            client.post(url + "/turns", headers=AUTH, json=changed).status_code == 409
        )


def test_rename_changes_only_the_owned_conversation_title(tmp_path):
    engine = database(tmp_path)
    cid = str(uuid4())
    url = "/internal/v1/conversations/" + cid
    body = message()
    steps = [
        decision("chat"),
        tool_call("ChatReply", "reply", message="可以讨论。"),
    ]
    with TestClient(app(engine, steps)) as client:
        original = client.post(url + "/turns", headers=AUTH, json=body).json()
        other = {**AUTH, "X-Agent-Space": "other"}
        assert (
            client.patch(url, headers=other, json={"title": "不允许"}).status_code
            == 404
        )
        assert client.patch(url, headers=AUTH, json={"title": "  "}).status_code == 422
        result = client.patch(url, headers=AUTH, json={"title": "  请假表讨论  "})
        assert result.json() == {"id": cid, "title": "请假表讨论"}
        renamed = {**original["conversation"], "title": "请假表讨论"}
        assert client.get(url, headers=AUTH).json() == renamed
        assert client.post(url + "/turns", headers=AUTH, json=body).json() == {
            **original,
            "conversation": renamed,
        }


def test_import_preserves_private_state_and_durable_delivery(tmp_path):
    engine = database(tmp_path)
    cid = str(uuid4())
    text = '{"title":"旅险"}'
    receipt = {
        "check_id": "original",
        "candidate_digest": candidate_digest(text),
        "success": True,
    }
    row = {
        "id": cid,
        "space_id": "team",
        "user_id": "alice",
        "document": "创建旅险表",
        "revision": 2,
        "updated_at": "2026-01-01T00:00:00+00:00",
        "turns": [
            {
                "message": "创建旅险表",
                "result": {
                    "kind": "proposal",
                    "summary": "已准备旅险候选",
                    "candidate_text": text,
                    "check": receipt,
                },
            },
            {
                "message": "解释一下",
                "result": {"kind": "answer", "message": "供预览。"},
            },
        ],
    }
    with engine.begin() as conn:
        assert migrate_row(conn, row, False) == migrate_row(conn, row, False)
        verified = migrate_row(conn, row, True)
        assert verified["publicTurns"] == 2
        assert verified["deliveries"][0]["candidateText"] == text
    tid = stable_id("turn", cid, "1")
    url = "/internal/v1/conversations/" + cid
    with TestClient(app(engine, [])) as client:
        public = client.get(url, headers=AUTH).json()
        assert len(public["turns"]) == 2 and "candidate_text" not in json.dumps(public)
        delivery = client.get(url + "/deliveries/" + tid, headers=AUTH).json()
        assert (
            delivery["id"] == stable_id("delivery", cid, tid)
            and delivery["draftId"] == cid
            and delivery["digest"] == receipt["candidate_digest"]
        )
    with engine.begin() as conn:
        conn.execute(
            update(conversations).where(conversations.c.id == cid).values(task={})
        )
        with pytest.raises(ValueError, match="task"):
            migrate_row(conn, row, True)


def test_failed_turn_is_retryable_without_duplicate_messages(tmp_path):
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    body = message()
    with TestClient(app(engine, [])) as client:
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 502
    with engine.connect() as conn:
        assert conn.execute(select(turns.c.status)).scalar() == "failed"
    with TestClient(
        app(
            engine,
            [decision("chat"), tool_call("ChatReply", "r", message="重试已完成")],
        )
    ) as client:
        out = client.post(url + "/turns", headers=AUTH, json=body)
        assert out.status_code == 200 and len(out.json()["conversation"]["turns"]) == 1


def test_import_unsubmitted_long_document_and_existing_editor(tmp_path):
    engine = database(tmp_path)
    text = "创建一份新表。" * 40
    row = {
        "id": str(uuid4()),
        "space_id": "team",
        "user_id": "alice",
        "document": text,
        "revision": 0,
        "updated_at": "2026-01-01T00:00:00+00:00",
        "turns": [],
    }
    existing = {**row, "id": str(uuid4()), "form_id": "form-1", "version_id": "work-1"}
    with engine.begin() as conn:
        for source in (row, existing):
            migrate_row(conn, source, False)
            migrate_row(conn, source, True)
    with TestClient(app(engine, [])) as client:
        for source in (row, existing):
            view = client.get(
                "/internal/v1/conversations/" + source["id"], headers=AUTH
            ).json()
            assert view["pendingInput"] == text and view["turns"] == []
        for_editor = client.get(
            "/internal/v1/conversations?formId=form-1&workId=work-1", headers=AUTH
        ).json()
        assert [v["id"] for v in for_editor] == [existing["id"]]


def test_postgres_excludes_concurrent_execution_and_maintenance():
    import asyncio
    import os

    from sqlalchemy import text

    from form_agent.business.conversations.model import Owner
    from form_agent.business.conversations.store import (
        CUTOVER_LOCK,
        ConversationConflict,
        StoreUnavailable,
        postgres_engine,
    )

    dsn = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip(
            "Set AGENT_TEST_DATABASE_URL to a migrated disposable Agent database"
        )
    engine = postgres_engine(dsn)
    a, b = ConversationStore(engine), ConversationStore(engine)
    owner = Owner(user="test", space="test")
    cid = str(uuid4())

    async def exercise():
        async with a.exclusive(cid):
            with pytest.raises(ConversationConflict):
                async with b.exclusive(cid):
                    pytest.fail("two active writers")
            async with b.exclusive(str(uuid4())):
                pass
            with engine.begin() as conn:
                assert not conn.execute(
                    text(f"SELECT pg_try_advisory_xact_lock({CUTOVER_LOCK})")
                ).scalar()
        with engine.connect() as guard:
            assert guard.execute(
                text(f"SELECT pg_try_advisory_lock({CUTOVER_LOCK})")
            ).scalar()
            guard.commit()
            with pytest.raises(StoreUnavailable):
                await b.list(owner, None, None)
            with pytest.raises(StoreUnavailable):
                async with b.exclusive(cid):
                    pytest.fail("write during cutover")
        async with b.exclusive(cid):
            pass

    try:
        asyncio.run(exercise())
    finally:
        engine.dispose()


def test_postgres_normalizes_only_imported_replay_keys():
    import os
    import runpy
    from pathlib import Path

    from sqlalchemy import delete

    from form_agent.business.conversations.model import fingerprint
    from form_agent.business.conversations.store import postgres_engine

    dsn = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip(
            "Set AGENT_TEST_DATABASE_URL to a migrated disposable Agent database"
        )
    engine = postgres_engine(dsn)
    cid = str(uuid4())
    text = '{"城市":"广州"}'
    result = {
        "kind": "proposal",
        "summary": "就绪",
        "candidate_text": text,
        "check": {
            "success": True,
            "check_id": "s",
            "candidate_digest": candidate_digest(text),
        },
    }
    src = {
        "id": cid,
        "space_id": "team",
        "user_id": "alice",
        "document": "表单🐉",
        "revision": 1,
        "updated_at": "2026-01-01T00:00:00+00:00",
        "turns": [{"message": "表单🐉", "result": result, "inputDigest": "old"}],
    }
    path = (
        Path(__file__).resolve().parents[1]
        / "migrations/versions/0004_imported_turn_fingerprints.py"
    )
    normalize = runpy.run_path(str(path))["normalize"]
    with engine.begin() as conn:
        migrate_row(conn, src, False)
        row = (
            conn.execute(select(turns).where(turns.c.conversation_id == cid))
            .mappings()
            .one()
        )
        expected = dict(row)
        old_request = {**row["request"], "requestFingerprint": "old"}
        conn.execute(
            update(turns)
            .where(turns.c.conversation_id == cid)
            .values(
                request=old_request,
                fingerprint=fingerprint([0, "表单🐉", None, None, "old"]),
            )
        )
        native_tid = str(uuid4())
        native = {
            **dict(row),
            "turn_id": native_tid,
            "revision": 2,
            "request": {**row["request"], "context": CONTEXT},
            "fingerprint": "native-sentinel",
        }
        conn.execute(turns.insert().values(**native))
        try:
            assert normalize(conn)[1] == 1
            assert normalize(conn)[1] == 0
            restored = (
                conn.execute(
                    select(turns).where(
                        turns.c.conversation_id == cid, turns.c.revision == 1
                    )
                )
                .mappings()
                .one()
            )
            assert dict(restored) == expected
            current = (
                conn.execute(
                    select(turns).where(
                        turns.c.conversation_id == cid, turns.c.revision == 2
                    )
                )
                .mappings()
                .one()
            )
            assert dict(current) == native
        finally:
            conn.execute(delete(conversations).where(conversations.c.id == cid))
    engine.dispose()


def test_resume_after_restart_reuses_route_and_restores_progress(tmp_path):
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    body = message()
    resume = url + "/turns/" + body["turnId"] + "/resume"
    with TestClient(app(engine, [decision("chat")])) as client:
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 502
        (attempt,) = client.get(url, headers=AUTH).json()["attempts"]
        assert attempt["message"] == body["message"]
        assert attempt["resumable"] and attempt["status"] == "interrupted"
        assert any(e.get("message") == "正在回答问题" for e in attempt["events"])
        assert (
            client.post(resume, headers={**AUTH, "X-Agent-Space": "other"}).status_code
            == 404
        )

    # The restarted provider can supply only the unfinished chat response.
    with TestClient(
        app(engine, [tool_call("ChatReply", "reply", message="恢复成功")])
    ) as client:
        response = client.post(resume, headers=AUTH)
        assert response.status_code == 200, response.text
        saved = response.json()
        (turn,) = saved["conversation"]["turns"]
        assert (
            turn["turnId"] == body["turnId"] and turn["result"]["message"] == "恢复成功"
        )
        (attempt,) = saved["conversation"]["attempts"]
        assert attempt["status"] == "done" and not attempt["resumable"]
        assert [e["delta"] for e in attempt["events"] if e["type"] == "text_delta"] == [
            "恢复成功"
        ]
        assert client.post(resume, headers=AUTH).json() == saved


def test_partial_reply_checkpoint_reset_and_final_suffix(tmp_path, monkeypatch):
    from form_agent.api import conversations as api
    from form_agent.business.form_authoring.contracts import Answer

    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    body = message()
    resume = url + "/turns/" + body["turnId"] + "/resume"
    calls = 0

    async def interrupted_then_recovered(graph, request, trace, recursion_limit):
        nonlocal calls
        calls += 1
        yield {"type": "text_reset"}
        if calls == 1:
            yield {"type": "text_delta", "delta": "旧片段"}
            raise TimeoutError()
        yield {"type": "text_delta", "delta": "新"}
        yield {
            "type": "private_result",
            "result": Answer(kind="answer", message="新答复"),
        }

    monkeypatch.setattr(api, "stream_graph_events", interrupted_then_recovered)
    with TestClient(app(engine, [])) as client:
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 504
        before = client.get(url, headers=AUTH).json()["attempts"][0]["events"]
        assert before[-1] == {"type": "text_delta", "delta": "旧片段"}
        response = client.post(
            resume, headers={**AUTH, "Accept": "application/x-ndjson"}
        )
        frames = [json.loads(line) for line in response.iter_lines()]
        assert [e["delta"] for e in frames if e["type"] == "text_delta"] == [
            "新",
            "答复",
        ]
        events = frames[-1]["result"]["conversation"]["attempts"][0]["events"]
        assert events == [
            *before,
            {"type": "text_reset"},
            {"type": "text_delta", "delta": "新"},
            {"type": "text_delta", "delta": "答复"},
        ]


def test_read_only_turn_goes_to_chat_without_authoring(tmp_path):
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    steps = [tool_call("ChatReply", "reply", message="可以查看配置。")]
    with TestClient(app(engine, steps)) as client:
        response = client.post(
            url + "/turns",
            headers=AUTH,
            json={**message(text="帮我修改表单"), "readOnly": True},
        )
        assert response.status_code == 200, response.text
        assert "delivery" not in response.json()
        assert response.json()["conversation"]["turns"][0]["result"]["kind"] == "answer"


def test_stream_failure_trace_can_be_found_in_attempt_history(tmp_path, monkeypatch):
    from form_agent.api import conversations as api

    async def fail_during_schema_check(
        graph, request, trace, recursion_limit, **_options
    ):
        yield {"type": "progress", "message": "正在请求 Platform 检查数据 Schema"}
        raise RuntimeError("private compiler failure")

    monkeypatch.setattr(api, "stream_graph_events", fail_during_schema_check)
    url = "/internal/v1/conversations/" + str(uuid4())
    trace = str(uuid4())
    with TestClient(app(database(tmp_path), [])) as client:
        response = client.post(
            url + "/turns",
            headers={**AUTH, "Accept": "application/x-ndjson", "X-Trace-Id": trace},
            json=message(),
        )
        assert response.status_code == 200
        assert json.loads(response.text.splitlines()[-1]) == {
            "type": "error",
            "traceId": trace,
            "status": 502,
            "reason": "处理这一步时发生服务异常。",
        }
        (attempt,) = client.get(url, headers=AUTH).json()["attempts"]
        assert attempt["interruptionTraceId"] == trace
        assert attempt["resumable"]
        assert attempt["elapsedMs"] >= 0


def test_schema_tool_explains_unavailable_compiler_environment(tmp_path, monkeypatch):
    from form_agent.api import conversations as api
    from form_agent.integrations.platform_tools import platform_tools

    def unavailable(request):
        assert request.url.path == "/internal/agent-tools/check-schema"
        return httpx.Response(
            503, json={"message": "Requested compiler environment unavailable"}
        )

    client_factory = httpx.AsyncClient

    def mock_platform(**kwargs):
        return client_factory(transport=httpx.MockTransport(unavailable), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", mock_platform)

    async def check_schema(graph, request, trace, recursion_limit, **_options):
        yield {"type": "progress", "message": "正在请求 Platform 检查数据 Schema"}
        tools = platform_tools("http://test-platform", "service", None)
        assert tools.check_schema is not None
        await tools.check_schema({"check_environment": "env"}, "{}", [])

    monkeypatch.setattr(api, "stream_graph_events", check_schema)
    url = "/internal/v1/conversations/" + str(uuid4())
    with TestClient(app(database(tmp_path), [])) as client:
        response = client.post(
            url + "/turns",
            headers={**AUTH, "Accept": "application/x-ndjson"},
            json=message(),
        )
        failure = json.loads(response.text.splitlines()[-1])
        assert failure["status"] == 502
        assert "本次执行所用的编译环境已不可用" in failure["reason"]
        assert "使用当前环境重新检查" in failure["reason"]
        (attempt,) = client.get(url, headers=AUTH).json()["attempts"]
        assert attempt["interruptionReason"] == failure["reason"]


def test_resume_rechecks_in_new_compiler_environment_and_keeps_original_request(
    tmp_path, monkeypatch
):
    from form_agent.api import conversations as api
    from form_agent.business.form_authoring.contracts import Answer
    from form_agent.execution.journal import call, step

    checked = []
    understood = []
    protocol_reads = []
    executed = []

    async def understand(state):
        value = state["request"].message

        async def invoke():
            understood.append(value)
            return value

        return {"requirements": await call("llm", {"message": value}, invoke, str, str)}

    async def check(state):
        environment = state["request"].context["check_environment"]

        async def read_protocol():
            protocol_reads.append(environment)
            return "pinned protocol"

        await call(
            "tool",
            {"name": "read_protocol", "version": "pinned"},
            read_protocol,
            str,
            str,
        )

        async def invoke():
            checked.append(environment)
            return environment

        return {"receipt": await call("tool", {"schema": "{}"}, invoke, str, str)}

    async def stream(graph, request, trace, recursion_limit, **_options):
        yield {"type": "progress", "message": "正在检查"}
        environment = request.context["check_environment"]
        executed.append(environment)
        state = {"request": request}
        requirements = await step("understand", understand)(state)
        receipt = await step("check", check)({**state, "steps": 1})
        assert receipt["receipt"] == environment
        if len(executed) < 3:
            raise RuntimeError("interrupted after saving check")
        yield {
            "type": "private_result",
            "result": Answer(kind="answer", message=requirements["requirements"]),
        }

    monkeypatch.setattr(api, "stream_graph_events", stream)
    engine = database(tmp_path)
    url = "/internal/v1/conversations/" + str(uuid4())
    body = message()
    resume = url + "/turns/" + body["turnId"] + "/resume"
    with TestClient(app(engine, [])) as client:
        assert client.post(url + "/turns", headers=AUTH, json=body).status_code == 502
        updated = {"check_environment": "next-env"}
        interrupted = client.post(
            resume, headers={**AUTH, "Accept": "application/x-ndjson"}, json=updated
        )
        assert interrupted.status_code == 200
        first, _, failure = (json.loads(line) for line in interrupted.text.splitlines())
        assert first["type"] == "progress" and "当前编译环境" in first["message"]
        assert failure["type"] == "error" and failure["status"] == 502
        result = client.post(resume, headers=AUTH, json=updated)
        assert result.status_code == 200, result.text
        (turn,) = result.json()["conversation"]["turns"]
        assert turn["turnId"] == body["turnId"]
        assert (
            client.post(
                resume, headers=AUTH, json={"check_environment": "later"}
            ).json()
            == result.json()
        )
    assert executed == ["env", "next-env", "next-env"]
    assert checked == ["env", "next-env"]
    assert understood == [body["message"]]
    assert protocol_reads == ["env"]
    with engine.connect() as conn:
        stored = conn.execute(select(turns.c.request)).scalar_one()
        assert stored["context"] == CONTEXT
