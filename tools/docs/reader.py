"""Shared reading shell; independent of Markdown and validation dependencies."""
from __future__ import annotations

import html
import hashlib
import json
import os
from pathlib import Path
from string import Template
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs/reading/assets"
READING_HOME = ASSETS.parent / "handbook/index.html"
NAVIGATION = [
    ("Assemble Studio 项目手册", READING_HOME.relative_to(ROOT).as_posix()),
    ("使用与开发指南", "docs/reading/usage-guide.html"),
    ("设计者指南 · 整体架构", "docs/reading/architecture.html"),
    ("L1 定义协议", "docs/reading/l1-definition-protocol-v1.html"),
    ("L2 编译与发布", "docs/reading/l2-preparation.html"),
    ("依赖与订阅", "docs/reading/dependency-reactivity.html"),
    ("L3 执行与诊断", "docs/reading/l3-reactive-engine.html"),
    ("L3 校验与结果", "docs/reading/l3-validation.html"),
    ("协议样例", "docs/validation/index.html"),
    ("架构治理与设计路线", "docs/reading/governance.html"),
    ("来源映射与覆盖", "docs/reading/source-map.html"),
]
_CATALOG = None


def set_catalog(catalog: dict) -> None:
    global _CATALOG
    _CATALOG = catalog


def get_catalog() -> dict:
    global _CATALOG
    if _CATALOG is None:
        path = ASSETS / "knowledge-index.json"
        _CATALOG = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"documents": [], "records": []}
    return _CATALOG


def catalog_link(entry: dict, output: Path, label: str | None = None) -> str:
    path, _, fragment = entry["url"].partition("#")
    href = relative((ROOT / "docs/reading" / path).resolve(), output) + ("#" + fragment if fragment else "")
    return '<a href="' + html.escape(href, quote=True) + '">' + html.escape(label or entry["title"]) + '</a>'


def knowledge_navigation(output: Path, catalog: dict, current_id: str | None = None) -> str:
    groups = {}
    for entry in sorted(catalog["documents"], key=lambda item: item.get("navigation", {}).get("order", 999)):
        group = entry.get("navigation", {}).get("group", "09 · 决策与追溯")
        link = catalog_link(entry, output)
        if entry['id'] == current_id:
            link = link.replace("<a ", '<a class="active" aria-current="page" ', 1)
        groups.setdefault(group, []).append(link)
    groups.setdefault("10 · 使用与例证", []).append('<a href="' + relative(ROOT / "docs/validation/index.html", output) + '">协议样例与验证</a>')
    parts = []
    for group, links in sorted(groups.items()):
        active = any('class="active"' in link for link in links)
        expanded = group.startswith("01") or active
        parts.append('<details class="nav-group"' + (' open' if expanded else '') + '><summary>' + html.escape(group) + '</summary><div>' + "\n".join(links) + '</div></details>')
    return "\n".join(parts)


def related_context(doc: dict | None, catalog: dict, output: Path) -> str:
    if not doc:
        return ""
    entries = {entry["id"]: entry for entry in catalog["documents"] + catalog["records"]}
    decisions = list(doc.get("related", {}).get("decisions", []))
    related = list(doc.get("outgoing", []))
    related += [entry["id"] for entry in catalog["documents"] if doc["id"] in entry.get("outgoing", [])]
    pieces = ['<section class="context-group" id="related-docs"><h3>关联与来源</h3><dl class="document-facts"><dt>文档 ID</dt><dd>' + html.escape(doc["id"]) + '</dd><dt>所属层级</dt><dd>' + html.escape(doc["layer"]) + '</dd><dt>声明状态</dt><dd>' + html.escape(catalog["stateLabels"][doc["status"]]) + '</dd></dl>']
    if doc.get("status_note"):
        pieces.append('<details><summary>状态范围</summary><p>' + html.escape(doc["status_note"]) + '</p></details>')
    for label, ids in [("关联模块", doc.get("modules", [])), ("关联 ADR", decisions), ("相关正文与历史", sorted(set(related) - set(decisions))), ("原始来源", doc.get("sources", []))]:
        if ids:
            links = "".join('<li>' + catalog_link(entries[key], output) + '</li>' for key in ids if key in entries)
            pieces.append('<details' + (' open' if label in {"关联 ADR", "原始来源"} else '') + '><summary>' + label + f' · {len(ids)}</summary><ul>' + links + '</ul></details>')
    pieces.append('</section>')
    return "".join(pieces)


