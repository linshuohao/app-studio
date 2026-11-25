import unittest

from studio_catalog import ROOT, build_catalog, lookup


class StudioCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = build_catalog(ROOT)

    def test_component_combines_export_and_handbook(self):
        tree = lookup(self.catalog, "component", "TreeView", 1)[0]
        self.assertEqual(tree["name"], "TreeView")
        self.assertEqual(tree["entry"], "packages/studio-design/components/src/index.ts")
        self.assertTrue(tree["handbook"].endswith("/treeview.html"))
        self.assertTrue(any("density" in prop["name"] for prop in tree["properties"]))
        self.assertIn("#treeview", tree["examples"][0])
        picker = lookup(self.catalog, "component", "FieldPicker", 1)[0]
        self.assertEqual(picker["entry"], "apps/studio/src/components/field-picker/index.tsx")
        editor = lookup(self.catalog, "component", "JsonEditor", 1)[0]
        self.assertEqual(editor["entry"], "apps/studio/src/components/json/json-editor.tsx")
        self.assertTrue(editor["handbook"].endswith("/json-editor.html"))
        self.assertIn("JSON", editor["description"])
        self.assertIn("onChange", [prop["name"] for prop in editor["properties"]])
        layout = lookup(self.catalog, "component", "FormLayout", 1)[0]
        self.assertEqual(layout["entry"], "packages/studio-design/components/src/form-layout.tsx")
        scope = lookup(self.catalog, "component", "ReactionScopeEditor", 1)[0]
        self.assertEqual(scope["export"], "ScopeEditor")
        self.assertEqual(scope["entry"], "apps/studio/src/app/scope-editor.tsx")
        literals = lookup(self.catalog, "component", "LiteralValueList", 1)[0]
        self.assertEqual(literals["entry"], "apps/studio/src/app/literal-value-list.tsx")

    def test_token_uses_current_css_and_handbook(self):
        token = lookup(self.catalog, "token", "--studio-space-8", 1)[0]
        self.assertEqual(token["value"], "8px")
        self.assertEqual(token["category"], "dimensions")
        color = lookup(self.catalog, "token", "分隔边框", 1)[0]
        self.assertEqual(color["name"], "--studio-border")

    def test_unknown_and_result_limits(self):
        self.assertEqual(lookup(self.catalog, "component", "unregistered-example-42", 5), [])
        self.assertEqual(len(lookup(self.catalog, "token", "间距", 2)), 2)
