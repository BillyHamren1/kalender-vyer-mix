"""Pure source/order controls; no download, build, server, browser or provider."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest import mock


SOURCE = Path(__file__).with_name("compatible-eight-reader-full-app-native-chain-controller-two.py")
SPEC = importlib.util.spec_from_file_location("native_chain", SOURCE)
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)


class NativeChainControls(unittest.TestCase):
    def test_exact_published_head_sources_runner_action_and_distributions_are_locked(self):
        plan = m.load_plan()
        self.assertEqual(plan["canonical"]["current_head"], "e6dc82249e64ab1d037ab592ce29a2358ec526a1")
        self.assertEqual(plan["canonical"]["exact_app_tree"],
                         "3d96301591652f9d86ccbbdf8ff26efcb7180ce9")
        self.assertEqual(plan["runner"]["checkout_action"],
                         "actions/checkout@11d5960a326750d5838078e36cf38b85af677262")
        self.assertEqual(plan["node_distribution"]["archive_sha256"],
                         "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6")
        self.assertEqual(plan["playwright_distribution"]["chromium_revision"], "1187")
        self.assertEqual(set(plan["sources"]), set(m.EXPECTED) | {"owned_process"})
        self.assertEqual(m.sha(m.EXPECTED["node_input_policy"][0]),
                         "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd")
        self.assertEqual(m.sha(m.EXPECTED["sdk_placement_descriptor"][0]),
                         "92fa31abe6cb52454a203b841b2a4bc90cdce5b541dac87c1a668fa83b36396d")

    def test_current_plan_is_explicit_hold_not_skip_or_partial_execution(self):
        plan = m.load_plan()
        self.assertFalse(plan["admission"]["allowed"])
        self.assertFalse(plan["node_distribution"]["long_process_compatible"])
        self.assertIn("sdk_shape_requires_node22_but_distribution_is_node24",
                      plan["admission"]["blockers"])
        self.assertIsNone(plan["playwright_distribution"]["browser_archive_sha256"])
        self.assertFalse(plan["sdk_placement"]["admitted"])
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(),
                         "FULL_APP_NATIVE_CHAIN HOLD exact_distribution_sdk_browser_and_owned_controller_required\n")

    def test_duplicate_unknown_and_changed_source_pin_refuse(self):
        raw = m.PLAN.read_bytes()
        bad = json.loads(raw)
        bad["sources"]["static_server"] = "0" * 64
        for candidate in (json.dumps(bad).encode(), raw + b" ",
                          b'{"schema":"x","schema":"y"}',
                          json.dumps(json.loads(raw) | {"unknown": True}).encode()):
            with self.assertRaises(m.NativeChainHold): m.load_plan(candidate)

    def test_terminal_sequence_requires_all_eleven_exact_ordered_receipts(self):
        good = [{"schema": "compatible-full-app-native-chain-phase.v1", "serial": index,
                 "phase": phase, "complete": True}
                for index, phase in enumerate(m.SEQUENCE, 1)]
        self.assertEqual(m.completed_sequence(good)["phases"], 11)
        for candidate in (good[:-1], list(reversed(good)),
                          [*good[:-1], {**good[-1], "complete": False}],
                          [{**good[0], "private": "secret"}, *good[1:]]):
            with self.assertRaises(m.NativeChainHold): m.completed_sequence(candidate)

    def test_controller_source_has_no_execution_or_network_primitive(self):
        text = SOURCE.read_text()
        for forbidden in ("import subprocess", "import socket", "import urllib", "requests.",
                          "os.system", "Popen(", "docker ", "npm ci", "playwright install"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__": unittest.main()
