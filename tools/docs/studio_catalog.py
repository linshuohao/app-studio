"""Build and query Studio references derived from the actual design system."""
from __future__ import annotations

import argparse
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
DESIGN = Path("packages/studio-design")
HANDBOOK = DESIGN / "handbook/studio-design-handbook.html"
TOKEN_PAGE = HANDBOOK.parent / "studio-components/tokens.html"
TOKEN_SOURCE = DESIGN / "tokens/tokens.css"
DESIGN_COMPONENTS = DESIGN / "components/src"
DESIGN_PACKAGE = "@form-engine/studio-design-components"
COMPONENTS = Path("apps/studio/src/components")
CARD = re.compile(
    r'<a\b[^>]*href="(studio-components/[\w-]+\.html)"[^>]*>\s*'
    r'<strong>(.*?)</strong>\s*<small>(.*?)</small>\s*</a\s*>', re.S,
)
TOKEN_NAME = r"--studio-[\w-]+"


def plain(fragment):
    return " ".join(unescape(re.sub(r"<[^>]+>", "", fragment)).split())


def first(pattern, body):
    match = re.search(pattern, body, re.S)
    return plain(match[1]) if match else ""


def public_components(root):
    exported = {}
    for path in [root / DESIGN_COMPONENTS / "index.ts", *sorted((root / COMPONENTS).glob("*/index.ts*"))]:
        for name in component_exports(path):
            exported.setdefault(name, []).append(path.relative_to(root).as_posix())
    return exported


def component_exports(path):
    source = path.read_text(encoding="utf-8")
    names = set(re.findall(r"^export\s+(?:async\s+)?(?:function|class|const)\s+([A-Z]\w*)", source, re.M))
    for group in re.findall(r"^export\s*\{([^}]*)\}", source, re.M):
        for item in group.split(","):
            name = item.strip().split(" as ")[-1]
            if not item.strip().startswith("type ") and re.fullmatch(r"[A-Z]\w*", name):
                names.add(name)
    return names


def design_exports(root):
    package = root / DESIGN / "components"
    manifest = json.loads((package / "package.json").read_text(encoding="utf-8"))
    return {name: package / path for name, path in manifest["exports"].items()}


def example_imports(root):
    """Find direct module entries used by Handbook examples."""
    entries = {}
    studio_source = root / "apps/studio/src"
    exports = design_exports(root)
    for example in sorted((root / TOKEN_PAGE.parent).glob("*.jsx")):
        imports = re.findall(
            r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]",
            example.read_text(encoding="utf-8"), re.M,
        )
        for group, specifier in imports:
            if specifier == DESIGN_PACKAGE or specifier.startswith(DESIGN_PACKAGE + "/"):
                module = exports.get("." + specifier[len(DESIGN_PACKAGE):])
                if not module:
                    raise ValueError(f"{example}: unknown Studio Design export {specifier}")
            else:
                module = (example.parent / specifier).resolve()
                if not module.is_relative_to(studio_source):
                    continue
            candidates = [module, module.with_suffix(".tsx"), module.with_suffix(".ts"),
                          module / "index.tsx", module / "index.ts"]
            path = next((candidate for candidate in candidates if candidate.is_file()), None)
            if path is None:
                continue
            names = {item.strip().split(" as ")[0] for item in group.split(",")}
            for name in names & component_exports(path):
                entries.setdefault(name, set()).add(path.relative_to(root).as_posix())
    return entries


def component_details(root, path, body):
    hero = re.search(r'<header\b[^>]*class="[^"]*\bhero\b[^"]*"[^>]*>(.*?)</header>', body, re.S)
    description = first(r"<p\b[^>]*>(.*?)</p>", hero[1]) if hero else first(
        r"<h1\b[^>]*>.*?</h1>\s*<p\b[^>]*>(.*?)</p>", body,
    )
    properties = []
    tables = re.findall(r'<table\b[^>]*class="[^"]*\bprop-types\b[^"]*"[^>]*>(.*?)</table>', body, re.S)
    if not tables:
        tables = re.findall(r'<section\b[^>]*id="api"[^>]*>.*?<table\b[^>]*>(.*?)</table>', body, re.S)
    for table in tables:
        for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table, re.S):
            cells = re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, re.S)
            if len(cells) > 1 and "<td" in row:
                properties.append({"name": plain(cells[0]), "usage": " · ".join(map(plain, cells[1:]))[:250]})
    examples = []
    for src in re.findall(r'<iframe\b[^>]*\bsrc="([^"]+)"', body, re.S):
        parts = urlsplit(unescape(src))
        if parts.scheme or parts.netloc or parts.query != "run":
            continue
        target = (root / path.parent / parts.path).resolve()
        if target.is_relative_to(root.resolve()):
            examples.append(target.relative_to(root.resolve()).as_posix() + f"?run#{parts.fragment}")
    keyboard = [
        plain(fragment)[:360]
        for fragment in re.findall(r"<(?:p|li)\b[^>]*>([^<]*(?:键盘|Escape|Tab).*?)</(?:p|li)>", body, re.S)
    ]
    return {"description": description, "properties": properties[:20], "examples": sorted(set(examples)),
            "keyboard": list(dict.fromkeys(keyboard))[:5]}


def documented_export(root, page, body):
    link = re.search(r'<a\s+href="([^"]+)"\s+data-studio-export="([A-Z]\w*)"', body)
    if link is None:
        return None
    target = (root / page.parent / link[1]).resolve()
    if (not (target.is_relative_to(root / "apps/studio/src")
             or target.is_relative_to(root / DESIGN_COMPONENTS))
            or not target.is_file() or link[2] not in component_exports(target)):
        raise ValueError(f"{page}: invalid Studio export {link[2]} in {link[1]}")
    return link[2], target.relative_to(root).as_posix()