def knowledge_overview(doc: dict | None, catalog: dict, output: Path) -> str:
    if not doc:
        return ""
    modules = [entry for entry in catalog["records"] if entry["kind"] == "module"]
    if doc["id"] == "GOV-FE-001":
        return '<section class="record-browser" aria-label="治理事项浏览"><div class="overview-heading"><h2>按问题进入设计</h2><span class="caption">审查判断与建议，不是新增已确认决策</span></div><div class="record-controls"><label>查看<select id="recordKind"><option value="open-decision">待讨论事项</option><option value="conflict">一致性问题</option><option value="module">模块状态</option><option value="task">设计路线</option><option value="constraint">全局约束</option></select></label><label>模块<select id="recordModule"><option value="">全部模块</option>' + ''.join('<option value="' + entry['id'] + '">' + html.escape(entry['title']) + '</option>' for entry in modules) + '</select></label><label id="severityLabel">严重程度<select id="recordSeverity"><option value="">全部程度</option><option value="high">高</option><option value="medium">中</option><option value="info">差异已说明</option></select></label><label>前置决策<select id="recordBlocking"><option value="">全部</option><option value="yes">存在阻塞</option><option value="no">未标为阻塞</option></select></label><label>处理状态<select id="recordState"><option value="">全部状态</option></select></label></div><p id="recordCount" class="caption" role="status"></p><div class="module-comparison" id="moduleComparison" hidden><h3>模块对照</h3><div class="compare-selects"><label>第一项<select id="compareFirst"></select></label><label>第二项<select id="compareSecond"></select></label></div><div id="compareResults" class="table-wrap"></div></div><div id="recordResults" class="record-results"></div><a class="body-onward" href="#review-scope">继续阅读完整审查正文 ↓</a></section>'
    if doc["type"] == "decision":
        steps = []
        for section in doc['sections']:
            if section['level'] == 2:
                steps.append('<a href="#' + html.escape(section['anchor'], quote=True) + '">' + html.escape(section['title']) + '</a>')
        evolution = ""
        registry = {entry['id']: entry for entry in catalog['records']}
        for stage in doc.get('evolution', []):
            evolution += '<div><span class="status">' + html.escape(catalog['stateLabels'][stage['status']]) + '</span><p>' + html.escape(stage['label']) + '</p>' + catalog_link(registry[stage['source']], output, stage['source']) + '</div>'
        return '<section class="decision-context" aria-label="决策阅读路径"><p class="caption">' + html.escape(doc.get('status_note', '本记录提取既有决策，完整执行规范以所属主题为准。')) + '</p><nav class="decision-path">' + '<span>→</span>'.join(steps) + '</nav>' + ('<div class="decision-evolution">' + evolution + '</div>' if evolution else '') + '</section>'
    return ""


def relative(target: Path, output: Path) -> str:
    return quote(os.path.relpath(target, output.parent), safe="/.-_")


