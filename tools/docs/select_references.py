"""Select project and upstream writing references without loading unrelated topics."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_contracts import CONTEXT, as_mapping, matches, read_yaml, repo_path, strings


def reference_file(context, name):
    relative = repo_path(name)
    folder = (context / "references").resolve()
    path = (context / relative).resolve()
    if not relative.startswith("references/") or not path.is_relative_to(folder) or not path.is_file():
        raise ValueError(f"Missing or out-of-scope reference: {name}")
    return path


def load_manifest(context):
    path = context / "references.yaml"
    settings = read_yaml(path.read_text(encoding="utf-8"), path.name)
    as_mapping(settings, path.name, ("references",))
    references = settings["references"]
    if not isinstance(references, dict) or not references:
        raise ValueError("references must map named references to triggers")
    for identity, ref in references.items():
        as_mapping(ref, identity, ("file",),
                   ("paths", "suffixes", "intents", "source", "revision", "license", "scope"))
        for key in ("paths", "suffixes", "intents"):
            strings(ref.get(key, []), f"{identity}.{key}", allow_empty=True)
        if not any(ref.get(key) for key in ("paths", "suffixes", "intents")):
            raise ValueError(f"{identity}: missing scope")
        for route in ref.get("paths", []):
            repo_path(route)
        reference_file(context, ref["file"])
        if ref.get("source"):
            strings([ref.get("source"), ref.get("revision"), ref.get("license")], identity)
            reference_file(context, ref["license"])
    return references


def select(context, paths, intents):
    references = load_manifest(context)
    paths = sorted({repo_path(path) for path in paths})
    intents = set(intents)
    known = {intent for ref in references.values() for intent in ref.get("intents", [])}
    if missing := sorted(intents - known):
        raise ValueError(f"Unknown reference intents: {', '.join(missing)}")
    selected = {}
    for identity, ref in references.items():
        requested = intents.intersection(ref.get("intents", []))
        if ref.get("intents") and not requested:
            continue
        hits = [
            path for path in paths
            if (not ref.get("paths") or any(matches(path, route) for route in ref["paths"]))
            and (not ref.get("suffixes") or path.endswith(tuple(ref["suffixes"])))
        ]
        if (ref.get("paths") or ref.get("suffixes")) and not hits:
            continue
        selected[identity] = {
            **{key: ref[key] for key in ("file", "source", "revision", "license", "scope") if key in ref},
            "matched_paths": hits, "matched_intents": sorted(requested),
            "content": reference_file(context, ref["file"]).read_text(encoding="utf-8"),
        }
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context-dir", type=Path, default=CONTEXT)
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--intent", action="append", default=[])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            print(f"Verified {len(load_manifest(args.context_dir))} reference entries.")
        elif not (args.path or args.intent):
            parser.error("provide a file path or a task intent")
        else:
            print(json.dumps(select(args.context_dir, args.path, args.intent), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, f"AI references: {error}\n")


if __name__ == "__main__":
    main()
