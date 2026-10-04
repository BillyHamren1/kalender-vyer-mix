import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SOURCE = Path(__file__).with_name("compatible-eight-reader-full-app-playwright-native-inputs-guard-three.py")
SPEC = importlib.util.spec_from_file_location("playwright_inputs_three", SOURCE)
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)


class InputControls(unittest.TestCase):
    def test_exact_revision_packages_sources_and_current_head_are_locked(self):
        value = m.load()
        self.assertEqual(value["canonical"]["current_head"],
                         "834f91ed842ab26a54160a7e43716db3c022def5")
        self.assertEqual(value["canonical"]["current_tree"],
                         "00925178686c18aa6f69ea9f85655e1f76fb51b8")
        self.assertEqual(value["browser"]["revision"], "1187")
        self.assertEqual(value["browser"]["version"], "140.0.7339.16")
        self.assertEqual(set(value["packages"]), {"@playwright/test", "playwright", "playwright-core"})
        self.assertEqual(value["owned_controller_inputs"]["static_server_sha256"],
                         "9a73fddf2d2a8e0de1692274ef2b9ef2e031466705948ff038e43c98ae7da93a")

    def test_exact_current_404_transition_is_additive_and_refetch_gated(self):
        value = m.load(); transition = value["publication_transition"]
        self.assertEqual(transition["observed_404_at_current_path"],
                         "scripts/project-economy/compatible-eight-reader-full-app-playwright-native-inputs-two.json")
        self.assertEqual(transition["candidate_additive_path"],
                         "scripts/project-economy/compatible-eight-reader-full-app-playwright-native-inputs-three.json")
        self.assertTrue(transition["candidate_additive"])
        self.assertTrue(transition["outer_refetch_required"])

    def test_archive_and_owned_controller_remain_explicit_hold(self):
        value = m.load()
        self.assertIsNone(value["browser"]["archive_sha256"])
        owned = value["owned_controller_inputs"]["owned_process"]
        self.assertTrue(owned["present_at_current"])
        self.assertEqual(owned["git_blob_sha1"], "11c764813b6ad04337d07ff89886602b98d1bea8")
        self.assertEqual(owned["bytes"], 11439)
        self.assertNotIn("owned_process_source_not_in_operations_closure",
                         value["admission"]["blockers"])
        self.assertIsNone(value["owned_controller_inputs"]["static_browser_controller_sha256"])
        self.assertFalse(value["admission"]["allowed"])

    def test_modified_duplicate_unknown_or_whitespace_descriptor_refuses(self):
        raw = m.DESCRIPTOR.read_bytes(); changed = json.loads(raw)
        changed["browser"]["revision"] = "1188"
        unknown = json.loads(raw); unknown["private"] = True
        for candidate in (json.dumps(changed).encode(), json.dumps(unknown).encode(), raw + b" ",
                          b'{"schema":"a","schema":"b"}'):
            with self.assertRaises(m.InputFailure): m.load(candidate)

    def test_small_tree_fingerprint_is_deterministic_and_mutation_changes_it(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve(); (root / "nested").mkdir()
            (root / "a").write_bytes(b"alpha"); (root / "a").chmod(0o600)
            (root / "nested" / "b").write_bytes(b"beta"); (root / "nested" / "b").chmod(0o500)
            first = m.observe_tree(root, maximum_files=2, maximum_bytes=9, seconds=2)
            self.assertEqual(first, m.observe_tree(root, maximum_files=2, maximum_bytes=9, seconds=2))
            (root / "a").write_bytes(b"ALPHA")
            self.assertNotEqual(first["tree_fingerprint"],
                                m.observe_tree(root, maximum_files=2, maximum_bytes=9, seconds=2)["tree_fingerprint"])

    def test_tree_refuses_symlink_hardlink_and_bounds(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve(); leaf = root / "a"; leaf.write_bytes(b"x"); leaf.chmod(0o600)
            (root / "link").symlink_to(leaf)
            with self.assertRaises(m.InputFailure): m.observe_tree(root, seconds=2)
            (root / "link").unlink(); os.link(leaf, root / "hard")
            with self.assertRaises(m.InputFailure): m.observe_tree(root, seconds=2)

    def test_tree_binds_directories_and_applies_total_entry_cap_before_sort(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve(); (root / "one").mkdir(); (root / "one" / "a").write_bytes(b"x")
            first = m.observe_tree(root, maximum_files=1, maximum_entries=2,
                                   maximum_directories=1, maximum_bytes=1, seconds=2)
            self.assertEqual((first["entries"], first["directories"], first["files"]), (2, 1, 1))
            (root / "two").mkdir()
            with self.assertRaises(m.InputFailure):
                m.observe_tree(root, maximum_files=1, maximum_entries=2,
                               maximum_directories=2, maximum_bytes=1, seconds=2)

    def test_main_is_fixed_hold_and_no_process_or_network_primitive(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(),
                         "FULL_APP_PLAYWRIGHT_INPUTS HOLD archive_sha_and_owned_controller_required\n")
        text = SOURCE.read_text()
        for forbidden in ("subprocess", "socket", "urllib", "requests.", "Popen(", "os.system"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__": unittest.main()
