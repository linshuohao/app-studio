"""Derive the reader catalog, searchable sections and typed records from Markdown."""
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
import html
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

import markdown
from markdown.extensions.toc import slugify_unicode
import nh3
import yaml

ROOT = Path(__file__).resolve().parents[2]
READING = ROOT / "docs/reading"
EXTENSIONS = ["tables", "fenced_code", "attr_list", "sane_lists", "toc"]
DOCUMENT_TYPES = {"design", "guide", "protocol", "decision", "governance", "source-map", "glossary", "history"}
DOCUMENT_STATES = {"active", "accepted", "proposed", "superseded", "deprecated", "archived"}
MODULE_STATES = {"已完成", "部分完成", "待设计", "存在阻塞", "状态未知"}
TYPE_LABELS = {"design": "现行设计", "guide": "使用指南", "protocol": "L1 协议", "decision": "架构决策",
               "governance": "设计治理", "source-map": "来源映射", "glossary": "领域术语", "history": "历史推导"}
STATE_LABELS = {"active": "现行文档", "accepted": "已确认决策", "proposed": "提议", "superseded": "已替代",
                "deprecated": "已废弃", "archived": "历史记录", "open": "待处理", "explained": "已说明差异"}
FENCE = re.compile(r"^```[^\n]*\n.*?^```[ \t]*$", re.M | re.S)
ROW_ID = re.compile(r"^(?:G\d{2}|M\d{2}|OD-\d{2}|T\d{2}|K\d{2})(?!\d)")


class UniqueLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f"Duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def load_source(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not match:
        return {}, text
    try:
        metadata = yaml.load(match[1], Loader=UniqueLoader)
    except (yaml.YAMLError, ValueError) as error:
        label = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        raise ValueError(f"{label}: invalid frontmatter: {error}") from error
    if not isinstance(metadata, dict):
        raise ValueError(f"{path}: frontmatter must be a mapping")
    return metadata, text[match.end():].lstrip("\n")


def markdown_html(text: str) -> str:
    return markdown.markdown(text, extensions=EXTENSIONS,
                             extension_configs={"toc": {"slugify": slugify_unicode}}, output_format="html5")


def sanitize(rendered: str) -> str:
    tags = set(nh3.ALLOWED_TAGS) | {"section", "article", "div", "span", "details", "summary", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6"}
    attributes = {tag: set(values) for tag, values in nh3.ALLOWED_ATTRIBUTES.items()}
    attributes["*"] = {"id", "class", "title", "aria-label", "aria-hidden", "role"}
    attributes["details"] = {"open"}
    attributes["th"] = {"colspan", "rowspan", "scope"}
    attributes["td"] = {"colspan", "rowspan"}
    # Neither event attributes nor styles, executable URLs, frames or raw scripts survive.
    return nh3.clean(rendered, tags=tags, attributes=attributes, url_schemes={"http", "https", "mailto"},
                     clean_content_tags={"script", "style", "iframe", "object", "template"},
                     link_rel="noopener noreferrer", strip_comments=True)


class TextReader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text, self.ids, self.links = [], [], []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])
        if tag in {"p", "li", "tr", "div", "pre", "br", "h1", "h2", "h3", "h4"}:
            self.text.append(" ")

    def handle_endtag(self, tag):
        if tag in {"p", "li", "td", "th", "tr", "pre", "h1", "h2", "h3", "h4"}:
            self.text.append(" ")

    def handle_data(self, data):
        self.text.append(data)


def plain(text: str) -> str:
    def diagram_words(match):
        spec = json.loads(match[1])
        words = [spec.get('title', '')] + spec.get('columns', [])
        for row in spec.get('rows', []):
            for node in row:
                words.extend([node.get('title', ''), node.get('body', ''), *node.get('items', [])])
        words.append(spec.get('note', ''))
        return '\n\n' + html.escape(' '.join(words)) + '\n\n'
    text = re.sub(r'^```diagram\n(.*?)^```', diagram_words, text, flags=re.M | re.S)
    reader = TextReader()
    reader.feed(sanitize(markdown_html(text)))
    return " ".join("".join(reader.text).split())


