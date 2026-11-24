import asyncio
import json
from types import SimpleNamespace

import pytest

from form_agent.create_form.nodes.understand import document


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
        asyncio.run(
            document.stream_document(
                Model(), [], {"document": "无匹配引文"}
            )
        )
    assert not seen
