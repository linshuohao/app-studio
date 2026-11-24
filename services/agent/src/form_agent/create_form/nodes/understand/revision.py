"""Resolve an explicit, single-control placeholder edit against a checked candidate."""

import json
import re

from form_agent.create_form.state import PlaceholderEdit
from form_agent.integrations.compiler import candidate_digest

_COPY = re.compile(
    r"(?:请)?(?:只|仅)?(?:把|将)?(?P<label>[\w\- ]{1,60}?)(?P<control>搜索框|输入框)"
    r"\s*(?:的)?\s*(?:提示文字|提示文案|占位文字|placeholder)\s*(?:改为|改成|修改为|设为)\s*"
    r"(?:「(?P<a>[^「」]+)」|“(?P<b>[^“”]+)”|\"(?P<c>[^\"\n]+)\")[。！]?"
)




def identify_placeholder_edit(request):
    evidence = request.previous_review
    text = request.referenced_candidate
    doc = request.requirements_document
    if not evidence or not text or not doc or not evidence.check.success:
        return None
    if candidate_digest(text) != evidence.check.candidate_digest or (
        doc.document_id,
        doc.version,
    ) != (evidence.trace.document_id, evidence.trace.document_version):
        return None
    saved = evidence.binding_evidence
    if saved and (
        saved.target != request.context.get("target")
        or saved.knowledge_version != request.context.get("knowledge_version")
    ):
        return None
    match = _COPY.fullmatch(request.message.strip())
    if not match:
        return None
    label = match["label"].strip()
    materials = {"remote-select"} if match["control"] == "搜索框" else {"text-input"}
    form = json.loads(text)
    found = []

    def visit(node, path, owner=""):
        if not isinstance(node, dict):
            return
        props = node.get("props", {})
        if node.get("material") == "field":
            owner = props.get("label", "")
        if node.get("material") in materials and label in (owner, props.get("label")):
            found.append(path)
        for index, child in enumerate(node.get("children", [])):
            visit(child, (*path, "children", index), owner)
        for slot, children in node.get("slots", {}).items():
            for index, child in enumerate(children):
                visit(child, (*path, "slots", slot, index), owner)
        if "node" in node:
            visit(node["node"], (*path, "node"), owner)

    for profile, root in form["views"].items():
        visit(root, ("views", profile))
    if len(found) != 1:
        return None
    return PlaceholderEdit(found[0], match["a"] or match["b"] or match["c"])