def sections(body: str, base_url: str) -> list[dict]:
    masked = FENCE.sub(lambda match: re.sub(r"[^\n]", " ", match[0]), body)
    headings = list(re.finditer(r"^(#{1,4}) (.+)$", masked, re.M))
    converter = markdown.Markdown(extensions=EXTENSIONS, extension_configs={"toc": {"slugify": slugify_unicode}})
    rendered = converter.convert(body)
    parsed = TextReader()
    parsed.feed(rendered)
    duplicates = [key for key, count in Counter(parsed.ids).items() if count > 1]
    if duplicates:
        raise ValueError(f"{base_url}: duplicate explicit anchors: {duplicates}")

    def flatten(tokens):
        for token in tokens:
            yield token
            yield from flatten(token["children"])

    tokens = list(flatten(converter.toc_tokens))
    if len(tokens) != len(headings):
        raise ValueError(f"{base_url}: unsupported heading structure; use ATX headings for indexed documents")
    result = []
    for index, (heading, token) in enumerate(zip(headings, tokens)):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(body)
        title = html.unescape(re.sub(r"<[^>]*>", "", token["name"]))
        anchor = token["id"]
        if "#glossary" in base_url:
            anchor = "glossary"
        url = base_url if heading[1] == "#" or "#glossary" in base_url else base_url.split("#")[0] + "#" + anchor
        result.append({"anchor": anchor, "title": title, "text": plain(body[heading.end():end]), "url": url,
                       "level": len(heading[1])})
    return result


def pipe_tables(body: str) -> list[list[list[str]]]:
    tables, current = [], []
    for line in body.splitlines() + [""]:
        if line.startswith("|") and line.endswith("|"):
            current.append([part.strip() for part in re.split(r"(?<!\\)\|", line)[1:-1]])
        elif current:
            if len(current) > 1 and not all(re.fullmatch(r":?-{3,}:?", cell) for cell in current[1]):
                raise ValueError("Invalid Markdown table separator: " + str(current[0]))
            if len(current) > 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in current[1]):
                if any(len(row) != len(current[0]) for row in current):
                    raise ValueError("Markdown table has inconsistent column count: " + str(current[0]))
                tables.append([current[0]] + current[2:])
            current = []
    return tables


def module_refs(value: str) -> list[str]:
    result = set()
    for match in re.finditer(r"\bM\d{2}(?:\s*[/–—]\s*(?:M)?\d{2})*", value):
        numbers = [int(number) for number in re.findall(r"\d{2}", match[0])]
        if re.search(r"[–—]", match[0]) and len(numbers) == 2:
            numbers = list(range(numbers[0], numbers[1] + 1))
        result.update(f"M{number:02d}" for number in numbers)
    return sorted(result)


def task_refs(value: str) -> list[str]:
    result = set(re.findall(r"\bT\d{2}\b", value))
    for start, end in re.findall(r"T(\d{2})[–—]T(\d{2})", value):
        result.update(f"T{number:02d}" for number in range(int(start), int(end) + 1))
    return sorted(result)


def governance_records(metadata: dict, body: str, url: str) -> list[dict]:
    result = []
    for table in pipe_tables(body):
        for row in table[1:]:
            first = plain(row[0])
            match = ROW_ID.match(first)
            if not match:
                continue
            key = match[0]
            kind = "module" if key.startswith("M") else "constraint" if key.startswith("G") else "open-decision" if key.startswith("OD-") else "task" if key.startswith("T") else None
            if not kind:
                continue
            fields = {plain(name): plain(cell) for name, cell in zip(table[0], row)}
            entry = {"id": key, "kind": kind, "title": first, "fields": fields, "url": url + "#" + key,
                     "fieldOrder": list(fields), "modules": module_refs(" ".join(row[1:])), "state": "open", "blocking": False}
            if kind == "module":
                state = fields.get("阅读状态")
                if state not in MODULE_STATES:
                    raise ValueError(f"{key}: invalid module maturity {state}")
                entry.update(state=state, modules=[key], layer=metadata["module_layers"][key], blocking=state == "存在阻塞")
            elif kind == "task":
                entry.update(dependencies=task_refs(row[2].split("；")[0]), priority=first.split(" / ")[1])
            elif kind == "open-decision":
                entry.update(category=first.split(" / ")[-1], blocking=first.endswith(" / A"))
            else:
                entry["state"] = "accepted"
            result.append(entry)
    for heading in re.finditer(r"^### (REV-\d{2})[：:]([^\n]+) \{#([^}]+)\}", body, re.M):
        key, title, anchor = heading.groups()
        end = re.search(r"^#{2,3} ", body[heading.end():], re.M)
        content = body[heading.end():heading.end() + end.start()] if end else body[heading.end():]
        if key not in metadata.get("reviews", {}):
            raise ValueError(f"{key}: review filtering metadata is missing")
        props = metadata["reviews"][key]
        if props.get("severity") not in {"high", "medium", "info"} or props.get("state") not in {"open", "explained"} or type(props.get("blocking")) is not bool:
            raise ValueError(f"{key}: invalid severity, state or blocking marker")
        fields = {}
        for label, value in re.findall(r"^- \*\*(.+?)\*\*(.+)$", content, re.M):
            fields[label.rstrip("：:")] = plain(value)
        result.append({"id": key, "kind": "conflict", "title": key + " · " + re.sub(r" \{#.+", "", title),
                       "url": url + "#" + anchor, "fields": fields, "fieldOrder": list(fields), "text": plain(content), **props})
    return result


