"""The service boundary carries user input, public conversation and a delivery."""

import json
import re
from hashlib import sha256
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, Field, ValidationError

from form_agent.business.conversations.references import (
    DiagnosticReference,
    MessageReference,
)
from form_agent.business.form_authoring.contracts import (
    AssetRepairReview,
    DiagnosticRepairReview,
)


class Owner(BaseModel, frozen=True):
    user: str
    space: str


class Context(BaseModel, extra="forbid"):
    target: str = Field(min_length=1)
    knowledge_version: str = Field(min_length=1)
    check_environment: str = Field(min_length=1)
    formId: str | None = None
    workId: str | None = None


class Message(BaseModel, extra="forbid"):
    turnId: UUID
    revision: int = Field(ge=0)
    message: str = Field(min_length=1)
    context: Context
    references: list[MessageReference] = Field(default_factory=list, max_length=5)
    document: str | None = None
    requestFingerprint: str | None = None
    workingText: str | None = None
    readOnly: bool = False
    draftId: UUID | None = None
    draftRevision: int | None = Field(default=None, ge=0)


def fingerprint(data) -> str:
    text = json.dumps(
        data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return sha256(text.encode()).hexdigest()


def stable_id(kind: str, conversation: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"form-agent/{kind}/{conversation}/{key}"))


UNMAPPED_DEFERRALS = re.compile(
    r"Unmapped deferrals: (R[1-9][0-9]*(?:, R[1-9][0-9]*)*)\."
)


def has_unmapped_deferrals(result: dict):
    return any(
        UNMAPPED_DEFERRALS.search(issue["message"])
        for issue in (result.get("draftIssues") or [])
    )


def explain_draft_issues(result: dict, trace: dict | None):
    if not trace or not has_unmapped_deferrals(result):
        return result
    requirements = {
        item["id"]: item
        for item in (trace.get("standard") or {}).get("requirements", [])
    }
    rows = []
    for issue in result["draftIssues"]:
        match = UNMAPPED_DEFERRALS.search(issue["message"])
        if not match:
            rows.append(issue)
            continue
        remaining = (
            issue["message"][: match.start()] + issue["message"][match.end() :]
        ).strip()
        if (
            remaining
            and remaining.split("未完整纳入草稿。", 1)[-1]
            != "片段未通过写入范围或需求映射检查。"
        ):
            rows.append({**issue, "message": remaining})
        for requirement_id in sorted(
            set(match[1].split(", ")), key=lambda key: int(key[1:])
        ):
            requirement = requirements.get(requirement_id)
            if requirement is None:
                message = "延期说明没有对应本轮的需求编号。"
            elif requirement["kind"] == "host":
                message = (
                    f"{requirement['subject']}。{requirement['behavior']} "
                    "本轮未接受该项 Host 待接入声明。"
                )
            else:
                message = (
                    f"{requirement['subject']}。{requirement['behavior']} "
                    "该项延期说明缺少对应的本地配置。"
                )
            rows.append(
                {
                    "sourcePointer": issue["sourcePointer"],
                    "requirementIds": [requirement_id],
                    "message": message,
                }
            )
    return {
        **result,
        **(
            {
                "reason": UNMAPPED_DEFERRALS.sub(
                    "部分需求的延期说明未通过检查，具体问题见下方。", result["reason"]
                )
            }
            if UNMAPPED_DEFERRALS.search(result.get("reason") or "")
            else {}
        ),
        "draftIssues": rows,
    }


def diagnostic_actions(result: dict, references) -> dict:
    if result.get("kind") != "answer" or not isinstance(references, list):
        return {}
    if (
        result.get("diagnosticRepair") is not None
        and result.get("assetRepair") is not None
    ):
        return {}
    reference = next(
        (
            item
            for item in references
            if (
                isinstance(item, DiagnosticReference)
                or isinstance(item, dict)
                and item.get("kind") == "diagnostic"
            )
        ),
        None,
    )
    if reference is None:
        return {}
    try:
        reference = DiagnosticReference.model_validate(reference)
        if result.get("diagnosticRepair") is not None:
            action = DiagnosticRepairReview.model_validate(result["diagnosticRepair"])
            if all(
                getattr(reference, key) == getattr(action, key)
                for key in ("diagnosticId", "formId", "releaseId", "versionId")
            ) and re.fullmatch(r"[a-f0-9]{64}", action.candidateDigest):
                return {"diagnosticRepair": action.model_dump()}
        elif result.get("assetRepair") is not None:
            asset = AssetRepairReview.model_validate(result["assetRepair"])
            if (
                asset.diagnosticId == reference.diagnosticId
                and asset.candidates
                and asset.candidates == reference.assetCandidates
            ):
                return {"assetRepair": asset.model_dump()}
    except ValidationError:
        pass
    return {}


def public_result(result: dict, references=None) -> dict:
    public = {
        k: result[k]
        for k in ("kind", "message", "summary", "reason", "questions")
        if k in result
    }
    public.update(diagnostic_actions(result, references))
    if "issues" in result:
        public["issues"] = [
            {
                k: i[k]
                for k in (
                    "category",
                    "status",
                    "title",
                    "finding",
                    "action",
                    "claims",
                    "question",
                    "requirement_ids",
                )
                if k in i
            }
            for i in result["issues"]
        ]
    if partial := result.get("partial_draft"):
        public["draftIssues"] = partial["issues"]
    if "verification" in result:
        public["verification"] = {
            k: result["verification"][k]
            for k in ("compilation", "checkCode", "candidateDigest")
            if k in result["verification"]
        }
    if result["kind"] == "proposal" and (guide := result.get("guide")) is not None:
        check = result["check"]
        public["candidateGuide"] = {
            **guide,
            "candidateDigest": check["candidate_digest"],
            "hostRequirements": check["host_requirements"],
        }
    return explain_draft_issues(public, result.get("requirements_trace"))


def make_delivery(
    cid: str,
    turn_id: str,
    revision: int,
    result: dict,
    draft_id: str,
    base: str | None,
    base_revision: int | None,
    form: str | None,
    work: str | None,
    environment: str | None = None,
):
    partial = result.get("partial_draft")
    check = result.get("check") or {}
    issues = (
        explain_draft_issues(
            {"draftIssues": partial["issues"]}, result.get("requirements_trace")
        )["draftIssues"]
        if partial
        else None
    )
    text = partial["candidate_text"] if partial else result["candidate_text"]
    return {
        k: v
        for k, v in {
            "target": "editor" if form else "draft",
            "formId": form,
            "workId": work,
            "id": stable_id("delivery", cid, turn_id),
            "draftId": draft_id,
            "turnId": turn_id,
            "sourceRevision": revision,
            "candidateText": text,
            "digest": "sha256:" + sha256(text.encode("utf-8")).hexdigest()
            if partial
            else check["candidate_digest"],
            "draftIssues": issues,
            "checkId": check.get("check_id"),
            "checkEnvironment": environment
            if partial
            else check.get("check_environment"),
            "baseRevision": base_revision,
            "candidateBaseText": base,
        }.items()
        if v is not None
    }
