import unittest

from build_contracts import CONTEXT, ROOT, select as select_contracts
from select_references import select


class ReferenceSelectionTest(unittest.TestCase):
    def test_studio_does_not_collect_unrelated_framework_or_language_references(self):
        result = select(CONTEXT, ["packages/studio-design/components/src/tree-view.tsx"], ["react-render"])
        self.assertEqual(set(result), {
            "project-typescript-files", "microsoft-typescript-modeling", "react-derived-state",
        })
        self.assertIn("Calculate Derived State", result["react-derived-state"]["content"])

    def test_python_api_keeps_project_and_open_source_references(self):
        result = select(CONTEXT, ["services/agent/src/form_agent/api/conversations.py"], ["fastapi-http"])
        self.assertEqual(set(result), {
            "project-python", "python-writing-patterns", "project-fastapi-transport",
            "fastapi-response-models",
        })
        self.assertIn("Use async-native libraries", result["python-writing-patterns"]["content"])
        self.assertIn("Response Model", result["fastapi-response-models"]["content"])

    def test_intent_cannot_pull_references_into_an_unrelated_directory(self):
        result = select(CONTEXT, ["packages/protocol/src/index.ts"], ["fastapi-http", "react-render"])
        self.assertEqual(set(result), {"project-typescript-files", "microsoft-typescript-modeling"})

    def test_next_layout_reference_includes_metadata_boundary(self):
        result = select(CONTEXT, ["apps/studio/src/app/layout.tsx"], ["next-boundary"])
        self.assertEqual(set(result), {
            "project-typescript-files", "microsoft-typescript-modeling", "next-server-client",
            "project-next-studio",
        })
        self.assertIn("only supported in Server Components", result["next-server-client"]["content"])

    def test_nest_http_reference_covers_manual_response(self):
        result = select(
            CONTEXT, ["services/api/src/platform/agent-conversations.controller.ts"], ["nest-http"],
        )
        text = result["nestjs-controllers"]["content"]
        self.assertIn("project-nest-http", result)
        self.assertIn("responsible for managing the response", text)
        self.assertNotIn("nest g resource", text)

    def test_journal_has_a_receipt_contract_without_studio_or_http_rules(self):
        path = "services/agent/src/form_agent/execution/journal.py"
        contracts = select_contracts(ROOT, CONTEXT, [path], [])
        self.assertEqual(set(contracts["contracts"]), {"AGENT-TURN-RECOVERY-001"})
        self.assertFalse(contracts["unmatched_paths"])
        refs = select(CONTEXT, [path], ["langgraph-state"])
        self.assertEqual(set(refs), {"project-python", "python-writing-patterns", "project-langgraph-state"})
