"""Run versioned CreateForm cases with the Compiler, Runtime and Langfuse experiments."""

import argparse
import asyncio
import json
import os
import subprocess
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from statistics import median
from time import monotonic
from uuid import uuid4

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult
from pydantic import JsonValue
from starlette.config import Config

from form_agent.agent.budgets import TURN_RECURSION_LIMIT
from form_agent.agent.graph import build_turn_graph
from form_agent.agent.tools.dependencies import AgentToolDependencies
from form_agent.business.conversations.model import (
    Context,
    Message,
    public_result,
)
from form_agent.business.form_authoring.contracts import (
    CheckReceipt,
)
from form_agent.business.form_authoring.task_facts import FormAuthoringTaskFacts
from form_agent.integrations.compiler import candidate_digest
from form_agent.integrations.models import configured_model
from form_agent.observability.raw_trace import RawTraceArchive

HERE = Path(__file__).resolve().parent
AGENT = HERE.parent
ROOT = AGENT.parent.parent
EXAMPLES = AGENT / "examples"
MANUAL = AGENT / "knowledge/createform-l1-2026-11-22.2.md"
ENVIRONMENT = "createform-eval-web"
SCORER = "createform-score-v1"
NODES = {"route", "understand", "compose", "check", "repair", "deliver"}


class RouteEvidence(BaseCallbackHandler):
    """Read native Graph callbacks; retain only outer node order for scoring."""

    def __init__(self):
        self.nodes: list[str] = []

    def on_chain_start(self, serialized, inputs, *, name=None, metadata=None, **kwargs):
        if name in NODES and (metadata or {}).get("langgraph_node") == name:
            self.nodes.append(name)


class ModelUsage(BaseCallbackHandler):
    """Record reported usage once per completed provider call, including streamed calls."""

    def __init__(self):
        self.started = 0
        self.reported = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.cached_input_tokens = 0

    def on_chat_model_start(self, serialized, messages, **kwargs):
        self.started += 1

    def on_llm_end(self, response: LLMResult, **kwargs):
        usages = [
            generation.message.usage_metadata
            for batch in response.generations
            for generation in batch
            if isinstance(generation, ChatGeneration)
            and isinstance(generation.message, AIMessage)
            and generation.message.usage_metadata
        ]
        if not usages:
            return
        self.reported += 1
        for usage in usages:
            if usage is None:
                continue
            self.input_tokens += usage["input_tokens"]
            self.output_tokens += usage["output_tokens"]
            self.cached_input_tokens += usage.get("input_token_details", {}).get(
                "cache_read", 0
            )

    def snapshot(self):
        return {
            "calls": self.started,
            "reported_calls": self.reported,
            "complete": self.started > 0 and self.started == self.reported,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "cached_input_tokens": self.cached_input_tokens,
        }


