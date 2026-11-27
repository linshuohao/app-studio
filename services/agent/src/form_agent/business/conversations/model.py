"""The service boundary carries user input, public conversation and a delivery."""

import json
from hashlib import sha256
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, Field

from form_agent.business.conversations.references import MessageReference


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


def public_result(result: dict) -> dict:
    public = {
        k: result[k]
        for k in ("kind", "message", "summary", "reason", "questions")
        if k in result
    }
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
    return public


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
            "draftIssues": partial["issues"] if partial else None,
            "checkId": check.get("check_id"),
            "checkEnvironment": environment
            if partial
            else check.get("check_environment"),
            "baseRevision": base_revision,
            "candidateBaseText": base,
        }.items()
        if v is not None
    }