def handbook_components(root):
    body = (root / HANDBOOK).read_text(encoding="utf-8")
    exported = public_components(root)
    imported = example_imports(root)
    components = []
    found = set()
    seen = set()
    for section in re.findall(r'<section class="library-group">(.*?)</section>', body, re.S):
        group = first(r"<h2\b[^>]*>(.*?)</h2>", section)
        for href, title, summary in CARD.findall(section):
            path = HANDBOOK.parent / href
            name = plain(title)
            key = name, path
            if key in seen:
                continue
            seen.add(key)
            page = (root / path).read_text(encoding="utf-8")
            declared = documented_export(root, path, page)
            symbol = declared[0] if declared else name
            entries = [declared[1]] if declared else exported.get(symbol) or sorted(imported.get(symbol, ()))
            found.add(name)
            components.append({
                "name": name, "summary": plain(summary), "category": group,
                "handbook": path.as_posix(), "entry": entries[0] if len(entries) == 1 else None,
                "export": symbol if entries else None, "entry_candidates": entries,
                **component_details(root, path, page),
            })
    if not components:
        raise ValueError(f"No component cards found in {HANDBOOK}")
    for name in sorted(exported.keys() - found):
        entries = exported[name]
        components.append({
            "name": name, "summary": "", "category": "公开入口", "handbook": None,
            "entry": entries[0] if len(entries) == 1 else None, "entry_candidates": entries,
            "export": name, "description": "", "properties": [], "examples": [], "keyboard": [],
        })
    return sorted(components, key=lambda item: (item["name"].casefold(), item["handbook"] or ""))


def studio_tokens(root):
    css = re.sub(r"/\*.*?\*/", "", (root / TOKEN_SOURCE).read_text(encoding="utf-8"), flags=re.S)
    declarations = re.findall(r"(" + TOKEN_NAME + r")\s*:\s*([^;}]+);", css)
    values = {}
    for name, value in declarations:
        values.setdefault(name, []).append(" ".join(value.split()))
    if not values:
        raise ValueError(f"No Studio tokens found in {TOKEN_SOURCE}")
    handbook = (root / TOKEN_PAGE).read_text(encoding="utf-8")
    labels = {}
    for section, body in re.findall(r'<section class="doc-section" id="([^"]+)">(.*?)</section>', handbook, re.S):
        heading = first(r"<h2\b[^>]*>(.*?)</h2>", body)
        for name in set(re.findall(r"<code\b[^>]*>(" + TOKEN_NAME + r")</code\s*>", body)):
            if name not in values:
                raise ValueError(f"{TOKEN_PAGE} lists undefined token {name}")
            labels[name] = (section, heading)
    names = dict((name, plain(label)) for label, name in re.findall(
        r"<b>([^<]+)</b>\s*<code>(" + TOKEN_NAME + r")</code\s*>", handbook,
    ))
    for label, name in re.findall(
        r'<th\b[^>]*>([^<]+)<code>(' + TOKEN_NAME + r')</code></th>', handbook,
    ):
        names[name] = plain(label)
    tokens = []
    for name, samples in sorted(values.items()):
        category, group = labels.get(name, ("", ""))
        unique = list(dict.fromkeys(samples))
        tokens.append({
            "name": name, "label": names.get(name, ""), "category": category, "group": group,
            "value": unique[0] if len(unique) == 1 else None, "source_values": unique,
            "source": TOKEN_SOURCE.as_posix(),
            "handbook": f"{TOKEN_PAGE.as_posix()}#{category}" if category else None,
        })
    return tokens


def build_catalog(root):
    return {"schema_version": 1, "component": handbook_components(root), "token": studio_tokens(root)}


def lookup(catalog, kind, query, limit):
    query = query.strip().casefold()
    if kind not in ("component", "token") or not query or not 1 <= limit <= 20:
        raise ValueError("Lookup needs a component or token query and a limit from 1 to 20")
    terms = query.split()
    results = []
    for item in catalog[kind]:
        name = item["name"].casefold()
        fields = ("name", "export", "summary", "category", "description", "handbook") if kind == "component" else (
            "name", "label", "category", "group", "value",
        )
        haystack = " ".join(item.get(field) or "" for field in fields).casefold()
        if all(term in haystack for term in terms):
            score = 0 if name == query else 1 if query in name else 2
            results.append((score, name, item.get("handbook") or "", item))
    return [item for _, _, _, item in sorted(results, key=lambda result: result[:3])[:limit]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    query = commands.add_parser("lookup")
    query.add_argument("--kind", choices=("component", "token"), required=True)
    query.add_argument("--query", required=True)
    query.add_argument("--limit", type=int, default=5)
    commands.add_parser("check", help="Check public Studio Design component pages and Token references")
    args = parser.parse_args()
    try:
        if args.command == "check":
            catalog = build_catalog(ROOT)
            described = {item["export"] for item in catalog["component"] if item["handbook"]}
            public = {
                name for path in design_exports(ROOT).values() if path.suffix in (".ts", ".tsx")
                for name in component_exports(path)
            }
            if missing := sorted(public - described):
                raise ValueError("Missing Handbook pages for: " + ", ".join(missing))
            if missing := [item["name"] for item in catalog["token"] if not item["handbook"]]:
                raise ValueError("Missing Handbook entries for: " + ", ".join(missing))
            print(f"Verified {len(described)} documented exports and {len(catalog['token'])} Token declarations.")
            return
        read = handbook_components if args.kind == "component" else studio_tokens
        catalog = {args.kind: read(ROOT)}
        print(json.dumps(lookup(catalog, args.kind, args.query, args.limit), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Studio catalog: {error}\n")


if __name__ == "__main__":
    main()
