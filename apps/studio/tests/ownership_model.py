"""Deterministic model for the isolated browser/HTTP/storage acceptance stack."""

import json
import sys
from pathlib import Path
from form_agent import server
from form_agent.dev import create_dev_app

sys.path.insert(0, str(Path.cwd() / "tests"))
from test_create_form import ScriptedModel, tool_call


def app():
    standard = {
        "goal": "会议报名",
        "scope": "网页",
        "requirements": [
            {
                "id": "R1",
                "kind": "data",
                "subject": "姓名",
                "behavior": "选择是否实名",
                "sources": [{"source_id": "document", "quote": "会议报名表"}],
            }
        ],
        "issues": [
            {
                "requirement_ids": ["R1"],
                "disposition": "ask_user",
                "detail": "是否使用实名？",
                "blocking": True,
                "sources": [
                    {
                        "source_id": "document",
                        "quote": "必须匿名，同时必须展示并提交真实姓名",
                    }
                ],
            }
        ],
    }
    candidate = {
        "protocolVersion": "1.0",
        "id": "meetup",
        "version": "1.0",
        "data": {
            "schema": {
                "type": "object",
                "required": ["name"],
                "properties": {"name": {"type": "string"}},
            }
        },
        "views": {
            "default": {
                "material": "section",
                "children": [
                    {
                        "material": "field",
                        "props": {"label": "姓名"},
                        "children": [
                            {
                                "material": "text-input",
                                "bindings": {
                                    "value": {"source": "data", "path": "/name"}
                                },
                            }
                        ],
                    }
                ],
            }
        },
    }
    steps = [
        tool_call("TurnDecision", "a", action="chat"),
        tool_call("ChatReply", "b", message="必填字段需要在提交时填写。"),
        tool_call("TurnDecision", "c", action="understand"),
        tool_call("DocumentUnderstanding", "d", decision="create", standard=standard),
        tool_call("TurnDecision", "e", action="chat"),
        tool_call("ChatReply", "f", message="匿名和实名互相冲突，创建前需要选择。"),
        tool_call("TurnDecision", "g", action="understand"),
        tool_call(
            "ClarificationPatch",
            "h",
            needs_full_read=False,
            resolved_issue_indexes=[0],
            edits=[
                {
                    "requirement_id": "R1",
                    "behavior": "选择实名，姓名必填",
                    "field_value_type": None,
                }
            ],
        ),
        tool_call("read_protocol", "i", query="表单"),
        tool_call("query_capabilities", "j", kind="material", query="text-input"),
        tool_call(
            "record_configuration_mapping",
            "k",
            items=[
                {
                    "requirement_id": "R1",
                    "destinations": ["data.schema.properties.name"],
                    "status": "ready",
                    "detail": "绑定姓名",
                }
            ],
        ),
        tool_call(
            "check_candidate",
            "l",
            candidate_text=json.dumps(candidate, ensure_ascii=False),
        ),
        tool_call("TurnDecision", "m", action="chat"),
        tool_call("ChatReply", "n", message="已保存的报名表需要填写姓名。"),
    ]
    server.configured_model = lambda: ScriptedModel(steps)
    return create_dev_app()
