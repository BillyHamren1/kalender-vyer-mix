from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-sdk-placement-node24-controller.py"
spec = importlib.util.spec_from_file_location("sdk_placement", SOURCE)
m = importlib.util.module_from_spec(spec); assert spec.loader is not None; spec.loader.exec_module(m)
ROOT = HERE.parent


def imported(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); assert spec.loader is not None
    spec.loader.exec_module(module); return module


CUSTODY = imported(ROOT / "operations-sdk-node24-stage" /
                   "compatible-eight-reader-full-app-sdk-root-custody.py", "sdk_custody")
WRITABLE_SOURCE = (ROOT / "operations-writable-build-root-stage" /
                   "compatible-eight-reader-full-app-writable-build-root.py")
NODE24_RUNNER = (ROOT / "operations-node24-successor-stage-three" /
                 "compatible-eight-reader-full-app-long-process-node24.py")
BASE_RUNNER = (ROOT / "operations-economy" / "scripts" / "project-economy" /
               "compatible-eight-reader-full-app-long-process.py")
SDK_SOURCES = {
    path: ((ROOT / "operations-sdk-node24-stage" / path.rsplit("/", 1)[1])
           if "shape-test-node24" in path else
           (ROOT / "operations-economy" / "scripts" / "project-economy" /
            path.rsplit("/", 1)[1]))
    for path in m.SDK_FILES
}


class FakeWritable:
    APP_MANIFEST_SHA256 = m.APP_MANIFEST_SHA256

    @staticmethod
    def _manifest(raw):
        if raw != b"synthetic exact manifest":
            raise RuntimeError("bad manifest")
        return {}, set()

    @staticmethod
    def _scan(root_fd, rows, directories, directory_mode, file_mode, deadline):
        deadline.check(); root = os.fstat(root_fd)
        if not rows:
            with os.scandir(root_fd) as entries:
                if next(entries, None) is not None:
                    raise RuntimeError("not empty")
            return {".": m.identity(root)}, "a" * 64
        expected = set(m.SDK_FILES)
        if set(rows) != expected or directories != {"scripts", "scripts/project-economy"}:
            raise RuntimeError("bad combined projection")
        scripts = os.open("scripts", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        project = os.open("project-economy", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                          dir_fd=scripts)
        try:
            if stat.S_IMODE(os.fstat(scripts).st_mode) != 0o700 or stat.S_IMODE(os.fstat(project).st_mode) != 0o700:
                raise RuntimeError("mode")
            with os.scandir(project) as entries:
                if {entry.name for entry in entries} != {p.rsplit('/', 1)[1] for p in expected}:
                    raise RuntimeError("layout")
            nodes = {".": m.identity(root), "scripts": m.identity(os.fstat(scripts)),
                     "scripts/project-economy": m.identity(os.fstat(project))}
            for path, (sha, size) in m.SDK_FILES.items():
                leaf = path.rsplit("/", 1)[1]
                fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=project)
                try:
                    saved = os.fstat(fd); raw = os.pread(fd, size + 1, 0)
                    if stat.S_IMODE(saved.st_mode) != 0o600 or len(raw) != size or hashlib.sha256(raw).hexdigest() != sha:
                        raise RuntimeError("file")
                    nodes[path] = m.identity(saved)
                finally:
                    os.close(fd)
            digest = hashlib.sha256(json.dumps(nodes, sort_keys=True).encode()).hexdigest()
            return nodes, digest
        finally:
            os.close(project); os.close(scripts)


