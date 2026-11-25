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


MessageReference = FormReference | AssetReference