def validate_graph(edges: dict[str, list[str]], label: str) -> None:
    done, stack = set(), []

    def visit(node):
        if node in stack:
            raise ValueError(f"{label} cycle: " + " → ".join(stack[stack.index(node):] + [node]))
        if node in done:
            return
        stack.append(node)
        for target in edges.get(node, []):
            if target not in edges:
                raise ValueError(f"{label}: {node} refers to missing {target}")
            visit(target)
        stack.pop()
        done.add(node)

    for node in edges:
        visit(node)


def validate_catalog(documents: list[dict], records: list[dict]) -> None:
    ids = [entry["id"] for entry in documents + records]
    duplicates = [key for key, count in Counter(ids).items() if count > 1]
    if duplicates:
        raise ValueError("Duplicate knowledge IDs: " + ", ".join(duplicates))
    registry = {entry["id"]: entry for entry in documents + records}
    for doc in documents:
        if not re.fullmatch(r"[A-Z][A-Z0-9-]+", doc["id"]):
            raise ValueError(f"{doc['source']}: invalid stable ID {doc['id']}")
        if doc.get("type") not in DOCUMENT_TYPES or doc.get("status") not in DOCUMENT_STATES:
            raise ValueError(f"{doc['source']}: invalid document type/status")
        if doc["type"] == "decision" and doc["status"] not in {"accepted", "proposed", "superseded", "deprecated"}:
            raise ValueError(f"{doc['id']}: decisions require a defined ADR status")
        for field in ("modules", "sources", "tags", "supersedes"):
            values = doc.get(field, [])
            if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
                raise ValueError(f"{doc['source']}: {field} must be a list of strings")
        targets = doc.get("sources", []) + doc.get("modules", []) + ([doc["reading_next"]] if doc.get("reading_next") else [])
        related = doc.get("related", {})
        if not isinstance(related, dict) or any(not isinstance(items, list) for items in related.values()):
            raise ValueError(f"{doc['id']}: related must map relationship names to ID lists")
        targets += [target for values in related.values() for target in values]
        for stage in doc.get("evolution", []):
            targets.append(stage["source"])
            if stage["status"] not in {"accepted", "proposed", "superseded", "deprecated"}:
                raise ValueError(f"{doc['id']}: invalid evolution status")
        for target in targets:
            if target not in registry:
                raise ValueError(f"{doc['source']}: missing related target {target}")
        for target in related.get("decisions", []):
            if registry[target].get("type") != "decision":
                raise ValueError(f"{doc['id']}: related.decisions target {target} is not an ADR")
        for target in doc.get("sources", []):
            if registry[target].get("kind") != "source":
                raise ValueError(f"{doc['id']}: sources target {target} is not a source record")
        for target in doc.get("supersedes", []):
            previous = registry.get(target)
            if not previous or previous.get("status") != "superseded" or previous.get("superseded_by") != doc["id"]:
                raise ValueError(f"{doc['id']}: inconsistent supersedes relation to {target}")
        if doc.get("superseded_by"):
            successor = registry.get(doc["superseded_by"])
            if doc["status"] != "superseded" or not successor or doc["id"] not in successor.get("supersedes", []):
                raise ValueError(f"{doc['id']}: inconsistent superseded_by relation")
    for record in records:
        for module in record.get("modules", []):
            if module not in registry or registry[module].get("kind") != "module":
                raise ValueError(f"{record['id']}: unknown module {module}")
    validate_graph({entry["id"]: entry.get("dependencies", []) for entry in records if entry["kind"] == "task"}, "Roadmap prerequisite")
    decisions = {doc["id"]: doc.get("supersedes", []) for doc in documents if doc["type"] == "decision"}
    validate_graph(decisions, "Decision replacement")
    # related / outgoing / backlink cycles are normal reading relationships, never architecture errors.


def relocated_sections() -> list[dict]:
    """Read explicit content moves from Markdown; never infer a superseding decision."""
    result = []
    for destination in sorted((ROOT / "docs/design").rglob("*.md")):
        metadata, body = load_source(destination)
        for entry in metadata.get("relocated_sections", []):
            anchor = entry.get("target", entry["anchor"])
            match = re.search(r"^## .+? \{#" + re.escape(anchor) + r"\}\n", body, re.M)
            if not match:
                raise ValueError(f"{destination}: relocated section missing {anchor}")
            end = re.search(r"^## ", body[match.end():], re.M)
            chunk = body[match.start():match.end() + end.start()] if end else body[match.start():]
            aliases = set(re.findall(r"\{#([^}]+)\}", chunk))
            aliases.update(json.loads(block)["id"] for block in re.findall(r"^```diagram\n(.*?)^```", chunk, re.M | re.S))
            for alias in sorted(aliases):
                result.append({"source": entry["source"], "anchor": entry["anchor"] if alias == anchor else alias,
                               "destination": destination.relative_to(ROOT).as_posix(), "target": alias})
    keys = [(entry["source"], entry["anchor"]) for entry in result]
    if len(set(keys)) != len(keys):
        raise ValueError("Duplicate relocation declarations")
    return result