def canonical(value, newline=False):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
    return raw + (b"\n" if newline else b"")


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sdk-placement-")
        self.top = pathlib.Path(self.temp.name)
        self.build_parent = self.top / "build-parent"; self.build_parent.mkdir(mode=0o700)
        self.attempt = self.build_parent / m.ATTEMPT_LEAF; self.attempt.mkdir(mode=0o700)
        self.build = self.attempt / m.BUILD_ROOT_LEAF; self.build.mkdir(mode=0o700)
        self.build_parent_fd = os.open(self.build_parent, os.O_RDONLY | os.O_DIRECTORY)
        self.attempt_fd = os.open(self.attempt, os.O_RDONLY | os.O_DIRECTORY)
        self.build_fd = os.open(self.build, os.O_RDONLY | os.O_DIRECTORY)

        writable = {key: False for key in m.WRITABLE_KEYS}
        writable.update({
            "schema": m.WRITABLE_RECEIPT_SCHEMA, "source_commit": "809f64e0fd98322c53d9c4e9697df5b515303812",
            "source_tree": "3d96301591652f9d86ccbbdf8ff26efcb7180ce9",
            "app_manifest_sha256": m.APP_MANIFEST_SHA256,
            "manifest_projection_sha256": m.MANIFEST_PROJECTION_SHA256,
            "immutable_source_receipt_sha256": "2" * 64, "immutable_source_root_identity": [1] * 9,
            "immutable_source_identity_sha256": "3" * 64,
            "writable_build_root_identity": list(m.identity(os.fstat(self.build_fd))),
            "writable_build_identity_sha256": "a" * 64, "source_files": 2445,
            "source_bytes": 20_984_073, "source_directories_excluding_root": 220,
            "source_root_purpose": "immutable_source_snapshot_only",
            "build_root_purpose": "derived_writable_build_root", "same_root": False,
            "file_mode": "0600", "directory_mode": "0700", "complete_source_join": True,
            "sdk_routing": False, "npm_ci_admitted": False, "app_build_admitted": False,
            "post_build_dist_verification": False, "runtime_admission": False,
        })
        self.writable_raw = canonical(writable)
        self.writable_path = self.attempt / m.WRITABLE_RECEIPT_LEAF
        self.writable_path.write_bytes(self.writable_raw); self.writable_path.chmod(0o600)
        self.writable_fd = os.open(self.writable_path, os.O_RDONLY)

        self.sdk_parent = self.top / "sdk-parent"; self.sdk_parent.mkdir(mode=0o700)
        self.sdk_root = self.sdk_parent / m.SDK_ROOT_LEAF
        project = self.sdk_root / "scripts" / "project-economy"; project.mkdir(parents=True)
        for relative, source in SDK_SOURCES.items():
            target = self.sdk_root / relative; target.write_bytes(source.read_bytes()); target.chmod(0o400)
        project.chmod(0o500); (self.sdk_root / "scripts").chmod(0o500); self.sdk_root.chmod(0o500)
        self.sdk_parent_fd = os.open(self.sdk_parent, os.O_RDONLY | os.O_DIRECTORY)
        self.sdk_root_fd = os.open(self.sdk_root, os.O_RDONLY | os.O_DIRECTORY)
        self.sdk_file_fds = {path: os.open(self.sdk_root / path, os.O_RDONLY) for path in m.SDK_FILES}
        custody = CUSTODY.verify_sdk_root(self.sdk_parent_fd, self.sdk_root_fd, self.sdk_file_fds)
        os.close(custody["receipt_fd"]); self.sdk_raw = custody["receipt_bytes"]
        self.sdk_receipt_fd = os.open(self.sdk_parent / m.SDK_ROOT_RECEIPT_LEAF, os.O_RDONLY)

        self.dist = self.top / "distribution"; (self.dist / "bin").mkdir(parents=True)
        (self.dist / "lib/node_modules/npm/bin").mkdir(parents=True)
        self.node_path = self.dist / m.NODE_RELATIVE; self.node_path.write_bytes(b"exact-node"); self.node_path.chmod(0o500)
        self.npm_path = self.dist / m.NPM_RELATIVE; self.npm_path.write_bytes(b"exact-npm"); self.npm_path.chmod(0o400)
        os.symlink(m.NPM_LINK_TARGET, self.dist / m.NPM_LINK_RELATIVE)
        for directory in reversed([self.dist / "lib/node_modules/npm/bin", self.dist / "lib/node_modules/npm",
                                   self.dist / "lib/node_modules", self.dist / "lib", self.dist / "bin", self.dist]):
            directory.chmod(0o700)
        self.distribution_fd = os.open(self.dist, os.O_RDONLY | os.O_DIRECTORY)
        self.node_fd = os.open(self.node_path, os.O_RDONLY); self.npm_fd = os.open(self.npm_path, os.O_RDONLY)
        node_st = os.fstat(self.node_fd); npm_st = os.fstat(self.npm_fd)
        extraction = {
            "schema": m.EXTRACTION_RECEIPT_SCHEMA, "preparation_sha256": m.PREPARATION_SHA256,
            "policy_sha256": m.POLICY_SHA256, "archive_sha256": m.ARCHIVE_SHA256,
            "archive_identity": [1] * 9, "archive_root": m.ARCHIVE_ROOT,
            "distribution_root_identity": list(m.identity(os.fstat(self.distribution_fd))),
            "node_version": m.NODE_VERSION, "npm_version": m.NPM_VERSION,
            "members": 1, "expanded_bytes": 18,
            "node": {"relative_path": m.NODE_RELATIVE, "sha256": hashlib.sha256(b"exact-node").hexdigest(),
                     "bytes": 10, "identity": list(m.identity(node_st))},
            "npm_cli": {"relative_path": m.NPM_RELATIVE, "sha256": hashlib.sha256(b"exact-npm").hexdigest(),
                        "bytes": 9, "identity": list(m.identity(npm_st))},
            "npm_link": {"relative_path": m.NPM_LINK_RELATIVE, "target": m.NPM_LINK_TARGET,
                         "identity": list(m.identity(os.lstat(self.dist / m.NPM_LINK_RELATIVE)))},
            "node_executed": False, "runtime_admission": False,
        }
        self.extraction_raw = canonical(extraction)
        self.extraction_path = self.top / "extraction.json"; self.extraction_path.write_bytes(self.extraction_raw)
        self.extraction_path.chmod(0o600); self.extraction_fd = os.open(self.extraction_path, os.O_RDONLY)

    def args(self):
        return (b"synthetic exact manifest", WRITABLE_SOURCE.read_bytes(), self.writable_raw,
                self.sdk_raw, self.extraction_raw, NODE24_RUNNER.read_bytes(), BASE_RUNNER.read_bytes(),
                self.build_parent_fd, self.attempt_fd, self.build_fd, self.writable_fd,
                self.sdk_parent_fd, self.sdk_root_fd, self.sdk_receipt_fd, self.sdk_file_fds,
                self.extraction_fd, self.distribution_fd, self.node_fd, self.npm_fd)

    def close(self):
        for fd in [*self.sdk_file_fds.values(), self.npm_fd, self.node_fd, self.distribution_fd,
                   self.extraction_fd, self.sdk_receipt_fd, self.sdk_root_fd, self.sdk_parent_fd,
                   self.writable_fd, self.build_fd, self.attempt_fd, self.build_parent_fd]:
            try: os.close(fd)
            except OSError: pass
        for root, dirs, files in os.walk(self.top, topdown=False):
            for name in files:
                try: os.chmod(pathlib.Path(root) / name, 0o600)
                except FileNotFoundError: pass
            for name in dirs:
                try: os.chmod(pathlib.Path(root) / name, 0o700)
                except FileNotFoundError: pass
        self.temp.cleanup()


