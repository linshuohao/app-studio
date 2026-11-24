import asyncio
import base64
import json

from run import load_cases, run_case, score_case, summarize

from form_agent.raw_trace import RawTraceArchive


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