def asset(target: Path, output: Path) -> str:
    if target.name == "knowledge-index.js":
        content = json.dumps(get_catalog(), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    else:
        content = target.read_bytes()
    return relative(target, output) + "?v=" + hashlib.sha256(content).hexdigest()[:12]


def section_heading(title: str, number: int, status: str = "", level: int = 2) -> str:
    badge = ('<span class="status' + (' open' if status == '待固化' else '') + '">' + html.escape(status) + '</span>') if status else ''
    return f'<div class="section-head"><div class="kicker">{number:02d} · FORM ENGINE</div><div class="section-title"><h{level}>{html.escape(title)}</h{level}>{badge}</div></div>'


def render_document(*, output: Path, title: str, body: str,
                    toc: list[tuple[str, str]], eyebrow: str,
                    lead: str = "", subtitle: str = "", source: Path | None = None,
                    wide: bool = False, extra_css: str = "",
                    toc_groups: list[tuple[str, list[tuple[str, str]]]] | None = None) -> str:
    catalog = get_catalog()
    doc = next((entry for entry in catalog['documents'] if source and entry['source'] == source.relative_to(ROOT).as_posix()), None)
    navigation = knowledge_navigation(output, catalog, doc['id'] if doc else None) if catalog['documents'] else '\n'.join('<a href="' + relative(ROOT / path, output) + '">' + label + '</a>' for label, path in NAVIGATION)
    chapter_titles = dict(toc)

    def toc_link(anchor: str, label: str, number: int) -> str:
        title = html.escape(chapter_titles.get(anchor, label), quote=True)
        return f'<a href="#{html.escape(anchor, quote=True)}" data-to="{html.escape(anchor, quote=True)}" title="{title}"><span class="nav-num">{number:02d}</span><span>{html.escape(label)}</span></a>'

    links = []
    if toc_groups:
        number = 0
        for group_number, (label, entries) in enumerate(toc_groups, 1):
            children = []
            for anchor, entry_title in entries:
                number += 1
                children.append(toc_link(anchor, entry_title, number))
            expanded = ' open' if group_number == 1 else ''
            links.append(f'<details class="toc-group"{expanded}><summary><span class="nav-num">{group_number:02d}</span><span>{html.escape(label)}</span></summary><div class="toc-items">' + '\n'.join(children) + '</div></details>')
    else:
        links = [toc_link(anchor, label, i) for i, (anchor, label) in enumerate(toc, 1)]
    source_action = f'<a class="btn source-btn" href="{relative(source, output)}">查看源文</a>' if source else ''
    next_doc = next((entry for entry in catalog['documents'] if doc and entry['id'] == doc.get('reading_next')), None)
    continuation = '<nav class="reading-continuation" aria-label="继续阅读">' + catalog_link(next_doc, output, '下一步 · ' + next_doc['title']) + '</nav>' if next_doc else ''
    redirects = []
    current_url = output.relative_to(ROOT / 'docs/reading').as_posix() if output.is_relative_to(ROOT / 'docs/reading') else ''
    for entry in catalog.get('redirects', []):
        old_page, anchor = entry['from'].split('#', 1)
        if old_page == current_url:
            redirects.append('<span hidden id="' + html.escape(anchor, quote=True) + '"></span>')
    primary = []
    for key, label in [('ARCH-FE-001', '架构设计'), ('GOV-FE-001', '继续设计'), ('HISTORY-DESIGN', '决策与演进')]:
        target = next((entry for entry in catalog['documents'] if entry['id'] == key), None)
        if target: primary.append(catalog_link(target, output, label))
    values = {
        "title": html.escape(title),
        "home": relative(READING_HOME, output),
        "archive": relative(ROOT / "docs/history/index.html", output),
        "stylesheet": asset(ASSETS / "documentation.css", output),
        "script": asset(ASSETS / "documentation.js", output),
        "extra_stylesheet": f'<link rel="stylesheet" href="{asset(ASSETS / extra_css, output)}">' if extra_css else '',
        "navigation": navigation,
        "toc": '\n'.join(links),
        "eyebrow": html.escape(eyebrow),
        "subtitle": f'<span class="subtitle">{html.escape(subtitle)}</span>' if subtitle else '',
        "lead": f'<div class="desc">{lead}</div>' if lead else '',
        "body": body,
        "continuation": continuation,
        "redirect_landmarks": "".join(redirects),
        "primary_navigation": "".join(primary),
        "knowledge_overview": ('<details class="optional-tools"><summary>按模块筛选讨论、审查与状态（按需）</summary>' + knowledge_overview(doc, catalog, output) + '</details>') if doc and doc["id"] == "GOV-FE-001" else knowledge_overview(doc, catalog, output),
        "related_context": related_context(doc, catalog, output),
        "index_script": asset(ASSETS / "knowledge-index.js", output),
        "mermaid_script": '<script src="' + relative(ASSETS / "vendor/mermaid-11.12.1.min.js", output) + '" defer></script>' if 'class="mermaid"' in body else '',
        "source_action": source_action,
        "content_class": 'content content--wide examples' if wide else 'content',
    }
    template = (Path(__file__).parent / "templates/document.html").read_text(encoding="utf-8")
    return Template(template).substitute(values)
