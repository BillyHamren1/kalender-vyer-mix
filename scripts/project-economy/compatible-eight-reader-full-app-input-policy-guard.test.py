import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-input-policy-guard.py"
spec = importlib.util.spec_from_file_location("input_policy_guard", SOURCE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class Controls(unittest.TestCase):
    def test_exact_frozen_policies_validate_but_do_not_admit(self):
        node, sdk = m.validate()
        self.assertRegex(node, r"^[0-9a-f]{64}$"); self.assertRegex(sdk, r"^[0-9a-f]{64}$")
        document = json.loads(m.NODE.read_text())
        self.assertFalse(document["adapter"]["compatible"])
        self.assertFalse(any(document["admission"][key] for key in
                             ("download", "extract", "npm_network", "npm_ci", "sdk_test", "build")))

    def test_current_adapter_major_mismatch_is_real(self):
        text = m.ADAPTER.read_text()
        self.assertIn(r'r"v22\.[0-9]+\.[0-9]+"', text)
        self.assertNotIn(r'r"v24\.[0-9]+\.[0-9]+"', text)

    def test_duplicate_json_members_refuse(self):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "duplicate.json"; path.write_text('{"a":1,"a":2}')
            with self.assertRaises(Exception): m.load(path)

    def test_guard_has_no_network_child_or_placement_capability(self):
        text = SOURCE.read_text()
        for forbidden in ("subprocess", "urllib", "requests", "http.client", "socket", "os.open",
                          "write_bytes", "write_text", "Popen", "system("):
            self.assertNotIn(forbidden, text)

    def test_sdk_descriptor_is_exclusive_and_precedes_source_snapshot(self):
        document = json.loads(m.SDK.read_text())
        self.assertEqual(document["destination"]["operation"], "exclusive-create-from-captured-source-fd")
        self.assertEqual(document["destination"]["mode"], "0600")
        self.assertTrue(document["receipt"]["must_precede_long_process_source_fd_snapshot"])
        self.assertFalse(document["admission"]["placement"])

    def test_main_is_finite_nonsecret_source_only_marker(self):
        with mock.patch("builtins.print") as output:
            self.assertEqual(m.main(), 0)
        value = output.call_args.args[0]
        self.assertIn("PASS source_only=true", value); self.assertIn("admission=false", value)


if __name__ == "__main__":
    unittest.main()
