from typing import Literal

from pydantic import BaseModel


class MessageReferenceContent(BaseModel, extra="forbid"):
    name: str
    text: str

    def public(self):
        return self.model_dump(exclude={"text"}, exclude_none=True)


class FormReference(MessageReferenceContent):
    formId: str
    versionId: str
    versionName: str | None = None
    savedAt: str
    pointer: str | None = None
    objectLabel: str | None = None


class AssetReference(MessageReferenceContent):
    kind: Literal["function", "material"]
    assetId: str
    assetVersion: str
    artifactDigest: str


class DiagnosticArtifact(BaseModel, extra="forbid"):
    id: str
    platform: str
    digest: str


class DiagnosticAssetLock(BaseModel, extra="forbid"):
    id: str
    version: str
    manifestDigest: str
    artifact: DiagnosticArtifact


class DiagnosticAssetCandidate(BaseModel, extra="forbid"):
    kind: Literal["material", "function"]
    lock: DiagnosticAssetLock


class DiagnosticReference(BaseModel, extra="forbid"):
    kind: Literal["diagnostic"]
    diagnosticId: str
    formId: str
    versionId: str
    releaseId: str
    name: str
    errorCode: str
    phase: str
    targetId: str | None = None
    assetCandidates: list[DiagnosticAssetCandidate] | None = None
    evidenceStatus: Literal[
        "captured", "missing", "expired", "too_large", "serialization_failed"
    ]

    def public(self):
        return self.model_dump(exclude_none=True)


MessageReference = FormReference | AssetReference | DiagnosticReference
