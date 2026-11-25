import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from build_contracts import build, select


class ContractsTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.context = self.root / ".agents/context"
        self.context.mkdir(parents=True)
        source = self.root / "docs/design/test.md"
        source.parent.mkdir(parents=True)
        self.source = source
        self.write_source()
        self.routes = self.context / "routes.yaml"
        self.routes.write_text("""charter: [PROJECT-CHARTER-001]
checks:
  ui.test: [node, checks/ui.mjs]
routes:
  - id: ui
    paths: [apps/studio/]
    intents: [studio-component]
    contracts: [STUDIO-UI-001]
    read_first: [docs/design/test.md]
    consumers: [tests/ui.spec.ts]
  - id: api
    paths: [services/api/]
    intents: [api-contract]
    contracts: [PLATFORM-API-001]
""", encoding="utf-8")
        for path in ("tests/ui.spec.ts", "checks/ui.mjs", "apps/studio/control.tsx", "services/api/index.ts"):
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.touch()

    def write_source(self):
        def clause(identity, status, requirement):
            return f"""\n```contract
id: {identity}
status: {status}
applies_to: fixture
requires: [{requirement}]
```
"""
        self.source.write_text(
            "---\nid: FIXTURE\nstatus: active\n---\n## Rules {#rules}\n"
            + clause("PROJECT-CHARTER-001", "active", "approval")
            + clause("STUDIO-UI-001", "active", "focus")
            + clause("PLATFORM-API-001", "active", "authorization")
            + clause("STUDIO-UI-002", "proposed", "unconfirmed"),
            encoding="utf-8",
        )

    def test_selection_uses_only_generated_effective_context(self):
        build(self.root, self.context)
        self.source.unlink()
        result = select(self.root, self.context, ["apps/studio/control.tsx"], [])
        self.assertEqual(list(result["contracts"]), ["STUDIO-UI-001"])
        self.assertIn("focus", result["contracts"]["STUDIO-UI-001"])
        self.assertEqual(result["read_first"], ["docs/design/test.md"])
        self.assertEqual(result["consumers"], ["tests/ui.spec.ts"])
        self.assertNotIn("STUDIO-UI-002", (self.context / "generated/index.json").read_text())
        expanded = select(self.root, self.context, ["apps/studio/control.tsx"], ["api-contract"])
        self.assertEqual(set(expanded["contracts"]), {"STUDIO-UI-001", "PLATFORM-API-001"})

    def test_required_reading_must_exist(self):
        self.routes.write_text(self.routes.read_text().replace("docs/design/test.md", "missing.md"))
        with self.assertRaisesRegex(ValueError, "missing required reading missing.md"):
            build(self.root, self.context)

    def test_check_detects_changed_source_and_orphaned_output(self):
        build(self.root, self.context)
        build(self.root, self.context, check=True)
        self.source.write_text(self.source.read_text().replace("focus", "keyboard focus"))
        with self.assertRaisesRegex(ValueError, "generated/contracts/STUDIO-UI-001.md"):
            build(self.root, self.context, check=True)
        build(self.root, self.context)
        obsolete = self.context / "generated/contracts/obsolete.md"
        obsolete.touch()
        with self.assertRaisesRegex(ValueError, "obsolete.md"):
            build(self.root, self.context, check=True)
        build(self.root, self.context)
        self.assertFalse(obsolete.exists())

    def test_route_cannot_reference_proposed_contract_or_unknown_check(self):
        self.routes.write_text(self.routes.read_text().replace("STUDIO-UI-001", "STUDIO-UI-002"))
        with self.assertRaisesRegex(ValueError, "STUDIO-UI-002"):
            build(self.root, self.context)
        self.routes.write_text(self.routes.read_text().replace("STUDIO-UI-002", "STUDIO-UI-001"))
        self.source.write_text(self.source.read_text().replace("requires: [focus]", "requires: [focus]\nchecks: [missing]"))
        with self.assertRaisesRegex(ValueError, "missing"):
            build(self.root, self.context)

    def test_consumer_overlap_is_reported_without_claiming_evidence(self):
        change = self.root / "openspec/changes/other"
        change.mkdir(parents=True)
        (change / "workflow.json").write_text(json.dumps({"scope": ["tests"], "authority": []}))
        build(self.root, self.context)
        result = select(self.root, self.context, ["apps/studio/control.tsx", "unknown.md"], [])
        self.assertEqual(result["activity"][0]["scope_matches"], ["tests/ui.spec.ts"])
        self.assertEqual(result["unmatched_paths"], ["unknown.md"])
