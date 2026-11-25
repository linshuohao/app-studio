"""Inventory architecture sources and verify preservation; never execute archived code."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
SOURCE_MAP = DOCS / "design/source-map.md"
INVENTORY = DOCS / "architecture-source-inventory.json"
BASELINE = DOCS / "history/2026-10-19-architecture-review-sources.zip"
BASELINE_DIGEST = "33ef0fe7198c96f40d5b6b3cd75e62acd9e23685df9a47594fc92b32207cebe5"
ARCHIVE_TOPICS = {
    "2026-10-17-decision-sources.zip": "src-l2",
    "2026-10-17-dependency-reactivity-sources.zip": "src-dependency",
    "2026-10-18-l3-flush-sources.zip": "src-v04",
    "2026-10-19-protocol-runtime-v05-sources.zip": "src-v05",
    "2026-10-19-data-scope-v06-sources.zip": "src-v06",
    "2026-10-19-runtime-host-boundary-sources.zip": "src-host",
    "2026-10-19-validation-v07-sources.zip": "src-v07",
    "l1-protocol-validation-source.zip": "src-validation",
    "2026-10-19-architecture-review-sources.zip": "src-review",
    "2026-10-19-reader-system-sources.zip": "src-reader",
    "2026-10-19-designer-reading-sources.zip": "src-reading-path",
}
CURRENT_TOPICS = {
    "architecture.md": "SRC-EARLY / K01 / K29–K30",
    "engineering.md": "SRC-ENGINEERING / 已确认工具链与初始化流程，尚未工程验收",
    "workflows.md": "SRC-WORKFLOWS / 五类研发工作流与项目 skill，真实任务效果待验证",
    "usage-guide.md": "SRC-L1 / SRC-V05 / SRC-HOST / SRC-V07",
    "l2-preparation.md": "SRC-L2 / K06 / K10–K13 / K29–K30",
    "l2/compiler.md": "SRC-COMPILERDESIGN / Compiler 本期详细设计确认与实施授权；平台报告后置",
    "dependency-reactivity.md": "SRC-DEP / SRC-V05 / K10–K13",
    "l3-reactive-engine.md": "SRC-V04 / SRC-V05 / SRC-V06 / SRC-HOST / K14–K24",
    "l3-validation.md": "SRC-V07 / K25–K28",
    "l1/README.md": "SRC-L1 / 阅读分组",
    "l1/01-foundation.md": "SRC-L1 / K01 / K10–K11",
    "l1/02-data-reference-scope.md": "SRC-L1 / K03–K04 / K17–K22",
    "l1/03-expression-validation.md": "SRC-L1 / K05–K06 / K12 / K25–K28",
    "l1/04-command-reaction.md": "SRC-L1 / K14–K16 / K20 / K23",
    "l1/05-view-material-host.md": "SRC-L1 / K07–K09 / K13",
    "l1/06-lifecycle-profiles.md": "SRC-L1 / SRC-HOST / K20–K22 / K28",
    "l1/07-examples.md": "SRC-L1 / SRC-VAL / K31",
    "l1/08-decisions-release.md": "SRC-L1 / 追溯附录 / K01–K30",
    "governance.md": "GOV-FE-001 / 审查建议，非新增已确认决策",
    "capability-map.md": "MAP-CAPABILITIES / 已有纵向职责与横向契约的阅读关系",
    "l4-renderer.md": "DESIGN-L4 / 迁移原 Renderer 边界，完整模块设计待讨论",
    "extension-integration.md": "DESIGN-INTEGRATION / 迁移原 Material / Host 完整说明",
    "platform-studio.md": "DESIGN-PLATFORM-STUDIO / 既有工具方向与未设计范围，非新系统方案",
    "platform-agent-compose.md": "DESIGN-PLATFORM-AGENT-COMPOSE / Compose 实施草案，Schema 定版与模块检查待评审",
    "design-history.md": "HISTORY-DESIGN / 从正文迁移的决策推导与来源总账",
    "design-review.md": "REVIEW-FE-001 / 迁移的约束与冲突证据",
    "l3-data-scope.md": "DESIGN-L3-DATA / 逐 Command 数据、快照、Scope 与完整行为验收迁移",
    "l3-observability.md": "DESIGN-L3-DIAGNOSTICS / 运行事实、Trace 与开发工具说明迁移",
}
FENCE = re.compile(r"^```[^\n]*\n.*?^```[ \t]*$", re.MULTILINE | re.DOTALL)
EXPLICIT_H2 = re.compile(r"^## .+? \{#([^}]+)\}", re.MULTILINE)
DIAGRAM = re.compile(r'^```diagram\n(.*?)^```', re.MULTILINE | re.DOTALL)
SUMMARY = re.compile(r"<!-- BEGIN SOURCE INVENTORY SUMMARY -->.*?<!-- END SOURCE INVENTORY SUMMARY -->", re.DOTALL)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class HeadingReader(HTMLParser):
    """Read static headings with their actual heading or enclosing section anchor."""

    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, str]] = []
        self.heading: dict | None = None
        self.sections: list[dict] = []
        self.ignore = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag in {"script", "style", "nav"}:
            self.ignore += 1
        if tag in {"section", "article", "main"}:
            self.stack.append((tag, values.get("id") or ""))
        if self.ignore or tag not in {"h1", "h2", "h3", "h4"}:
            return
        anchor = values.get("id") or next((anchor for _, anchor in reversed(self.stack) if anchor), None)
        self.heading = {"level": int(tag[1]), "title": "", "anchor": anchor}

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "nav"}:
            self.ignore = max(0, self.ignore - 1)
        if tag in {"h1", "h2", "h3", "h4"} and self.heading is not None:
            self.heading["title"] = " ".join(self.heading["title"].split())
            self.sections.append(self.heading)
            self.heading = None
        if tag in {"section", "article", "main"}:
            for index in range(len(self.stack) - 1, -1, -1):
                if self.stack[index][0] == tag:
                    del self.stack[index:]
                    break

    def handle_data(self, data: str) -> None:
        if self.heading is not None and not self.ignore:
            self.heading["title"] += data


def headings(name: str, data: bytes) -> list[dict]:
    if name.endswith(".md"):
        text = re.sub(r"^```[^\n]*\n.*?^```[ \t]*$", "", data.decode("utf-8-sig"), flags=re.MULTILINE | re.DOTALL)
        result = []
        for match in re.finditer(r"^(#{1,4}) (.+)$", text, re.MULTILINE):
            title = match[2]
            anchor = re.search(r" \{#([^}]+)\}$", title)
            result.append({"level": len(match[1]), "title": title[:anchor.start()] if anchor else title,
                           "anchor": anchor[1] if anchor else None})
        return result
    if name.endswith(".html"):
        parser = HeadingReader()
        parser.feed(data.decode("utf-8-sig"))
        return parser.sections
    return []


def record(path: str, data: bytes, role: str, mapping: str, **extra: str) -> dict:
    return {"path": path, "role": role, "coverage": "indexed-preserved" if role.startswith("history") else "indexed",
            "bytes": len(data), "sha256": sha256(data), "mapping": mapping,
            "sections": headings(path, data), **extra}


def check_preservation() -> dict:
    from knowledge import relocated_sections
    moves = relocated_sections()
    if sha256(BASELINE.read_bytes()) != BASELINE_DIGEST:
        raise ValueError("The immutable pre-review source snapshot changed")
    checks = []
    with ZipFile(BASELINE) as archive:
        for member in sorted(archive.namelist()):
            relative = member.removeprefix("before-architecture-review/")
            if not relative.startswith("docs/design/") or not relative.endswith(".md"):
                continue
            before = archive.read(member).decode("utf-8")
            after = (ROOT / relative).read_text(encoding="utf-8")
            destinations = sorted({entry["destination"] for entry in moves if entry["source"] == relative})
            # Content can move to its owning theme. Its exact examples and
            # diagrams still have to exist in the declared destination.
            after += "\n" + "\n".join((ROOT / path).read_text(encoding="utf-8") for path in destinations)
            anchors = set(EXPLICIT_H2.findall(before))
            missing = anchors - set(EXPLICIT_H2.findall(after))
            lost_blocks = Counter(FENCE.findall(before)) - Counter(FENCE.findall(after))
            old_figures = {json.loads(block)["id"] for block in DIAGRAM.findall(before)}
            new_figures = {json.loads(block)["id"] for block in DIAGRAM.findall(after)}
            if missing or lost_blocks or old_figures - new_figures:
                raise ValueError(f"Unaccounted source loss in {relative}: anchors={sorted(missing)}, "
                                 f"code_blocks={sum(lost_blocks.values())}, diagrams={sorted(old_figures - new_figures)}")
            checks.append({"path": relative, "preserved_h2_anchors": len(anchors),
                           "preserved_fenced_blocks": sum(Counter(FENCE.findall(before)).values()),
                           "preserved_diagram_ids": sorted(old_figures), "relocated_to": destinations})
    return {"baseline": BASELINE.relative_to(ROOT).as_posix(), "baseline_sha256": BASELINE_DIGEST,
            "method": "Original technical H2 anchors, exact fenced blocks and diagram IDs remain in their source or Markdown-declared relocation targets; prose meaning is reviewed manually.",
            "files": checks}


def inventory() -> dict:
    entries = []
    # Readable historical copies are known by their preserved pre-terminology sources.
    with ZipFile(DOCS / "history/2026-10-17-decision-sources.zip") as source_archive:
        known_history = {
            member.removeprefix("before-pure-function-terminology/").replace("expression-operator-constraint", "expression-pure-function-constraint")
            for member in source_archive.namelist() if member.startswith("before-pure-function-terminology/") and not member.endswith("/")
        } | {"README.md"}
    current = [ROOT / "README.md", DOCS / "README.md", DOCS / "CONTEXT.md"]
    current += sorted(path for path in (DOCS / "design").rglob("*.md") if path != SOURCE_MAP)
    for path in current:
        relative = path.relative_to(ROOT).as_posix()
        if path.is_relative_to(DOCS / "design"):
            name = path.relative_to(DOCS / "design").as_posix()
            if name.startswith("decisions/ADR-FE-"):
                mapping = "重要取舍的来源提取；完整规则仍在所属主题"
            elif name in CURRENT_TOPICS:
                mapping = CURRENT_TOPICS[name]
            else:
                raise ValueError(f"Classify new current document before marking coverage: {relative}")
        else:
            mapping = "维护 / 领域词汇入口；非独立技术规范"
        entries.append(record(relative, path.read_bytes(), "current-markdown", mapping))
    for path in sorted((DOCS / "history").rglob("*")):
        if not path.is_file() or path.suffix not in {".md", ".html", ".zip"}:
            continue
        if path == DOCS / "history/index.html":
            continue  # This generated entry is checked as a reading page, not an original.
        relative = path.relative_to(ROOT).as_posix()
        if path.suffix != ".zip":
            if path.relative_to(DOCS / "history").as_posix() not in known_history:
                raise ValueError(f"Register a source mapping for the new historical document: {relative}")
            topic = "src-early" if "2026-10-14/" in relative or path.name == "complex-dynamic-form-architecture-v1.html" else "src-l1"
            if path == DOCS / "history/README.md":
                topic = "source-register"
            entries.append(record(relative, path.read_bytes(), "history-readable-copy", f"source-map.md#{topic}"))
            continue
        if path.name not in ARCHIVE_TOPICS:
            raise ValueError(f"Register new source package and review its semantic impact first: {relative}")
        topic = ARCHIVE_TOPICS[path.name]
        entries.append(record(relative, path.read_bytes(), "history-archive", f"source-map.md#{topic}"))
        with ZipFile(path) as archive:
            if len(archive.namelist()) != len(set(archive.namelist())):
                raise ValueError(f"Duplicate archive member names: {relative}")
            for member in sorted(archive.namelist()):
                if member.endswith("/"):
                    continue
                member_topic = topic
                if path.name == "2026-10-17-decision-sources.zip" and member.startswith("before-"):
                    member_topic = "src-early" if "/2026-10-14/" in member else "src-l1"
                role = "history-integration-snapshot" if member.startswith("before-") else "history-original-member"
                entries.append(record(relative + "::" + member, archive.read(member), role,
                                      f"source-map.md#{member_topic}"))
    for path in sorted((DOCS / "validation").rglob("*")):
        if path.is_file() and path.suffix in {".md", ".py", ".json", ".txt"}:
            entries.append(record(path.relative_to(ROOT).as_posix(), path.read_bytes(), "candidate-validation-evidence",
                                  "source-map.md#src-validation; not production runtime verification"))
    tooling = sorted((ROOT / "tools/docs").glob("*.py")) + [ROOT / "tools/docs/test_search.cjs", ROOT / "tools/docs/requirements.txt", ROOT / "tools/docs/templates/document.html", DOCS / "reading/assets/documentation.css", DOCS / "reading/assets/documentation.js"]
    for path in tooling:
        entries.append(record(path.relative_to(ROOT).as_posix(), path.read_bytes(), "documentation-tooling", "文档生成 / 盘点；非引擎实现"))
    counts = Counter(entry["role"] for entry in entries)
    digests = Counter(entry["sha256"] for entry in entries)
    preservation = check_preservation()
    return {"id": "SRC-FE-INVENTORY-001", "reviewed_date": "2026-10-19",
            "scope": "Local current Markdown, all local historical Markdown/HTML/ZIP members, candidate validation evidence and documentation tooling.",
            "limitations": ["Inventory coverage is not sentence-by-sentence semantic verification of every repeated snapshot.",
                            "The complete original conversation is unavailable; the Runtime/Host record is an explicitly labeled excerpt.",
                            "source-map.md is excluded from its own hash inventory to avoid a circular checksum.",
                            "Generated reading pages, caches and production engine behavior are outside this source inventory."],
            "counts": dict(sorted(counts.items())), "total_entries": len(entries), "unique_byte_contents": len(digests),
            "repeated_byte_entries": sum(count - 1 for count in digests.values()),
            "preservation": preservation, "entries": entries}


def summary(result: dict) -> str:
    files = result["preservation"]["files"]
    anchors = sum(entry["preserved_h2_anchors"] for entry in files)
    blocks = sum(entry["preserved_fenced_blocks"] for entry in files)
    figures = sum(len(entry["preserved_diagram_ids"]) for entry in files)
    lines = ["<!-- BEGIN SOURCE INVENTORY SUMMARY -->", "", "以下数字由脚本生成，仅表达文件身份和内容保留检查：", "",
             "| 盘点类别 | 条目数 |", "| --- | --- |"]
    lines += [f"| `{role}` | {count} |" for role, count in result["counts"].items()]
    lines += [f"| 合计（ZIP 容器与成员分别计数） | {result['total_entries']} |", "",
              f"原有 {len(files)} 份设计 Markdown 的 {anchors} 个二级章节锚点、{blocks} 个代码块及 {figures} 个架构图 ID 全部保留。",
              f"清单有 {result['unique_byte_contents']} 组不同字节内容，{result['repeated_byte_entries']} 个重复字节条目；去重只用于盘点，不删除来源。", "",
              "<!-- END SOURCE INVENTORY SUMMARY -->"]
    return "\n".join(lines)


class LinkReader(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        for key in ("href", "src"):
            if values.get(key):
                self.links.append(values[key])


def check_reading_links() -> tuple[int, int]:
    paths = sorted((DOCS / "reading").rglob("*.html")) + [DOCS / "validation/index.html", DOCS / "history/index.html"]
    cache: dict[Path, LinkReader] = {}
    errors, count = [], 0

    def read(path: Path) -> LinkReader:
        if path not in cache:
            parsed = LinkReader()
            parsed.feed(path.read_text(encoding="utf-8"))
            cache[path] = parsed
        return cache[path]

    for path in paths:
        parsed = read(path)
        duplicates = [anchor for anchor, amount in Counter(parsed.ids).items() if amount > 1]
        if duplicates:
            errors.append(f"{path.relative_to(ROOT)}: duplicate IDs {duplicates}")
        for link in parsed.links:
            target = urlsplit(link)
            if target.scheme or target.netloc:
                continue
            count += 1
            destination = (path.parent / unquote(target.path)).resolve() if target.path else path
            if not destination.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing file {link}")
            elif destination.suffix == ".html" and target.fragment and unquote(target.fragment) not in read(destination).ids:
                errors.append(f"{path.relative_to(ROOT)}: missing anchor {link}")
    index_path = DOCS / "reading/assets/knowledge-index.json"
    if index_path.exists():
        catalog = json.loads(index_path.read_text(encoding="utf-8"))
        for entry in catalog["documents"] + catalog["records"]:
            for link in [entry["url"]] + [section["url"] for section in entry.get("sections", [])]:
                target = urlsplit(link)
                destination = (DOCS / "reading" / unquote(target.path)).resolve()
                count += 1
                if not destination.exists():
                    errors.append(f"Knowledge index {entry['id']}: missing file {link}")
                elif target.fragment and unquote(target.fragment) not in read(destination).ids:
                    errors.append(f"Knowledge index {entry['id']}: missing anchor {link}")
        for redirect in catalog.get('redirects', []):
            for link in (redirect['from'], redirect['url']):
                target = urlsplit(link)
                destination = (DOCS / 'reading' / unquote(target.path)).resolve()
                count += 1
                if not destination.exists() or (target.fragment and unquote(target.fragment) not in read(destination).ids):
                    errors.append(f"Relocated bookmark: missing target {link}")
    if errors:
        raise ValueError("Reading link audit failed:\n" + "\n".join(errors))
    return len(paths), count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if sources changed since the recorded inventory")
    args = parser.parse_args()
    try:
        result = inventory()
        content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            if not INVENTORY.exists() or INVENTORY.read_text(encoding="utf-8") != content:
                parser.exit(1, "Architecture inventory is stale. Review changed sources, then run tools/docs/audit_architecture.py.\n")
            page_count, link_count = check_reading_links()
            print(f"Checked {page_count} reading HTML files and {link_count} local links/resources; no duplicate IDs.")
        else:
            INVENTORY.write_text(content, encoding="utf-8")
        print(f"{'Checked' if args.check else 'Recorded'} {result['total_entries']} source entries; original technical anchors, code and diagrams preserved.")
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