def build_catalog(outputs: dict[Path, Path]) -> dict:
    documents, records, lookup = [], [], {}
    for source in sorted(outputs):
        metadata, body = load_source(source)
        if not metadata:
            continue
        for key in ("id", "title", "type", "status", "layer"):
            if not isinstance(metadata.get(key), str) or not metadata[key]:
                raise ValueError(f"{source.relative_to(ROOT)}: missing/invalid {key}")
        heading = re.search(r"^# (.+)$", body, re.M)
        if not heading or heading[1] != metadata["title"]:
            raise ValueError(f"{source.relative_to(ROOT)}: title metadata must match the Markdown H1")
        url = outputs[source].relative_to(READING).as_posix() if outputs[source].is_relative_to(READING) else "../" + outputs[source].relative_to(READING.parent).as_posix()
        if source == ROOT / "docs/CONTEXT.md":
            url += "#glossary"
        elif source.parent.name == "l1" and source.name != "README.md":
            url += "#" + re.search(r"^## .+? \{#([^}]+)\}", body, re.M)[1]
        indexed = sections(body, url)
        summary = next((part["text"] for part in indexed if part["text"]), "")
        doc = {**metadata, "source": source.relative_to(ROOT).as_posix(), "url": url,
               "summary": summary[:240], "sections": indexed, "outgoing": []}
        documents.append(doc)
        lookup[source.resolve()] = doc
        if metadata["type"] == "governance":
            records += governance_records(metadata, body, url)
        elif metadata["type"] == "source-map":
            for match in re.finditer(r"^### (SRC-[A-Z0-9]+)[：:]([^\n]+) \{#([^}]+)\}", body, re.M):
                records.append({"id": match[1], "kind": "source", "title": match[1] + " · " + match[2],
                                "url": url + "#" + match[3], "modules": [], "state": "archived"})
    for source, doc in lookup.items():
        _, body = load_source(source)
        parsed = TextReader()
        parsed.feed(sanitize(markdown_html(body)))
        for href in parsed.links:
            target = urlsplit(href)
            if target.scheme or target.netloc or not target.path:
                continue
            other = lookup.get((source.parent / unquote(target.path)).resolve())
            if other and other["id"] != doc["id"]:
                doc["outgoing"].append(other["id"])
        doc["outgoing"] = sorted(set(doc["outgoing"]))
    validate_catalog(documents, records)
    redirects = []
    for move in relocated_sections():
        source, destination = ROOT / move["source"], ROOT / move["destination"]
        redirects.append({"from": outputs[source].relative_to(READING).as_posix() + "#" + move["anchor"],
                          "url": outputs[destination].relative_to(READING).as_posix() + "#" + move["target"]})
        if source.parent.name == 'l1':
            redirects.append({"from": "l1-definition-protocol-v1.html#" + move["anchor"],
                              "url": outputs[destination].relative_to(READING).as_posix() + "#" + move["target"]})
    # The old combined L1 URL remains only as a bookmark router.
    for doc in documents:
        if doc["type"] == "protocol":
            for section in doc["sections"]:
                if section["level"] > 1:
                    redirects.append({"from": "l1-definition-protocol-v1.html#" + section["anchor"], "url": section["url"]})
            if doc['id'] != 'PROTOCOL-L1':
                alias = 'part-' + Path(doc['source']).stem[3:]
                for anchor in (alias, alias + '-title'):
                    redirects.append({'from': 'l1-definition-protocol-v1.html#' + anchor, 'url': doc['url']})
    return {"version": 1, "typeLabels": TYPE_LABELS, "stateLabels": STATE_LABELS,
            "documents": documents, "records": records,
            "redirects": redirects,
            "searchScope": "现行 Markdown、L1、ADR、治理、术语和历史推导索引；原始 ZIP / 历史 HTML 不参与全文搜索。"}


def index_outputs(catalog: dict) -> dict[Path, str]:
    data = json.dumps(catalog, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    # A classic local script works under file://; no fetch, CDN or dynamic module imports are needed.
    safe = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return {READING / "assets/knowledge-index.json": data + "\n",
            READING / "assets/knowledge-index.js": "// Generated from Markdown. Do not edit.\nwindow.FORM_KNOWLEDGE = " + safe + ";\n"}
