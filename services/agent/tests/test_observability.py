import asyncio
import json
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage
from pydantic import JsonValue
from test_agent_turn import TurnModel, decision, tool_call
from test_create_form import DOCUMENT, standard_requirements
from test_execution_replay import RestartJournal

from form_agent.agent.graph import build_turn_graph
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.api.events import stream_graph_events
from form_agent.business.form_authoring.contracts import (
    CheckReceipt,
    TurnInput,
)
from form_agent.execution.journal import execution_scope
from form_agent.integrations.compiler import candidate_digest
from form_agent.integrations.models import codex_usage
from form_agent.observability.callbacks import evaluation_callback_factory
from form_agent.observability.raw_trace import RawTraceArchive


def test_evaluation_tracing_requires_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("CREATE_FORM_LANGFUSE_EVAL", raising=False)
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-evaluation")
    assert evaluation_callback_factory() is None


class MeteredModel(TurnModel):
    def __init__(self, steps: list[AIMessage]):
        super().__init__(steps)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        result = super()._generate(messages, stop, run_manager, **kwargs)
        response = result.generations[0].message
        assert isinstance(response, AIMessage)
        response.usage_metadata = codex_usage({"input_tokens": 25, "output_tokens": 8})
        return result


def test_langfuse_exports_graph_nodes_models_and_platform_calls(tmp_path):
    langfuse = pytest.importorskip("langfuse")
    from langfuse.langchain import CallbackHandler
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    async def protocol(context, query) -> JsonValue:
        return {"section": "scope"}

    async def catalog(context, kind, query) -> JsonValue:
        return ["text-input"] if kind == "material" else []

    async def compiler(context, text):
        return CheckReceipt(
            check_id="compiler-1", success=True, candidate_digest=candidate_digest(text)
        )

    async def run(callback):
        graph = build_turn_graph(
            MeteredModel(
                [
                    decision("compose"),
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
                    tool_call(
                        "check_candidate", "submit", candidate_text='{"ok":true}'
                    ),
                ]
            ),
            AgentToolDependencies(protocol, catalog, compiler),
        )
        request = TurnInput.model_validate(
            {
                "message": "按之前的需求生成",
                "context": {"target": "web"},
                "requirements_document": DOCUMENT,
                "previous_standard": standard_requirements(),
            }
        )
        return [
            frame
            async for frame in stream_graph_events(
                graph,
                request,
                uuid4(),
                callbacks=[callback, archive],
                trace_metadata={
                    "langfuse_session_id": "eval-session",
                    "turn_id": "eval-turn",
                },
            )
        ]

    exporter = InMemorySpanExporter()
    archive = RawTraceArchive(tmp_path / "events.jsonl", case_id="trace-test")
    public_key = "pk-lf-" + uuid4().hex
    client = langfuse.Langfuse(
        public_key=public_key,
        secret_key="sk-lf-test",
        base_url="http://localhost",
        span_exporter=exporter,
        sample_rate=1.0,
    )
    try:
        journal = RestartJournal(None)
        with execution_scope(journal):
            events = asyncio.run(run(CallbackHandler(public_key=public_key)))
        assert events[-1]["result"].kind == "proposal"
        client.flush()
        spans = exporter.get_finished_spans()
        by_name = {span.name: span for span in spans}
        assert {
            "AgentTurn",
            "route",
            "compose",
            "compose.schema_draft",
            "compose.capability_evidence",
            "platform.query_capabilities",
            "platform.read_protocol",
            "platform.check_candidate",
            "check",
            "deliver",
        } <= by_name.keys()
        root = by_name["AgentTurn"]
        assert root.attributes is not None and root.context is not None
        assert root.attributes["session.id"] == "eval-session"
        for name in ("compose.schema_draft", "platform.check_candidate", "route"):
            span = by_name[name]
            assert span.context is not None
            assert span.context.trace_id == root.context.trace_id
            assert span.start_time is not None and span.end_time is not None
            assert span.end_time >= span.start_time
            assert span.attributes is not None
            assert "langfuse.observation.input" in span.attributes
            assert "langfuse.observation.output" in span.attributes
        generations = [
            span.attributes
            for span in spans
            if span.attributes
            and span.attributes.get("langfuse.observation.type") == "generation"
        ]
        assert generations
        assert any(
            json.loads(str(attrs.get("langfuse.observation.usage_details", "{}"))).get(
                "input"
            )
            == 25
            for attrs in generations
        )
        exporter.clear()
        with execution_scope(journal, resume=True):
            events = asyncio.run(run(CallbackHandler(public_key=public_key)))
        assert events[-1]["result"].kind == "proposal"
        client.flush()
        replay_spans = exporter.get_finished_spans()
        assert "journal.replay" in {span.name for span in replay_spans}
        assert not any(
            span.attributes
            and span.attributes.get("langfuse.observation.type") == "generation"
            for span in replay_spans
        )
        records = [json.loads(line) for line in archive.path.read_text().splitlines()]
        names = {row["event"] for row in records}
        assert {
            "on_chain_start",
            "on_chain_end",
            "on_chat_model_start",
            "on_llm_end",
        } <= names
        assert any(row["kwargs"].get("name") == "journal.replay" for row in records)
    finally:
        client.shutdown()


def test_raw_trace_preserves_large_values_and_extended_callbacks(tmp_path):
    archive = RawTraceArchive(tmp_path / "events.jsonl", case_id="large-payload")
    content = "原" * 800_000
    archive.on_custom_event("diagnostic", {"later_analysis": content}, run_id=uuid4())
    archive.on_llm_new_token("增量", run_id=uuid4())
    archive.on_chain_error(ValueError("broken"), run_id=uuid4())

    events = [json.loads(line) for line in archive.path.read_text().splitlines()]
    assert events[0]["args"][1]["later_analysis"] == content
    assert events[1]["args"] == ["增量"]
    assert events[2]["args"][0]["type"] == "ValueError"
    assert events[2]["args"][0]["traceback"]
    assert [event["sequence"] for event in events] == [1, 2, 3]
    assert archive.path.stat().st_mode & 0o777 == 0o600
