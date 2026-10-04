import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest import mock


SOURCE = Path(__file__).with_name("compatible-eight-reader-full-app-native-integration-four.py")
SPEC = importlib.util.spec_from_file_location("native_integration_four", SOURCE)
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)


class NativeIntegrationFourControls(unittest.TestCase):
    def test_current_base_and_reviewed_static_sources_are_exact(self):
        value = m.load()
        self.assertEqual(value["canonical"]["base_commit"], "b3e1b36a30e9af5359f7863386263e278aa6202a")
        self.assertEqual(value["canonical"]["base_tree"], "783a7a20ab77032889d62d6515de1f4c5f8324f4")
        self.assertEqual(value["reviewed_sources"]["node_static_server"],
                         "9a73fddf2d2a8e0de1692274ef2b9ef2e031466705948ff038e43c98ae7da93a")
        self.assertEqual(value["reviewed_sources"]["node_static_owner"],
                         "19f25cdfa6e41f5af525897981f84483d790ecc1c15222c324ad1aa5fadca986")
        self.assertEqual(value["reviewed_sources"]["owned_process"], {
            "path": "scripts/project-economy/auth-chain-cleanup-owned-process.py",
            "sha256": "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a",
            "git_blob_sha1": "11c764813b6ad04337d07ff89886602b98d1bea8",
            "bytes": 11439,
            "present_at_base": True,
        })
        self.assertNotIn("owned_process_source_not_in_operations_closure", m.BLOCKERS)
        self.assertEqual(value["reviewed_sources"]["playwright_inputs"],
                         "de440fcd25272eef547729651e77e0f2ffef487a145d90f4e82c9bab468dc93a")
        self.assertEqual(value["reviewed_predecessors"]["integration_three"]["capture_sha256"],
                         "3bb850fd925ceaf35b1061eeb7a81fa62678dabac7437a2b9f8ef4e7335e73ef")
        self.assertEqual(value["reviewed_predecessors"]["playwright_inputs_three"]["capture_sha256"],
                         "cdb6ebf87623bf8f741ab94a2c513653035d7fcb567c4fc91859c58d551f5ebd")
        self.assertTrue(value["reviewed_predecessors"]["playwright_inputs_three"]["canonical_at_base"])
        self.assertTrue(value["reviewed_predecessors"]["playwright_inputs_three"]["outer_refetch_required"])

    def test_runtime_and_workflow_admission_stay_explicitly_blocked(self):
        value = m.load()
        self.assertIsNone(value["node24"]["executable_sha256"])
        self.assertIsNone(value["playwright"]["archive_sha256"])
        self.assertFalse(value["workflow"]["admitted"]); self.assertFalse(value["admission"]["allowed"])
        self.assertEqual(value["admission"]["blockers"], m.BLOCKERS)
        self.assertNotIn("playwright_inputs_three_successor_not_in_operations_closure", m.BLOCKERS)

    def test_changed_unknown_duplicate_or_whitespace_plan_refuses(self):
        raw = m.PLAN.read_bytes(); changed = json.loads(raw); changed["canonical"]["base_tree"] = "0" * 40
        unknown = json.loads(raw); unknown["workflow"]["publish"] = True
        candidates = [json.dumps(changed).encode(), json.dumps(unknown).encode(), raw + b" ",
                      b'{"schema":"a","schema":"b"}']
        for candidate in candidates:
            with self.assertRaises(m.IntegrationFailure): m.load(candidate)

    def test_terminal_order_is_complete_but_never_native_acceptance(self):
        receipts = [{"purpose": purpose, "serial": index, "complete": True}
                    for index, purpose in enumerate(m.SEQUENCE, 1)]
        self.assertEqual(m.verify_terminal(receipts), {"schema": "compatible-full-app-native-integration-terminal.v1",
                                                       "steps": 12, "native_acceptance": False})
        with self.assertRaises(m.IntegrationFailure): m.verify_terminal(receipts[:-1])
        changed = [dict(row) for row in receipts]; changed[4]["purpose"] = "ambient-node"
        with self.assertRaises(m.IntegrationFailure): m.verify_terminal(changed)

    def test_cli_is_fixed_hold_and_source_has_no_execution_or_network_primitive(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(), "FULL_APP_NATIVE_INTEGRATION_FOUR HOLD external_gates_required\n")
        source = SOURCE.read_text()
        for forbidden in ("subprocess", "socket", "urllib", "requests.", "Popen(", "os.system", "http.client"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__": unittest.main()
