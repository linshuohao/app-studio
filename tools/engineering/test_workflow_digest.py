"""Regression tests for evidence coverage; no OpenSpec process required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("workflow", Path(__file__).with_name("workflow.py"))
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class EvidenceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.sandbox = tempfile.TemporaryDirectory()
        self.addCleanup(self.sandbox.cleanup)
        self.root = Path(self.sandbox.name).resolve()
        self.change = self.root / "openspec/changes/probe"
        self.change.mkdir(parents=True)
        for name in ["docs/design/a.md", "src/a.py", "openspec/config.yaml",
                     "openspec/schemas/form-change/schema.yaml",
                     "openspec/schemas/form-change/templates/tasks.md",
                     "tools/engineering/workflow.py"]:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("initial")
        self.config = {"authority": ["docs/design/a.md"], "scope": ["src"]}

    def fingerprint(self):
        return workflow.digest(self.root, self.change, self.config)

    def test_execution_files_invalidate_evidence_without_manual_scope(self):
        for name in ["openspec/config.yaml", "openspec/schemas/form-change/schema.yaml",
                     "openspec/schemas/form-change/templates/tasks.md", "tools/engineering/workflow.py"]:
            with self.subTest(name=name):
                before = self.fingerprint()
                p = self.root / name
                p.write_text(p.read_text() + " changed")
                self.assertNotEqual(before, self.fingerprint())

    def test_directory_symlink_in_scope_is_rejected(self):
        target = self.root / "consumer"
        target.mkdir()
        (target / "a.py").write_text("consumer")
        (self.root / "src/linked").symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "[Ss]ymlink"):
            self.fingerprint()

    def test_scope_root_directory_symlink_is_rejected(self):
        (self.root / "alias").symlink_to(self.root / "src", target_is_directory=True)
        self.config["scope"] = ["alias"]
        with self.assertRaisesRegex(ValueError, "[Ss]ymlink"):
            self.fingerprint()


if __name__ == "__main__":
    unittest.main()
