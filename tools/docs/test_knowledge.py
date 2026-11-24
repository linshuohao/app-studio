"""Contract and security checks for the Markdown-derived reading system."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from build_docs import OUTPUTS, decorate, render
from knowledge import (build_catalog, governance_records, index_outputs, load_source, module_refs,
                       sanitize, markdown_html, plain, sections, validate_catalog, validate_graph, ROOT)


def document(key="DOC-A", **extra):
    return {"id": key, "type": "design", "status": "active", "source": key + ".md",
            "modules": [], "sources": [], "related": {}, **extra}


class KnowledgeContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = build_catalog(OUTPUTS)

    def test_actual_module_and_review_coverage(self):
        records = self.catalog["records"]
        for kind, count in [("module", 19), ("conflict", 10), ("open-decision", 17), ("task", 11), ("constraint", 12)]:
            self.assertEqual(sum(row["kind"] == kind for row in records), count, kind)
        self.assertEqual([row["id"] for row in records if row["kind"] == "conflict" and row["blocking"]], [])
        for review_id in ("REV-02", "REV-06"):
            review = next(row for row in records if row["id"] == review_id)
            self.assertEqual(review["state"], "explained")

    def test_all_search_positions_keep_document_identity(self):
        for doc in self.catalog["documents"]:
            self.assertTrue(doc["sections"])
            self.assertTrue(all(section["url"] for section in doc["sections"]))
        l1 = next(doc for doc in self.catalog["documents"] if doc["id"] == "L1-DATA-SCOPE")
        self.assertTrue(any(section["url"].endswith("#scope-handle") for section in l1["sections"]))

    def test_module_comparison_keeps_implementation_conditions_after_json_roundtrip(self):
        import json
        catalog = json.loads(json.dumps(self.catalog, sort_keys=True))
        module = next(row for row in catalog["records"] if row["id"] == "M09")
        self.assertEqual(module["fieldOrder"][-1], "可进入的工作")
        self.assertIn("新有效失效建轮", module["fields"][module["fieldOrder"][-1]])

    def test_l1_topics_have_independent_reading_pages(self):
        topics = [doc for doc in self.catalog["documents"] if doc["type"] == "protocol" and doc["id"] != "PROTOCOL-L1"]
        self.assertEqual(len(topics), 8)
        self.assertEqual(len({doc["url"].split("#")[0] for doc in topics}), 8)

    def test_source_ledgers_are_outside_current_design(self):
        owners = {section["anchor"]: doc["id"] for doc in self.catalog["documents"] for section in doc["sections"]}
        for anchor in ("l3-decisions", "l3-v06-decisions", "dependency-v05-decisions", "validation-decisions", "history"):
            self.assertEqual(owners[anchor], "HISTORY-DESIGN")

    def test_partial_layer_and_platform_scopes_are_explicit(self):
        records = {row["id"]: row for row in self.catalog["records"]}
        for key in ("M14", "M18", "M19"):
            self.assertEqual(records[key]["state"], "部分完成")
        self.assertIn("T09", records)
        self.assertIn("T10", records)
        self.assertIn("T11", records["T07"]["dependencies"])

    def test_old_nested_review_and_model_bookmarks_have_real_targets(self):
        redirects = {row["from"]: row["url"] for row in self.catalog["redirects"]}
        self.assertEqual(redirects["governance.html#rev-01"], "design-review.html#rev-01")
        self.assertEqual(redirects["architecture.html#renderer"], "l4-renderer.html#renderer")

    def test_validation_case_ids_survive_discussion_label_cleanup(self):
        _, body = load_source(ROOT / "docs/design/l3-validation.md")
        import re
        self.assertEqual(set(re.findall(r"^\| (V\d{2}) \|", body, re.M)), {f"V{n:02d}" for n in range(1, 17)})

    def test_diagram_search_uses_labels_instead_of_structural_json(self):
        text = plain('```diagram\n{"id":"figure-test","title":"Scope 身份","rows":[[{"title":"稳定实例","body":"相对位置"}]]}\n```')
        self.assertIn('稳定实例', text)
        self.assertIn('相对位置', text)
        self.assertNotIn('"rows"', text)
        self.assertNotIn('figure-test', text)

    def test_duplicate_id_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate knowledge IDs"):
            validate_catalog([document(), document()], [])

    def test_dangling_related_id_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing related target"):
            validate_catalog([document(related={"documents": ["MISSING"]})], [])

    def test_normal_bidirectional_reading_links_are_allowed(self):
        validate_catalog([document("DOC-A", related={"documents": ["DOC-B"]}),
                          document("DOC-B", related={"documents": ["DOC-A"]})], [])

    def test_undefined_state_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid document type/status"):
            validate_catalog([document(status="implemented-probably")], [])

    def test_metadata_list_shape_is_checked(self):
        with self.assertRaisesRegex(ValueError, "modules must be a list"):
            validate_catalog([document(modules="M01")], [])

    def test_related_decisions_requires_a_decision(self):
        with self.assertRaisesRegex(ValueError, "not an ADR"):
            validate_catalog([document("DOC-A", related={"decisions": ["DOC-B"]}), document("DOC-B")], [])

    def test_task_prerequisite_cycle_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Roadmap cycle"):
            validate_graph({"T01": ["T02"], "T02": ["T01"]}, "Roadmap")

    def test_task_prerequisite_missing_target_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing T09"):
            validate_graph({"T01": ["T09"]}, "Roadmap")

    def test_replacement_has_to_be_bidirectional(self):
        before = document("ADR-OLD", type="decision", status="superseded", superseded_by="ADR-NEW")
        after = document("ADR-NEW", type="decision", status="accepted")
        with self.assertRaisesRegex(ValueError, "inconsistent superseded_by"):
            validate_catalog([before, after], [])
        after["supersedes"] = ["ADR-OLD"]
        validate_catalog([before, after], [])

    def test_duplicate_yaml_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "duplicate.md"
            path.write_text("---\nid: A\nid: B\n---\n# Title\n")
            with self.assertRaisesRegex(ValueError, "Duplicate YAML key"):
                load_source(path)

    def test_yaml_object_constructor_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "unsafe.md"
            path.write_text("---\na: !!python/object/apply:os.system ['false']\n---\n# Title\n")
            with self.assertRaisesRegex(ValueError, "invalid frontmatter"):
                load_source(path)

    def test_duplicate_explicit_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate explicit anchors"):
            sections("# Title\n\n## First {#same}\nA\n\n## Second {#same}\nB\n", "example.html")

    def test_markdown_heading_inside_code_is_not_an_indexed_section(self):
        found = sections("# Title\n\n## Real {#real}\n```text\n## Fake\n```\n", "example.html")
        self.assertEqual(len(found), 2)
        self.assertEqual(found[1]["anchor"], "real")

    def test_explicit_module_ranges_are_expanded(self):
        self.assertEqual(module_refs("M05 / 11 / 13；M02–M04"), ["M02", "M03", "M04", "M05", "M11", "M13"])

    def test_raw_active_html_and_executable_urls_are_removed(self):
        source = '<script>alert(1)</script><iframe src="https://example.com"></iframe><p onclick="x()">Text</p><a href="javascript:alert(1)">Link</a><img src="x" onerror="x()">'
        clean = sanitize(markdown_html(source))
        for unwanted in ("<script", "<iframe", "onclick", "onerror", "javascript:"):
            self.assertNotIn(unwanted, clean)
        self.assertIn("Text", clean)

    def test_code_is_preserved_and_highlighted_as_text(self):
        body = render('```javascript\nconst x = "<script>alert(1)</script>";\n```', ROOT / "docs/design/architecture.md", ROOT / "docs/reading/architecture.html")
        output = decorate(body)
        self.assertIn("syn-", output)
        self.assertNotIn("<script>", output)
        self.assertIn("&lt;script&gt;", output)

    def test_mermaid_configuration_override_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "configuration/directives are disabled"):
            decorate('<pre><code class="language-mermaid">%%{init: {"securityLevel":"loose"}}%%\ngraph LR\nA--&gt;B</code></pre>')

    def test_generated_script_cannot_close_an_html_script(self):
        catalog = deepcopy(self.catalog)
        catalog["documents"][0]["summary"] = '</script><script>alert(1)</script>'
        script = next(value for path, value in index_outputs(catalog).items() if path.suffix == ".js")
        self.assertNotIn("</script>", script)
        self.assertIn("\\u003c/script\\u003e", script)


if __name__ == "__main__":
    unittest.main()
