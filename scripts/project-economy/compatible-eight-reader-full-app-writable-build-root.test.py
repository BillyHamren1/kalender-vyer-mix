from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-writable-build-root.py"
REAL_MANIFEST = (HERE.parent / "operations-economy" / "scripts" / "project-economy" /
                 "compatible-eight-reader-full-app-compilemanifest.json")
SPEC = importlib.util.spec_from_file_location("writable_build_root", SOURCE)
route = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(route)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


class Fixture:
    def __init__(self, *, bad_receipt_digest=False, preexisting_output=False):
        self.originals = (route.APP_MANIFEST_SHA256, route.MANIFEST_PROJECTION_SHA256,
                          route.SOURCE_FILES, route.SOURCE_BYTES, route.SOURCE_DIRECTORIES)
        self.rows = [("package.json", b'{"name":"x"}\n'),
                     ("src/main.ts", b"export {};\n")]
        projection = bytearray()
        files = []
        for name, raw in self.rows:
            files.append({"path": name, "mode": "100644", "git_blob_sha1": blob(raw),
                          "bytes": len(raw)})
            projection.extend((name + "\0" + blob(raw) + "\0" + str(len(raw)) +
                               "\0" + "100644\n").encode("ascii"))
        manifest = {"schema": "operations-compatible-eight-reader-full-app-compile-source.v1",
                    "repository": "BillyHamren1/kalender-vyer-mix",
                    "source_commit": route.SOURCE_COMMIT, "source_tree": route.SOURCE_TREE,
                    "tree_truncated": False, "runtime_admission": False, "files": files}
        self.manifest_raw = canonical(manifest)
        route.APP_MANIFEST_SHA256 = hashlib.sha256(self.manifest_raw).hexdigest()
        route.MANIFEST_PROJECTION_SHA256 = hashlib.sha256(projection).hexdigest()
        route.SOURCE_FILES = 2
        route.SOURCE_BYTES = sum(len(raw) for _, raw in self.rows)
        route.SOURCE_DIRECTORIES = 1

        self.root = Path(tempfile.mkdtemp(prefix="writable-build-root-test-"))
        self.source_parent = self.root / "source-parent"
        self.build_parent = self.root / "build-parent"
        self.source_root = self.source_parent / route.SOURCE_ROOT_LEAF
        self.attempt = self.build_parent / route.ATTEMPT_LEAF
        self.build_root = self.attempt / route.BUILD_ROOT_LEAF
        for directory in (self.source_parent, self.build_parent, self.source_root,
                          self.attempt, self.build_root):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.chmod(0o700)
        for name, raw in self.rows:
            path = self.source_root / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(raw)
            path.chmod(0o400)
        (self.source_root / "src").chmod(0o500)
        self.source_root.chmod(0o500)

        source_root_fd = os.open(self.source_root,
                                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            manifest_rows, directories = route._manifest(self.manifest_raw)
            _, source_digest = route._scan(source_root_fd, manifest_rows, directories,
                                            0o500, 0o400, route.Deadline(5))
            source_identity = list(route.identity(os.fstat(source_root_fd)))
        finally:
            os.close(source_root_fd)
        receipt = {
            "schema": "compatible-full-app-read-only-tree-evidence.v2",
            "source_commit": route.SOURCE_COMMIT, "source_tree": route.SOURCE_TREE,
            "app_manifest_sha256": route.APP_MANIFEST_SHA256,
            "manifest_projection_sha256": route.MANIFEST_PROJECTION_SHA256,
            "materializer_receipt_sha256": "a" * 64,
            "started_receipt_sha256": "b" * 64,
            "source_files": route.SOURCE_FILES, "source_bytes": route.SOURCE_BYTES,
            "source_directories_excluding_root": route.SOURCE_DIRECTORIES,
            "pre_root_identity": source_identity, "post_root_identity": source_identity,
            "pre_identity_sha256": "c" * 64,
            "post_identity_sha256": ("0" * 64 if bad_receipt_digest else source_digest),
            "authorized_identity_changes": ["mode", "ctime_ns"],
            "file_mode": "0400", "directory_mode": "0500",
            "full_tree_read_only": True, "immutable_filesystem": False,
            "root_purpose": "immutable_source_snapshot_only",
            "same_root_install_or_build": False,
            "derived_writable_build_root_required": True,
            "derived_writable_build_root_admission": False,
            "post_build_dist_verification": False, "runtime_admission": False,
        }
        self.read_only_raw = canonical(receipt)
        self.read_only_path = self.source_parent / route.READ_ONLY_RECEIPT_LEAF
        self.read_only_path.write_bytes(self.read_only_raw)
        self.read_only_path.chmod(0o600)
        if preexisting_output:
            output = self.attempt / route.OUTPUT_LEAF
            output.write_bytes(b"preexisting")
            output.chmod(0o600)
        paths = (self.source_parent, self.source_root, self.read_only_path,
                 self.build_parent, self.attempt, self.build_root)
        flags = (os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.fds = [os.open(path, flag) for path, flag in zip(paths, flags)]

    def args(self):
        return (self.manifest_raw, self.read_only_raw, *self.fds)

    def close(self):
        for fd in self.fds:
            try:
                os.close(fd)
            except OSError:
                pass
        (self.source_root / "src").chmod(0o700)
        self.source_root.chmod(0o700)
        shutil.rmtree(self.root, ignore_errors=True)
        (route.APP_MANIFEST_SHA256, route.MANIFEST_PROJECTION_SHA256,
         route.SOURCE_FILES, route.SOURCE_BYTES, route.SOURCE_DIRECTORIES) = self.originals


class WritableBuildRootTests(unittest.TestCase):
    def test_real_pretty_manifest_is_duplicate_safe_and_exact(self):
        rows, directories = route._manifest(REAL_MANIFEST.read_bytes())
        self.assertEqual(len(rows), 2_445)
        self.assertEqual(sum(row["bytes"] for row in rows.values()), 20_984_073)
        self.assertEqual(len(directories), 220)

    def test_complete_copy_is_distinct_writable_and_never_admits_execution(self):
        value = Fixture()
        try:
            raw = route.derive_writable_build_root(*value.args())
            receipt = json.loads(raw)
            self.assertEqual(receipt["schema"],
                             "compatible-full-app-writable-build-root-evidence.v1")
            self.assertTrue(receipt["complete_source_join"])
            self.assertFalse(receipt["same_root"])
            self.assertFalse(receipt["sdk_routing"])
            self.assertFalse(receipt["npm_ci_admitted"])
            self.assertFalse(receipt["app_build_admitted"])
            self.assertFalse(receipt["post_build_dist_verification"])
            self.assertFalse(receipt["runtime_admission"])
            for name, expected in value.rows:
                copied = value.build_root / name
                self.assertEqual(copied.read_bytes(), expected)
                self.assertEqual(stat.S_IMODE(copied.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((value.build_root / "src").stat().st_mode), 0o700)
            self.assertNotEqual((value.source_root.stat().st_dev, value.source_root.stat().st_ino),
                                (value.build_root.stat().st_dev, value.build_root.stat().st_ino))
        finally:
            value.close()

    def test_false_read_only_digest_quarantines_with_original_cause(self):
        value = Fixture(bad_receipt_digest=True)
        try:
            with self.assertRaisesRegex(
                    route.DerivationFailure,
                    "^compatible_full_app_writable_build_root_denied$"):
                route.derive_writable_build_root(*value.args())
            self.assertFalse(value.attempt.exists())
            self.assertTrue((value.build_parent / route.QUARANTINE_LEAF).is_dir())
        finally:
            value.close()

    def test_substituted_external_build_fd_is_quarantined(self):
        value = Fixture()
        outside = value.root / "outside"
        outside.mkdir(mode=0o700)
        outside_fd = os.open(outside, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        args = list(value.args())
        args[-1] = outside_fd
        try:
            with self.assertRaises(route.DerivationFailure):
                route.derive_writable_build_root(*args)
            self.assertFalse(value.attempt.exists())
            self.assertTrue((value.build_parent / route.QUARANTINE_LEAF).is_dir())
            self.assertTrue(outside.is_dir())
        finally:
            os.close(outside_fd)
            value.close()

    def test_partial_copy_failure_retains_whole_quarantine(self):
        value = Fixture()
        original = route._copy_file
        calls = 0

        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise route.DerivationFailure("synthetic copy failure")
            return original(*args, **kwargs)

        try:
            with mock.patch.object(route, "_copy_file", side_effect=fail_second):
                with self.assertRaisesRegex(route.DerivationFailure,
                                            "^synthetic copy failure$"):
                    route.derive_writable_build_root(*value.args())
            quarantine = value.build_parent / route.QUARANTINE_LEAF
            self.assertTrue(quarantine.is_dir())
            self.assertFalse(value.attempt.exists())
            self.assertTrue(any((quarantine / route.BUILD_ROOT_LEAF).rglob("*")))
        finally:
            value.close()

    def test_preexisting_output_is_never_overwritten_and_attempt_is_quarantined(self):
        value = Fixture(preexisting_output=True)
        try:
            with self.assertRaises(route.DerivationFailure):
                route.derive_writable_build_root(*value.args())
            retained = value.build_parent / route.QUARANTINE_LEAF / route.OUTPUT_LEAF
            self.assertEqual(retained.read_bytes(), b"preexisting")
        finally:
            value.close()

    def test_final_build_root_path_substitution_is_denied_and_retained(self):
        value = Fixture()
        original = route._write_once

        def substitute_then_write(attempt_fd, raw):
            os.rename(route.BUILD_ROOT_LEAF, "renamed-original-build-root",
                      src_dir_fd=attempt_fd, dst_dir_fd=attempt_fd)
            os.mkdir(route.BUILD_ROOT_LEAF, mode=0o700, dir_fd=attempt_fd)
            return original(attempt_fd, raw)

        try:
            with mock.patch.object(route, "_write_once", side_effect=substitute_then_write):
                with self.assertRaisesRegex(route.DerivationFailure,
                                            "quarantine_incomplete"):
                    route.derive_writable_build_root(*value.args())
            self.assertTrue((value.attempt / "renamed-original-build-root" /
                             "package.json").is_file())
            self.assertTrue((value.attempt / route.BUILD_ROOT_LEAF).is_dir())
        finally:
            value.close()

    def test_unbound_attempt_is_not_moved(self):
        value = Fixture()
        alien = value.root / "alien"
        alien.mkdir(mode=0o700)
        alien_fd = os.open(alien, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        args = list(value.args())
        args[-2] = alien_fd
        try:
            with self.assertRaises(route.DerivationFailure):
                route.derive_writable_build_root(*args)
            self.assertTrue(value.attempt.is_dir())
            self.assertTrue(alien.is_dir())
        finally:
            os.close(alien_fd)
            value.close()

    def test_quarantine_substitution_is_non_destructive_and_detected(self):
        value = Fixture(bad_receipt_digest=True)
        moved = value.build_parent / "renamed-original"
        real = route._rename_noreplace

        def substitute(parent_fd, source, destination):
            os.rename(source, moved.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
            os.mkdir(source, mode=0o700, dir_fd=parent_fd)
            replacement_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY,
                                     dir_fd=parent_fd)
            try:
                marker = os.open("replacement-marker", os.O_CREAT | os.O_EXCL |
                                 os.O_WRONLY, 0o600, dir_fd=replacement_fd)
                os.close(marker)
            finally:
                os.close(replacement_fd)
            return real(parent_fd, source, destination)

        try:
            with mock.patch.object(route, "_rename_noreplace", side_effect=substitute):
                with self.assertRaisesRegex(route.DerivationFailure,
                                            "quarantine_incomplete"):
                    route.derive_writable_build_root(*value.args())
            self.assertTrue(moved.is_dir())
            self.assertTrue((value.build_parent / route.QUARANTINE_LEAF /
                             "replacement-marker").is_file())
        finally:
            value.close()

    def test_fixed_hold_and_no_process_network_or_delete_surface(self):
        self.assertEqual(route.main(), 78)
        source = SOURCE.read_text("utf-8")
        for forbidden in ("import subprocess", "Popen(", "os.exec", "spawn(",
                          "os.unlink", "os.rmdir", "urllib", "requests", "socket"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
