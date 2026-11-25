import asyncio
import base64
import json

from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, LLMResult
from run import ModelUsage, load_cases, run_case, score_case, summarize

from form_agent.observability.raw_trace import RawTraceArchive


def test_model_usage_includes_streams_and_exposes_missing_provider_usage():
    usage = ModelUsage()
    for message, generation in [
        (
            AIMessage(
                content="",
                usage_metadata={
                    "input_tokens": 60,
                    "output_tokens": 10,
                    "total_tokens": 70,
                    "input_token_details": {"cache_read": 20},
                },
            ),
            ChatGeneration,
        ),
        (
            AIMessageChunk(
                content="",
                usage_metadata={
                    "input_tokens": 25,
                    "output_tokens": 5,
                    "total_tokens": 30,
                },
            ),
            ChatGenerationChunk,
        ),
        (AIMessage(content="usage unavailable"), ChatGeneration),
    ]:
        usage.on_chat_model_start({}, [])
        usage.on_llm_end(LLMResult(generations=[[generation(message=message)]]))
    assert usage.snapshot() == {
        "calls": 3,
        "reported_calls": 2,
        "complete": False,
        "input_tokens": 85,
        "output_tokens": 15,
        "total_tokens": 100,
        "cached_input_tokens": 20,
    }


def test_reference_and_business_counterexample_use_the_same_compiler(tmp_path):
    _, cases = load_cases()
    case = {**cases["country-change-clears-city"], "trial": 1}
    reference = asyncio.run(run_case(case, "reference"))
    archive = RawTraceArchive(tmp_path / "runtime.events.jsonl", case_id=case["id"])
    broken = asyncio.run(run_case(case, "reference-broken", archive=archive))

    assert reference["scores"]["business_success"]
    assert broken["scores"]["compiler_final_pass"]
    assert not broken["scores"]["business_success"]
    assert broken["failure_at"] == "runtime"
    assert {
        assertion["id"]: assertion["status"]
        for assertion in broken["runtime_assertions"]
    } == {
        "city.cleared-on-country-change": "fail",
        "city.preserved-on-unrelated-change": "pass",
    }
    assert summarize([reference, broken])["scores"]["business_success"] == {
        "passed": 1,
        "evaluated": 2,
    }
    records = [json.loads(line) for line in archive.path.read_text().splitlines()]
    runtime = next(
        row["kwargs"]
        for row in records
        if row["event"] == "bridge.end" and row["kwargs"]["operation"] == "runtime"
    )
    assert json.loads(base64.urlsafe_b64decode(runtime["stdout"]))["assertions"][0][
        "actual"
    ] == {"kind": "value", "value": "上海"}


def test_failed_compiler_leaves_runtime_assertions_not_run():
    _, cases = load_cases()
    case = {**cases["contact-length"], "trial": 1}
    scored = score_case(
        case,
        "agent",
        [{"result": {"kind": "blocked"}}],
        [["route", "understand", "compose", "check", "deliver"]],
        [{"success": False}],
        {},
        None,
        0,
    )
    assert scored["failure_at"] == "compiler"
    assert not scored["scores"]["business_success"]
    assert {assertion["status"] for assertion in scored["runtime_assertions"]} == {
        "not_run"
    }
