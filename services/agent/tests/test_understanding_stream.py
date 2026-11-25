import asyncio
import json
from types import SimpleNamespace

import pytest

from form_agent.agent.nodes.understand import document


def test_only_complete_business_records_are_exposed(monkeypatch):
    seen = []

    async def capture(name, data):
        seen.append((name, data))

    monkeypatch.setattr(document, "adispatch_custom_event", capture)
    requirement = {
        "id": "R1",
        "kind": "data",
        "subject": "城市",
        "behavior": "显示名称",
        "sources": [{"source_id": "document", "quote": "显示名称"}],
    }
    question = {
        "requirement_ids": ["R1"],
        "disposition": "ask_user",
        "detail": "只保存编码吗？",
        "blocking": True,
    }

    class Model:
        async def astream(self, messages):
            first = json.dumps({"requirement": requirement}, ensure_ascii=False)
            yield SimpleNamespace(text=first[:20])
            assert not seen
            yield SimpleNamespace(text=first[20:] + "\n")
            assert len(seen) == 1
            yield SimpleNamespace(text=json.dumps({"issue": question}) + "\n")
            assert seen[-1][1]["text"] == "只保存编码吗？"
            yield SimpleNamespace(
                text=json.dumps(
                    {
                        "finish": {
                            "decision": "create",
                            "standard": {"goal": "登记", "scope": "旅险"},
                        }
                    }
                )
            )

    result = asyncio.run(
        document.stream_document(Model(), [], {"document": "列表显示名称"})
    )
    assert result.standard.requirements[0].id == "R1"
    assert result.standard.issues[0].disposition == "ask_user"
    seen.clear()
    with pytest.raises(ValueError, match="source excerpt"):
        asyncio.run(document.stream_document(Model(), [], {"document": "无匹配引文"}))
    assert not seen


def test_understanding_keeps_validation_and_reports_timings(monkeypatch, caplog):
    from form_agent.agent.authoring_state import DocumentUnderstanding
    from form_agent.business.form_authoring.errors import InvalidCreateFormResult

    requirement = {
        "id": "R1",
        "kind": "data",
        "subject": "人数",
        "behavior": "最多六人",
        "sources": [{"source_id": "document", "quote": "最多六人"}],
    }
    finish = {"decision": "create", "standard": {"goal": "投保", "scope": "名单"}}
    dispatches = []

    async def dispatch(name, data):
        dispatches.append(name)

    class Model:
        async def astream(self, messages):
            yield SimpleNamespace(text=json.dumps({"requirement": requirement}) + "\n")
            yield SimpleNamespace(text=json.dumps({"finish": finish}))

    async def fallback(model, schema, messages):
        return DocumentUnderstanding.model_validate(
            {
                **finish,
                "standard": {**finish["standard"], "requirements": [requirement]},
            }
        )

    monkeypatch.setattr(document, "adispatch_custom_event", dispatch)
    monkeypatch.setattr(document, "structured", fallback)
    with caplog.at_level("INFO", logger="uvicorn.error"):
        result = asyncio.run(
            document.read_document(Model(), [], {"document": "最多六人"})
        )
        with pytest.raises(InvalidCreateFormResult, match="source"):
            asyncio.run(document.read_document(Model(), [], {"document": "另一份"}))

    assert result.standard is not None
    assert result.standard.requirements[0].sources[0].quote == "最多六人"
    assert dispatches == ["understanding_item", "understanding_reset"]
    timings = [
        json.loads(record.getMessage().removeprefix("understanding_timing "))
        for record in caplog.records
        if record.getMessage().startswith("understanding_timing ")
    ]
    first, rejected = timings
    assert first["first_requirement_ms"] <= first["last_requirement_ms"]
    assert (
        first["last_requirement_ms"] <= first["finish_record_ms"] <= first["total_ms"]
    )
    assert first["outcome"] == "validated"
    assert rejected["fallback_ms"] is not None
    assert rejected["outcome"] == "failed"
