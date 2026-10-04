from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-post-build-dist-evidence.py"
SPEC = importlib.util.spec_from_file_location("post_build_dist_evidence", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def identity(value):
    return [getattr(value, field) for field in MODULE.FIELDS]


def identity_digest(value):
    return hashlib.sha256((",".join(str(part) for part in value) + "\n").encode("ascii")).hexdigest()


class DistEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.build = self.base / "build"
        self.evidence = self.base / "evidence"
        self.build.mkdir(mode=0o700)
        self.evidence.mkdir(mode=0o700)
        self.derived_identity = identity(self.build.stat())
        dist = self.build / "dist"
        (dist / "assets").mkdir(parents=True, mode=0o755)
        (dist / "index.html").write_bytes(b"<!doctype html><script src=/assets/app-12345678.js></script>")
        (dist / "assets" / "app-12345678.js").write_bytes(b"console.log('ok')\n")
        os.chmod(dist / "index.html", 0o644)
        os.chmod(dist / "assets" / "app-12345678.js", 0o644)

    def tearDown(self):
        self.temp.cleanup()

    def receipt(self, **changes):
        root_identity = list(self.derived_identity)
        immutable_identity = [1, 2, os.geteuid(), os.getegid(), 16832, 2, 0, 3, 4]
        document = {
            "schema": MODULE.DERIVED_SCHEMA,
            "source_commit": MODULE.SOURCE_COMMIT,
            "source_tree": MODULE.SOURCE_TREE,
            "app_manifest_sha256": MODULE.APP_MANIFEST_SHA256,
            "manifest_projection_sha256": MODULE.MANIFEST_PROJECTION_SHA256,
            "immutable_source_receipt_sha256": "1" * 64,
            "immutable_source_root_identity": immutable_identity,
            "immutable_source_identity_sha256": "2" * 64,
            "writable_build_root_identity": root_identity,
            "writable_build_identity_sha256": "3" * 64,
            "source_files": MODULE.SOURCE_FILES,
            "source_bytes": MODULE.SOURCE_BYTES,
            "source_directories_excluding_root": MODULE.SOURCE_DIRECTORIES,
            "source_root_purpose": "immutable_source_snapshot_only",
            "build_root_purpose": "derived_writable_build_root",
            "same_root": False,
            "file_mode": "0600",
            "directory_mode": "0700",
            "complete_source_join": True,
            "sdk_routing": False,
            "npm_ci_admitted": False,
            "app_build_admitted": False,
            "post_build_dist_verification": False,
            "runtime_admission": False,
        }
        document.update(changes)
        return MODULE.canonical(document)

    def run_produce(self, raw=None, seconds=10):
        receipt_path = self.base / ("derived-" + str(time.monotonic_ns()) + ".json")
        receipt_path.write_bytes(raw or self.receipt())
        os.chmod(receipt_path, 0o400)
        build_fd = os.open(self.build, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        evidence_fd = os.open(self.evidence, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        receipt_fd = os.open(receipt_path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            return MODULE.produce(build_fd, evidence_fd, receipt_fd, seconds)
        finally:
            os.close(receipt_fd)
            os.close(evidence_fd)
            os.close(build_fd)

    def assert_denied(self, raw=None, keep_evidence=False):
        if not keep_evidence and any(self.evidence.iterdir()):
            self.evidence = self.base / ("evidence-" + str(time.monotonic_ns()))
            self.evidence.mkdir(mode=0o700)
        with self.assertRaises(MODULE.DistEvidenceFailure):
            self.run_produce(raw)

    def test_success_three_stable_scans_and_exclusive_receipts(self):
        result = self.run_produce()
        self.assertEqual(result["schema"], MODULE.OUTPUT_SCHEMA)
        self.assertTrue(result["bounded_stable_reread"])
        self.assertTrue(result["derived_root_same_inode_owner_mode_join"])
        self.assertFalse(result["build_execution_provenance"])
        self.assertFalse(result["runtime_admission"])
        self.assertEqual(result["entry_count"], 3)
        for leaf in (MODULE.STARTED_LEAF, MODULE.MANIFEST_LEAF, MODULE.RECEIPT_LEAF):
            path = self.evidence / leaf
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        manifest_raw = (self.evidence / MODULE.MANIFEST_LEAF).read_bytes()
        self.assertEqual(hashlib.sha256(manifest_raw).hexdigest(), result["manifest_sha256"])
        manifest = json.loads(manifest_raw)
        self.assertEqual([row["path"] for row in manifest["rows"]],
                         ["assets", "assets/app-12345678.js", "index.html"])

    def test_duplicate_noncanonical_and_wrong_identity_receipts_denied(self):
        raw = self.receipt()
        self.assert_denied(raw.replace(b'"schema":', b'"schema":"duplicate","schema":', 1))
        self.assert_denied(json.dumps(json.loads(raw), indent=2).encode())
        document = json.loads(raw)
        document["writable_build_root_identity"][1] += 1
        self.assert_denied(MODULE.canonical(document))

    def test_symlink_hidden_hardlink_special_and_suffix_denied(self):
        variants = ["symlink", "hidden", "hardlink", "fifo", "suffix"]
        for variant in variants:
            with self.subTest(variant=variant):
                with tempfile.TemporaryDirectory() as scratch:
                    extra = Path(scratch)
                    target = self.build / "dist" / "assets" / "extra"
                    if variant == "symlink":
                        target.symlink_to("app-12345678.js")
                    elif variant == "hidden":
                        target = self.build / "dist" / ".secret.js"
                        target.write_bytes(b"x")
                    elif variant == "hardlink":
                        os.link(self.build / "dist" / "index.html", target.with_suffix(".html"))
                    elif variant == "fifo":
                        os.mkfifo(target)
                    else:
                        target = target.with_suffix(".exe")
                        target.write_bytes(b"x")
                    self.assert_denied()
                    if target.exists() or target.is_symlink():
                        target.unlink()

    def test_writable_or_executable_file_denied(self):
        target = self.build / "dist" / "index.html"
        for mode in (0o666, 0o744):
            with self.subTest(mode=mode):
                os.chmod(target, mode)
                self.assert_denied()
        os.chmod(target, 0o644)

    def test_entry_and_total_caps_are_global(self):
        with mock.patch.object(MODULE, "MAX_ENTRIES", 2):
            self.assert_denied()
        with mock.patch.object(MODULE, "MAX_TOTAL_BYTES", 4):
            self.assert_denied()

    def test_missing_mandatory_index_or_assets_denied(self):
        (self.build / "dist" / "index.html").rename(self.build / "dist" / "home.html")
        self.assert_denied()

    def test_mutation_between_scans_denied_and_artifacts_retained(self):
        original = MODULE.scan_dist
        calls = 0

        def mutating(*args, **kwargs):
            nonlocal calls
            result = original(*args, **kwargs)
            calls += 1
            if calls == 1:
                target = self.build / "dist" / "index.html"
                target.write_bytes(target.read_bytes() + b"x")
            return result

        with mock.patch.object(MODULE, "scan_dist", side_effect=mutating):
            self.assert_denied()
        self.assertTrue((self.evidence / MODULE.STARTED_LEAF).is_file())
        self.assertFalse((self.evidence / MODULE.RECEIPT_LEAF).exists())

    def test_dist_replacement_between_scans_denied(self):
        original = MODULE.scan_dist
        calls = 0

        def replacing(*args, **kwargs):
            nonlocal calls
            result = original(*args, **kwargs)
            calls += 1
            if calls == 1:
                old = self.build / "dist-old"
                (self.build / "dist").rename(old)
                (self.build / "dist").mkdir(mode=0o755)
                (self.build / "dist" / "assets").mkdir(mode=0o755)
                (self.build / "dist" / "index.html").write_bytes(b"replacement")
                (self.build / "dist" / "assets" / "app-12345678.js").write_bytes(b"x")
            return result

        raw = self.receipt()
        with mock.patch.object(MODULE, "scan_dist", side_effect=replacing):
            self.assert_denied(raw)

    def test_existing_artifact_is_never_overwritten(self):
        marker = self.evidence / MODULE.STARTED_LEAF
        marker.write_bytes(b"keep")
        os.chmod(marker, 0o600)
        self.assert_denied(keep_evidence=True)
        self.assertEqual(marker.read_bytes(), b"keep")

    def test_held_derived_receipt_mutation_during_scan_is_denied(self):
        receipt_path = self.base / "mutable-derived.json"
        receipt_path.write_bytes(self.receipt())
        os.chmod(receipt_path, 0o600)
        build_fd = os.open(self.build, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        evidence_fd = os.open(self.evidence, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        receipt_fd = os.open(receipt_path, os.O_RDONLY | os.O_NOFOLLOW)
        original = MODULE.scan_dist
        calls = 0

        def mutate_after_scan(*args, **kwargs):
            nonlocal calls
            result = original(*args, **kwargs)
            calls += 1
            if calls == 2:
                raw = receipt_path.read_bytes()
                receipt_path.write_bytes(raw[:-1] + (b" " if raw[-1:] != b" " else b"x"))
            return result

        try:
            with mock.patch.object(MODULE, "scan_dist", side_effect=mutate_after_scan):
                with self.assertRaises(MODULE.DistEvidenceFailure):
                    MODULE.produce(build_fd, evidence_fd, receipt_fd, 10)
        finally:
            os.close(receipt_fd)
            os.close(evidence_fd)
            os.close(build_fd)

    def test_derived_receipt_cannot_be_a_dist_member(self):
        receipt_path = self.build / "dist" / "assets" / "build-root-receipt.json"
        receipt_path.write_bytes(self.receipt())
        os.chmod(receipt_path, 0o400)
        build_fd = os.open(self.build, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        evidence_fd = os.open(self.evidence, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        receipt_fd = os.open(receipt_path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            with self.assertRaises(MODULE.DistEvidenceFailure):
                MODULE.produce(build_fd, evidence_fd, receipt_fd, 10)
        finally:
            os.close(receipt_fd)
            os.close(evidence_fd)
            os.close(build_fd)

    def test_deadline_is_finite_and_fail_closed(self):
        with mock.patch.object(time, "monotonic", side_effect=[0.0, 11.0]):
            self.assert_denied()
        with self.assertRaises(MODULE.DistEvidenceFailure):
            MODULE.Deadline(MODULE.MAX_SECONDS + 1)

    def test_source_contains_no_mutation_process_or_network_primitives(self):
        text = SOURCE.read_text()
        forbidden = ("subprocess", "socket.", "urllib", "requests", "shutil.rmtree",
                     "os.unlink", "os.remove", "os.rename", "os.replace", "os.chmod",
                     "os.fchmod", "npm ci", "npm run build")
        for token in forbidden:
            self.assertNotIn(token, text)

    def test_main_is_fixed_source_only_exit(self):
        self.assertEqual(MODULE.main(), 78)


if __name__ == "__main__":
    unittest.main(verbosity=2)