async def bridge(operation, archive=None, **inputs):
    if archive:
        archive.record("bridge.start", operation=operation, input=inputs)
    started = monotonic()
    process = await asyncio.create_subprocess_exec(
        "node",
        "--import",
        "./services/api/dev-loader.mjs",
        "./tools/engineering/createform-eval-runtime.mjs",
        cwd=ROOT,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    completed = asyncio.create_task(
        process.communicate(
            json.dumps({"operation": operation, **inputs}, ensure_ascii=False).encode()
        )
    )
    try:
        async with asyncio.timeout(30):
            await asyncio.shield(completed)
    finally:
        if process.returncode is None:
            process.kill()
        output, errors = await completed
        if archive:
            archive.record(
                "bridge.end",
                operation=operation,
                stdout=output,
                stderr=errors,
                returncode=process.returncode,
                elapsed_ms=round((monotonic() - started) * 1000),
            )
    if process.returncode:
        raise RuntimeError(errors.decode(errors="replace")[-2000:])
    return json.loads(output)


async def run_case(case, mode, callbacks=(), archive=None, *, compose="staged"):
    started = monotonic()
    checks, turns, routes = [], [], []
    candidate = None
    error = None
    runtime = {}
    generation_ms = None
    usage = ModelUsage()

    async def compile_candidate(context, text):
        receipt = CheckReceipt.model_validate(
            await bridge("check", archive, candidate=text)
        )
        checks.append(receipt.model_dump())
        return receipt

    async def protocol(context, query) -> JsonValue:
        return {"knowledge_version": MANUAL.stem, "markdown": MANUAL.read_text()}

    async def catalog(context, kind, query):
        return await bridge("catalog", archive, kind=kind, query=query)

    async def check_schema(context, text, cases):
        return CheckReceipt.model_validate(
            await bridge("check-schema", archive, schema=text, cases=cases)
        )

    try:
        if mode == "agent":
            facts = FormAuthoringTaskFacts()
            conversation = str(uuid4())
            graph = build_turn_graph(
                configured_model(),
                AgentToolDependencies(
                    protocol,
                    catalog,
                    compile_candidate,
                    check_schema if compose == "staged" else None,
                ),
            )
            clarification = case.get("clarification")
            messages = ["请按这份 PRD 创建表单。"]
            if clarification:
                messages.append(clarification["answer"])
            for index, text in enumerate(messages):
                route = RouteEvidence()
                routes.append(route.nodes)
                message = Message(
                    turnId=uuid4(),
                    revision=index,
                    message=text,
                    document=case["markdown"] if index == 0 else None,
                    context=Context(
                        target="web",
                        knowledge_version=MANUAL.stem,
                        check_environment=ENVIRONMENT,
                    ),
                )
                request = facts.graph_input(conversation, message, turns)
                async with asyncio.timeout(600):
                    state = await graph.ainvoke(
                        {"request": request},
                        config={
                            "run_name": "AgentTurn",
                            "recursion_limit": TURN_RECURSION_LIMIT,
                            "callbacks": [
                                route,
                                usage,
                                *callbacks,
                                *([archive] if archive else []),
                            ],
                            "metadata": {"case_id": case["id"], "turn": index + 1},
                        },
                    )
                result = state["result"].model_dump(mode="json", exclude_none=True)
                facts.advance(
                    conversation,
                    index + 1,
                    text,
                    message.document,
                    request.referenced_candidate,
                    result,
                )
                turns.append({"message": text, "result": public_result(result)})
                if result["kind"] == "proposal":
                    candidate = result["candidate_text"]
                if index == 0 and clarification and result["kind"] != "clarification":
                    break
        else:
            candidate = (EXAMPLES / case["fixture"] / "expected.form.json").read_text()
            if (
                mode == "reference-broken"
                and case["id"] == "country-change-clears-city"
            ):
                broken = json.loads(candidate)
                broken.pop("reactions")
                candidate = json.dumps(broken, ensure_ascii=False)
            await compile_candidate({}, candidate)
        generation_ms = round((monotonic() - started) * 1000)
        if candidate and any(
            check["success"]
            and check["candidate_digest"] == candidate_digest(candidate)
            for check in checks
        ):
            runtime = await bridge(
                "runtime", archive, candidate=candidate, assertions=case["assertions"]
            )
    except Exception as exc:
        if archive:
            archive.record("evaluation.error", error=exc)
        error = {"type": type(exc).__name__, "message": str(exc)}
    result = score_case(case, mode, turns, routes, checks, runtime, error, started)
    if mode == "agent":
        result["agent_ms"] = generation_ms
        result["model_usage"] = usage.snapshot()
    return result


def score_case(case, mode, turns, routes, checks, runtime, error, started):
    actual = {item["id"]: item["actual"] for item in runtime.get("assertions", [])}
    assertions = [
        {
            "id": item["id"],
            "expected": item["expected"],
            "actual": actual.get(item["id"]),
            "status": (
                "not_run"
                if item["id"] not in actual
                else "pass"
                if actual[item["id"]] == item["expected"]
                else "fail"
            ),
        }
        for item in case["assertions"]
    ]
    result_kinds = [turn["result"]["kind"] for turn in turns]
    scores = {
        "execution_ok": error is None,
        "compiler_executed": bool(checks),
        "runtime_complete": all(item["status"] != "not_run" for item in assertions),
    }
    if checks:
        scores["compiler_first_pass"] = checks[0]["success"]
        scores["compiler_final_pass"] = checks[-1]["success"]
    if mode == "agent":
        clarification = case.get("clarification")
        expected = ["clarification", "proposal"] if clarification else ["proposal"]
        scores["business_disposition"] = result_kinds == expected
        if clarification:
            questions = (
                " ".join(turns[0]["result"].get("questions", [])) if turns else ""
            )
            scores["clarification_relevant"] = any(
                term in questions for term in clarification["terms"]
            )
        final = routes[-1] if routes else []
        scores["route_valid"] = (
            scores["business_disposition"]
            and "understand" in final
            and "check" in final
            and "deliver" in final
            and final.index("understand")
            < final.index("check")
            < final.index("deliver")
            and (
                not clarification or not {"compose", "check", "repair"} & set(routes[0])
            )
        )
    business_ok = (
        error is None
        and bool(checks)
        and checks[-1]["success"]
        and all(item["status"] == "pass" for item in assertions)
        and scores.get("business_disposition", True)
        and scores.get("clarification_relevant", True)
    )
    scores["business_success"] = business_ok
    missed_clarification = (
        mode == "agent"
        and case.get("clarification")
        and (
            result_kinds[:1] != ["clarification"]
            or not scores["clarification_relevant"]
        )
    )
    if error:
        stage = "execution"
    elif missed_clarification:
        stage = "disposition"
    elif checks and not scores["compiler_final_pass"]:
        stage = "compiler"
    elif scores.get("business_disposition") is False:
        stage = "disposition"
    elif not scores.get("compiler_final_pass"):
        stage = "compiler"
    elif not business_ok:
        stage = "runtime"
    elif scores.get("route_valid") is False:
        stage = "route"
    else:
        stage = "pass"
    return {
        "case_id": case["id"],
        "trial": case["trial"],
        "group": case["group"],
        "mode": mode,
        "scores": scores,
        "failure_at": stage,
        "runtime_assertions": assertions,
        "turns": turns,
        "routes": routes,
        "compiler_checks": checks,
        "elapsed_ms": round((monotonic() - started) * 1000),
        "compiler_calls": len(checks),
        "repair_steps": sum(nodes.count("repair") for nodes in routes),
        "error": error,
        "runtime_diagnostics": runtime.get("diagnostics", []),
    }


def load_cases():
    suite = json.loads((HERE / "cases.json").read_text())
    cases = {item["id"]: item for item in suite["cases"]}
    if not cases or len(cases) != len(suite["cases"]):
        raise ValueError("Evaluation cases require unique IDs")
    for item in cases.values():
        item["markdown"] = (
            EXAMPLES / item["fixture"] / (item["prd"] + ".md")
        ).read_text()
        if target := item.get("reuse_assertions"):
            item["assertions"] = cases[target]["assertions"]
        assertions = item["assertions"]
        if not assertions or len({item["id"] for item in assertions}) != len(
            assertions
        ):
            raise ValueError(f"Case {item['id']} requires nonempty, unique assertions")
    return suite["version"], cases


def summarize(results):
    outcomes = {}
    for result in results:
        for name, value in result["scores"].items():
            tally = outcomes.setdefault(name, {"passed": 0, "evaluated": 0})
            tally["passed"] += int(value)
            tally["evaluated"] += 1
    return {
        "trials": len(results),
        "scores": outcomes,
        "elapsed_ms_median": median(result["elapsed_ms"] for result in results),
    }


def save_report(output, metadata, results, experiment_url=None):
    summary = summarize(results)
    report = {
        "metadata": metadata,
        "experiment_url": experiment_url,
        "summary": summary,
        "results": results,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
        file.write("\n")
    business = summary["scores"]["business_success"]
    print(f"Business success: {business['passed']}/{business['evaluated']}")
    print(f"Report: {output}")
    if experiment_url:
        print(f"Langfuse: {experiment_url}")


async def run_item(
    case, mode, callbacks=(), archive_path=None, trace_id=None, *, compose="staged"
):
    label = f"{case['id']} #{case['trial']}"
    print(f"Running {label}", flush=True)
    archive = (
        RawTraceArchive(
            archive_path,
            case_id=case["id"],
            trial=case["trial"],
            trace_id=trace_id,
        )
        if archive_path is not None
        else None
    )
    if archive:
        archive.record("evaluation.start", case=case, mode=mode)
    result = await run_case(case, mode, callbacks, archive, compose=compose)
    if archive:
        archive.record("evaluation.end", output=result)
    print(f"{label}: {result['failure_at']} ({result['elapsed_ms']} ms)", flush=True)
    return result


def run_langfuse(items, args, metadata, archive_path):
    from langfuse import Evaluation, Langfuse
    from langfuse.langchain import CallbackHandler

    public_key = os.environ["LANGFUSE_PUBLIC_KEY"]
    client = Langfuse(
        base_url=os.environ["LANGFUSE_BASE_URL"],
        public_key=public_key,
        secret_key=os.environ["LANGFUSE_SECRET_KEY"],
        sample_rate=1.0,
    )

    async def task(*, item, **kwargs):
        return await run_item(
            item["input"],
            args.mode,
            callbacks=(CallbackHandler(public_key=public_key),),
            archive_path=archive_path,
            trace_id=client.get_current_trace_id(),
            compose=args.compose,
        )

    def evaluate(*, output, **kwargs):
        if output is None:
            return Evaluation(name="execution_ok", value=False, data_type="BOOLEAN")
        return [
            *[
                Evaluation(
                    name=name,
                    value=value,
                    data_type="BOOLEAN",
                    comment=output["failure_at"],
                )
                for name, value in output["scores"].items()
            ],
            Evaluation(
                name="failure_at", value=output["failure_at"], data_type="CATEGORICAL"
            ),
            Evaluation(name="elapsed_ms", value=output["elapsed_ms"]),
            Evaluation(name="compiler_calls", value=output["compiler_calls"]),
            Evaluation(name="repair_steps", value=output["repair_steps"]),
            *(
                [Evaluation(name="agent_ms", value=output["agent_ms"])]
                if output.get("agent_ms") is not None
                else []
            ),
            *[
                Evaluation(
                    name=item["id"],
                    value=item["status"],
                    data_type="CATEGORICAL",
                    comment=json.dumps(
                        {"expected": item["expected"], "actual": item["actual"]},
                        ensure_ascii=False,
                    ),
                )
                for item in output["runtime_assertions"]
            ],
        ]

    def evaluate_run(*, item_results, **kwargs):
        outputs = [
            item.output for item in item_results if isinstance(item.output, dict)
        ]
        if len(outputs) != len(items):
            return Evaluation(
                name="experiment_complete", value=False, data_type="BOOLEAN"
            )
        summary = summarize(outputs)
        return [
            Evaluation(name="experiment_complete", value=True, data_type="BOOLEAN"),
            Evaluation(name="elapsed_ms_median", value=summary["elapsed_ms_median"]),
            *[
                Evaluation(
                    name=f"{name}_rate",
                    value=tally["passed"] / tally["evaluated"],
                    comment=f"{tally['passed']}/{tally['evaluated']} （共 {len(items)} 个试次）",
                )
                for name, tally in summary["scores"].items()
            ],
        ]

    try:
        if not client.auth_check():
            raise RuntimeError("Langfuse project authentication failed")
        experiment = client.run_experiment(
            name="CreateForm " + metadata["suite"],
            run_name=args.name,
            data=items,
            task=task,
            evaluators=[evaluate],
            run_evaluators=[evaluate_run],
            max_concurrency=1,
            metadata=metadata,
        )
        client.flush()
        if len(experiment.item_results) != len(items) or any(
            not isinstance(item.output, dict) for item in experiment.item_results
        ):
            raise RuntimeError(
                "Langfuse experiment is missing trials; inspect its traces"
            )
        return [
            {**item.output, "trace_id": item.trace_id}
            for item in experiment.item_results
        ], experiment.experiment_url
    finally:
        client.shutdown()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument(
        "--mode", choices=["agent", "reference", "reference-broken"], default="agent"
    )
    parser.add_argument("--case", action="append")
    parser.add_argument("--compose", choices=["legacy", "staged"], default="staged")
    parser.add_argument(
        "--jobs",
        type=int,
        choices=range(1, 6),
        default=1,
        help="Run up to this many offline cases at once",
    )
    parser.add_argument("--repeat", type=int, choices=range(1, 11), default=1)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--offline", action="store_true", help="Save JSON without sending to Langfuse"
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        action="append",
        default=[],
        help="Read local Langfuse/model settings",
    )
    args = parser.parse_args()
    if args.jobs != 1 and not args.offline:
        parser.error("--jobs requires --offline")
    for env_file in args.env_file:
        for name, value in Config(env_file).file_values.items():
            os.environ.setdefault(name, value)
    if cli_dir := os.getenv("CODEX_CLI_DIR"):
        os.environ["PATH"] = os.pathsep.join((cli_dir, os.getenv("PATH", os.defpath)))
    if args.mode == "agent" and not os.getenv("CREATE_FORM_MODEL"):
        parser.error("Set CREATE_FORM_MODEL to run the Agent")
    version, cases = load_cases()
    if invalid := set(args.case or []) - cases.keys():
        parser.error("Unknown cases: " + ", ".join(sorted(invalid)))
    if args.output.exists():
        parser.error("Output file already exists; give this run a separate report")
    archive_path = args.output.with_suffix(".events.jsonl")
    if archive_path.exists():
        parser.error(
            "Raw trace archive already exists; give this run a separate report"
        )
    items = [
        {
            "input": {**cases[case_id], "trial": trial},
            "expected_output": {"runtime": cases[case_id]["assertions"]},
            "metadata": {"case_id": case_id, "group": cases[case_id]["group"]},
        }
        for case_id in dict.fromkeys(args.case or cases)
        for trial in range(1, args.repeat + 1)
    ]
    metadata = {
        "suite": version,
        "scorer": SCORER,
        "mode": args.mode,
        "compose": args.compose,
        "jobs": args.jobs,
        "environment": ENVIRONMENT,
        "model": os.getenv("CREATE_FORM_MODEL", "") if args.mode == "agent" else "",
        "dataset_digest": sha256(
            json.dumps(items, sort_keys=True).encode()
        ).hexdigest(),
        "protocol_digest": sha256(MANUAL.read_bytes()).hexdigest(),
        "git_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "revision_diff_digest": sha256(
            subprocess.check_output(["git", "diff", "HEAD"], cwd=ROOT)
        ).hexdigest(),
        "started_at": datetime.now().astimezone().isoformat(),
        "run_name": args.name,
        "raw_trace_archive": str(archive_path),
        "capture_version": "raw-events-v1",
    }
    if args.offline:

        async def run_all():
            slots = asyncio.Semaphore(args.jobs)

            async def run(item):
                async with slots:
                    return await run_item(
                        item["input"],
                        args.mode,
                        archive_path=archive_path,
                        compose=args.compose,
                    )

            return await asyncio.gather(*(run(item) for item in items))

        results, url = asyncio.run(run_all()), None
    else:
        results, url = run_langfuse(items, args, metadata, archive_path)
    save_report(args.output, metadata, results, url)
    return int(
        any(
            not result["scores"]["business_success"]
            or result["scores"].get("route_valid") is False
            for result in results
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
