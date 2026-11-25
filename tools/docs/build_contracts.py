"""Build and select the repository's AI-facing contract views."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

import yaml

from knowledge import DOCUMENT_STATES, ROOT, UniqueLoader, load_source


CONTEXT = ROOT / ".agents/context"
CLAUSE_ID = re.compile(r"[A-Z][A-Z0-9-]*-\d{3}")
ANCHOR = re.compile(r"(#{1,6})\s+.+?(?:\s+\{#([a-zA-Z0-9_-]+)\})?$")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def as_mapping(value, label, required, optional=()):
    if not isinstance(value, dict) or set(required) - value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError(f"{label}: expected {', '.join(required)}; optional {', '.join(optional)}")
    return value


def strings(value, label, *, allow_empty=False):
    if not isinstance(value, list) or (not value and not allow_empty) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise ValueError(f"{label}: expected a list of nonempty strings")
    return value


def repo_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or str(path) == "." or "\\" in value:
        raise ValueError(f"Not a repository-relative path: {value}")
    return path.as_posix()


def read_yaml(text, label):
    try:
        return yaml.load(text, Loader=UniqueLoader)
    except (ValueError, yaml.YAMLError) as error:
        raise ValueError(f"{label}: {error}") from error


def contract_blocks(body, source):
    """Collect top-level fenced clauses and their nearest explicit heading."""
    headings = []
    fence = None
    block = []
    for line in body.splitlines():
        marker = FENCE.match(line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                if is_contract:
                    anchor = next((anchor for _, anchor in reversed(headings) if anchor), None)
                    if not anchor:
                        raise ValueError(f"{source}: contract requires an explicit heading anchor")
                    yield anchor, "\n".join(block)
                fence = None
                block.clear()
            elif is_contract:
                block.append(line)
        elif marker:
            fence = marker[1]
            is_contract = marker[2].strip() == "contract"
        elif heading := ANCHOR.fullmatch(line):
            level = len(heading[1])
            while headings and headings[-1][0] >= level:
                headings.pop()
            headings.append((level, heading[2]))
    if fence and is_contract:
        raise ValueError(f"{source}: unclosed contract fence")


def parse_clause(block, location):
    clause = as_mapping(read_yaml(block, location), location,
                        ("id", "status", "applies_to", "requires"), ("checks",))
    if not isinstance(clause["id"], str) or not CLAUSE_ID.fullmatch(clause["id"]):
        raise ValueError(f"{location}: invalid contract ID {clause['id']}")
    if not isinstance(clause["status"], str) or clause["status"] not in DOCUMENT_STATES:
        raise ValueError(f"{location}: invalid contract status")
    if not isinstance(clause["applies_to"], str) or not clause["applies_to"].strip():
        raise ValueError(f"{location}: applies_to must be nonempty text")
    strings(clause["requires"], location)
    strings(clause.get("checks", []), location, allow_empty=True)
    return clause


def load_contracts(root):
    active = {}
    seen = set()
    for path in sorted((root / "docs/design").rglob("*.md")):
        source = path.relative_to(root).as_posix()
        metadata, body = load_source(path)
        for anchor, block in contract_blocks(body, source):
            location = f"{source}#{anchor}"
            clause = parse_clause(block, location)
            identity = clause["id"]
            if identity in seen:
                raise ValueError(f"{location}: duplicate contract ID {identity}")
            seen.add(identity)
            if clause["status"] == "active":
                if metadata.get("status") not in ("active", "accepted") or not metadata.get("id"):
                    raise ValueError(f"{location}: active contract requires an effective source with a document ID")
                active[identity] = {**clause, "source": location, "document_id": metadata["id"]}
    return active


def validate_config(root, config, contracts):
    as_mapping(config, "routes.yaml", ("charter", "checks", "routes"))
    charter = strings(config["charter"], "charter")
    checks = config["checks"]
    if not isinstance(checks, dict) or not all(isinstance(key, str) and key for key in checks):
        raise ValueError("checks must map IDs to commands")
    for key, command in checks.items():
        strings(command, key)
    if not isinstance(config["routes"], list) or not config["routes"]:
        raise ValueError("routes must be a nonempty list")
    route_ids = set()
    used = set(charter)
    for route in config["routes"]:
        as_mapping(route, "route", ("id", "contracts"), ("paths", "intents", "consumers", "read_first"))
        identity = route["id"]
        if not isinstance(identity, str) or not identity or identity in route_ids:
            raise ValueError(f"Invalid or duplicate route ID: {identity}")
        route_ids.add(identity)
        paths = strings(route.get("paths", []), identity, allow_empty=True)
        intents = strings(route.get("intents", []), identity, allow_empty=True)
        if not paths and not intents:
            raise ValueError(f"{identity}: route needs paths or intents")
        for path in paths:
            repo_path(path)
        for consumer in strings(route.get("consumers", []), identity, allow_empty=True):
            if not (root / repo_path(consumer)).is_file():
                raise ValueError(f"{identity}: unknown consumer {consumer}")
        for source in strings(route.get("read_first", []), identity, allow_empty=True):
            if not (root / repo_path(source)).is_file():
                raise ValueError(f"{identity}: missing required reading {source}")
        used.update(strings(route["contracts"], identity))
    if missing := sorted(used - contracts.keys()):
        raise ValueError(f"Unknown or inactive contracts: {', '.join(missing)}")
    if unrouted := sorted(contracts.keys() - used):
        raise ValueError(f"Active contracts need a route or charter entry: {', '.join(unrouted)}")
    for identity, clause in contracts.items():
        if missing := sorted(set(clause.get("checks", [])) - checks.keys()):
            raise ValueError(f"{identity}: unknown checks {', '.join(missing)}")


def clause_markdown(clause):
    requirements = "\n".join(f"- {value}" for value in clause["requires"])
    return (f"## {clause['id']}\n\n适用：{clause['applies_to']}\n\n{requirements}\n\n"
            f"来源（追溯）：`{clause['source']}`\n")


def build(root, context, check=False):
    contracts = load_contracts(root)
    config = read_yaml((context / "routes.yaml").read_text(encoding="utf-8"), "routes.yaml")
    validate_config(root, config, contracts)
    output = context / "generated"
    if output.is_symlink() or (output / "contracts").is_symlink():
        raise ValueError(f"Generated output cannot be a symlink: {output}")
    header = "<!-- Generated by tools/docs/build_contracts.py -->\n"
    files = {}
    entries = {}
    for identity, clause in sorted(contracts.items()):
        filename = f"contracts/{identity}.md"
        content = header + clause_markdown(clause)
        files[filename] = content
        entries[identity] = {
            "file": filename, "source": clause["source"], "document_id": clause["document_id"],
            "sha256": hashlib.sha256(content.encode()).hexdigest(), "checks": clause.get("checks", []),
        }
    files["charter.md"] = header + "# 项目研发宪章\n\n" + "\n".join(
        clause_markdown(contracts[identity]) for identity in config["charter"]
    )
    index = {"schema_version": 1, **config, "contracts": entries}
    files["index.json"] = json.dumps(index, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    existing = set((output / "contracts").glob("*.md"))
    obsolete = sorted(existing - {output / name for name in files})
    stale = []
    for name, content in sorted(files.items()):
        target = output / name
        if target.is_symlink():
            raise ValueError(f"Generated file cannot be a symlink: {target}")
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        stale.append(f"generated/{name}")
        if not check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
    if check and (stale or obsolete):
        names = stale + [path.relative_to(context).as_posix() for path in obsolete]
        raise ValueError("AI Contract outputs need rebuilding:\n" + "\n".join(names))
    if not check:
        for path in obsolete:
            path.unlink()
    return len(contracts)


def matches(path, selector):
    normalized = repo_path(selector)
    return path.startswith(normalized + "/") if selector.endswith("/") else path == normalized


def overlaps(root, paths, index, ids):
    sources = {index["contracts"][identity]["source"].split("#", 1)[0] for identity in ids}
    activity = []
    for config in sorted((root / "openspec/changes").glob("*/workflow.json")):
        data = json.loads(config.read_text(encoding="utf-8"))
        scope = sorted({path for entry in data.get("scope", []) for path in paths
                        if path == entry or path.startswith(entry.rstrip("/") + "/")})
        authority = sorted(sources.intersection(data.get("authority", [])))
        if scope or authority:
            activity.append({
                "change": config.parent.name, "scope_matches": scope, "authority_matches": authority,
            })
    return activity


def select(root, context, paths, intents):
    output = context / "generated"
    index = json.loads((output / "index.json").read_text(encoding="utf-8"))
    if index["schema_version"] != 1:
        raise ValueError("Unsupported AI Contract index version")
    paths = sorted({repo_path(path) for path in paths})
    allowed_intents = {intent for route in index["routes"] for intent in route.get("intents", [])}
    if unknown := sorted(set(intents) - allowed_intents):
        raise ValueError(f"Unknown intents: {', '.join(unknown)}")
    matched, consumers, ids, reasons = set(), set(), set(), []
    read_first = {}
    for route in index["routes"]:
        hit_paths = sorted(path for path in paths if any(matches(path, pattern) for pattern in route.get("paths", [])))
        hit_intents = sorted(set(intents).intersection(route.get("intents", [])))
        if hit_paths or hit_intents:
            matched.update(hit_paths)
            ids.update(route["contracts"])
            consumers.update(route.get("consumers", []))
            read_first.update(dict.fromkeys(route.get("read_first", [])))
            reasons.append({"route": route["id"], "paths": hit_paths, "intents": hit_intents, "contracts": route["contracts"]})
    clauses = {}
    checks = set()
    for identity in sorted(ids):
        entry = index["contracts"][identity]
        path = output / entry["file"]
        if not CLAUSE_ID.fullmatch(identity) or path != output / f"contracts/{identity}.md":
            raise ValueError(f"Invalid generated contract path: {identity}")
        content = path.read_text(encoding="utf-8")
        if hashlib.sha256(content.encode()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Generated contract differs from the index: {identity}")
        clauses[identity] = content
        checks.update(entry["checks"])
    activity = overlaps(root, set(paths) | consumers, index, ids)
    return {"matches": reasons, "read_first": list(read_first), "contracts": clauses, "consumers": sorted(consumers),
            "checks": {key: index["checks"][key] for key in sorted(checks)},
            "unmatched_paths": sorted(set(paths) - matched), "activity": activity}


def worktree_paths():
    commands = [
        ["git", "diff", "--name-only", "-z", "--no-renames", "HEAD", "--"],
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
    ]
    return [path for command in commands for path in subprocess.check_output(
        command, cwd=ROOT).decode().split("\0") if path]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context-dir", type=Path, default=CONTEXT, help="Context directory for building or selecting")
    parser.add_argument("--check", action="store_true", help="Compare committed generated views with sources")
    commands = parser.add_subparsers(dest="command")
    query = commands.add_parser("select", help="Load effective rules from the generated AI context only")
    query.add_argument("--intent", action="append", default=[])
    query.add_argument("--path", action="append", default=[])
    query.add_argument("--worktree", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "select":
            paths = args.path + (worktree_paths() if args.worktree else [])
            if args.check or not (paths or args.intent):
                parser.error("select needs --path, --intent or a nonempty --worktree")
            print(json.dumps(select(ROOT, args.context_dir, paths, args.intent), ensure_ascii=False, indent=2))
        else:
            count = build(ROOT, args.context_dir, check=args.check)
            print(f"{'Verified' if args.check else 'Built'} AI Contract views for {count} active clauses.")
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"AI Contract: {error}\n")


if __name__ == "__main__":
    main()