class PlacementTests(unittest.TestCase):
    def setUp(self): self.fx = Fixture()
    def tearDown(self): self.fx.close()

    def call(self):
        with mock.patch.object(m, "_load_source", return_value=FakeWritable):
            return m.place_and_plan_sdk(*self.fx.args())

    def test_success_exact_placement_and_nonadmission(self):
        raw = self.call(); value = json.loads(raw)
        self.assertEqual(value["schema"], m.PLACEMENT_SCHEMA)
        self.assertEqual(value["node_version"], "v24.21.0")
        self.assertEqual(value["execution_relative_path"], m.SDK_TEST)
        self.assertEqual({row["path"] for row in value["files"]}, set(m.SDK_FILES))
        for key in ("sdk_root_producer_provenance", "node_executed", "npm_ci_admitted",
                    "sdk_unit_admitted", "app_build_admitted",
                    "post_build_dist_verification", "runtime_admission"):
            self.assertIs(value[key], False)
        for path, (sha, size) in m.SDK_FILES.items():
            target = self.fx.build / path
            self.assertEqual(target.stat().st_size, size)
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), sha)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_partial_copy_failure_quarantines_without_deletion(self):
        real = m._copy; calls = 0
        def fail(*args, **kwargs):
            nonlocal calls; calls += 1
            if calls == 2: raise OSError("synthetic partial placement")
            return real(*args, **kwargs)
        with mock.patch.object(m, "_load_source", return_value=FakeWritable), mock.patch.object(m, "_copy", side_effect=fail):
            with self.assertRaises(m.PlacementFailure): m.place_and_plan_sdk(*self.fx.args())
        self.assertFalse(self.fx.attempt.exists())
        retained = self.fx.build_parent / m.QUARANTINE_LEAF
        self.assertTrue(retained.is_dir())
        self.assertTrue(any((retained / m.BUILD_ROOT_LEAF / "scripts/project-economy").iterdir()))

    def test_wrong_sdk_fd_and_preexisting_scripts_quarantine(self):
        bad = tempfile.TemporaryFile(); bad.write(SDK_SOURCES[sorted(m.SDK_FILES)[0]].read_bytes()); bad.flush()
        self.fx.sdk_file_fds[sorted(m.SDK_FILES)[0]] = bad.fileno()
        with mock.patch.object(m, "_load_source", return_value=FakeWritable):
            with self.assertRaises(m.PlacementFailure): m.place_and_plan_sdk(*self.fx.args())
        self.assertTrue((self.fx.build_parent / m.QUARANTINE_LEAF).exists())
        bad.close()

    def test_preexisting_scripts_or_receipt_never_overwritten(self):
        (self.fx.build / "scripts").mkdir(mode=0o700)
        marker = self.fx.attempt / m.PLACEMENT_RECEIPT_LEAF
        marker.write_bytes(b"retained foreign marker"); marker.chmod(0o600)
        with mock.patch.object(m, "_load_source", return_value=FakeWritable):
            with self.assertRaises(m.PlacementFailure): m.place_and_plan_sdk(*self.fx.args())
        retained = self.fx.build_parent / m.QUARANTINE_LEAF
        self.assertEqual((retained / m.PLACEMENT_RECEIPT_LEAF).read_bytes(),
                         b"retained foreign marker")
        self.assertTrue((retained / m.BUILD_ROOT_LEAF / "scripts").is_dir())

    def test_duplicate_receipt_key_is_denied_and_retained(self):
        self.fx.sdk_raw = self.fx.sdk_raw.replace(
            b'"app_build_admitted":false,',
            b'"app_build_admitted":false,"app_build_admitted":false,', 1)
        os.close(self.fx.sdk_receipt_fd)
        receipt_path = self.fx.sdk_parent / m.SDK_ROOT_RECEIPT_LEAF
        receipt_path.chmod(0o600); receipt_path.write_bytes(self.fx.sdk_raw)
        self.fx.sdk_receipt_fd = os.open(receipt_path, os.O_RDONLY)
        with mock.patch.object(m, "_load_source", return_value=FakeWritable):
            with self.assertRaises(m.PlacementFailure): m.place_and_plan_sdk(*self.fx.args())
        self.assertTrue((self.fx.build_parent / m.QUARANTINE_LEAF).is_dir())

    def test_wrong_node_version_or_tool_fd_denied_before_placement(self):
        value = json.loads(self.fx.extraction_raw); value["node_version"] = "v24.21.1"
        self.fx.extraction_raw = canonical(value)
        os.close(self.fx.extraction_fd); self.fx.extraction_path.write_bytes(self.fx.extraction_raw)
        self.fx.extraction_fd = os.open(self.fx.extraction_path, os.O_RDONLY)
        with mock.patch.object(m, "_load_source", return_value=FakeWritable):
            with self.assertRaises(m.PlacementFailure): m.place_and_plan_sdk(*self.fx.args())
        self.assertTrue((self.fx.build_parent / m.QUARANTINE_LEAF).exists())

    def test_source_hashes_and_no_process_network_or_delete(self):
        self.assertEqual(hashlib.sha256(WRITABLE_SOURCE.read_bytes()).hexdigest(), m.WRITABLE_SOURCE_SHA256)
        self.assertEqual(hashlib.sha256(NODE24_RUNNER.read_bytes()).hexdigest(), m.NODE24_RUNNER_SHA256)
        self.assertEqual(hashlib.sha256(BASE_RUNNER.read_bytes()).hexdigest(), m.BASE_RUNNER_SHA256)
        source = SOURCE.read_text()
        for forbidden in ("subprocess", "socket", "urlopen", "requests", "os.unlink", "os.rmdir"):
            self.assertNotIn(forbidden, source)
        result = subprocess.run(["python3", str(SOURCE)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 78)
        self.assertEqual(result.stdout,
                         "compatible-full-app-sdk-placement-node24 HOLD producers_npm_and_execution_required\n")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__": unittest.main(verbosity=2)
