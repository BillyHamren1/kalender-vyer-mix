#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-sdk-root-custody.py"
spec = importlib.util.spec_from_file_location("sdk_root_custody", SOURCE)
m = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(m)


def source_file(name):
    canonical = HERE / name
    if canonical.is_file():
        return canonical
    return HERE.parent / "operations-economy" / "scripts" / "project-economy" / name


REAL = {
    "scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts": source_file(
        "compatible-eight-reader-full-app-get-adapter.ts"
    ),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs": HERE
    / "compatible-eight-reader-full-app-sdk-shape-test-node24.mjs",
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-source.mjs": source_file(
        "compatible-eight-reader-full-app-sdk-source.mjs"
    ),
}


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = pathlib.Path(self.temp.name) / "parent"
        self.root = self.parent / m.ROOT_LEAF
        self.project = self.root / "scripts" / "project-economy"
        self.project.mkdir(parents=True)
        for relative, source in REAL.items():
            target = self.root / relative
            target.write_bytes(source.read_bytes())
            target.chmod(0o400)
        (self.root / "scripts").chmod(0o500)
        self.project.chmod(0o500)
        self.root.chmod(0o500)
        self.parent.chmod(0o700)
        self.parent_fd = os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.root_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        self.file_fds = {path: os.open(self.root / path, os.O_RDONLY) for path in REAL}

    def close(self):
        for fd in self.file_fds.values():
            os.close(fd)
        os.close(self.root_fd)
        os.close(self.parent_fd)
        for directory in (self.project, self.root / "scripts", self.root, self.parent):
            if directory.exists():
                directory.chmod(0o700)
        self.temp.cleanup()


class CustodyTests(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()

    def tearDown(self):
        self.fx.close()

    def test_success_exact_receipt_and_no_admission(self):
        result = m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)
        receipt = result["receipt"]
        self.assertEqual(receipt["schema"], m.SCHEMA)
        self.assertEqual(receipt["node_version"], "v24.21.0")
        self.assertEqual([row["path"] for row in receipt["files"]], sorted(REAL))
        self.assertTrue(all(receipt[key] is False for key in (
            "placement_to_writable_build_root", "sdk_unit_admitted", "npm_install_admitted",
            "app_build_admitted", "runtime_admission"
        )))
        raw = (self.fx.parent / m.RECEIPT_LEAF).read_bytes()
        self.assertEqual(raw, result["receipt_bytes"])
        self.assertEqual(os.fstat(result["receipt_fd"]).st_ino,
                         (self.fx.parent / m.RECEIPT_LEAF).stat().st_ino)
        os.close(result["receipt_fd"])
        self.assertEqual(stat.S_IMODE((self.fx.parent / m.RECEIPT_LEAF).stat().st_mode), 0o600)

    def test_exact_real_file_hashes_and_package_projection(self):
        for path, expected in m.FILES.items():
            raw = REAL[path].read_bytes()
            self.assertEqual(len(raw), expected["bytes"])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), expected["sha256"])
        result = m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)
        self.assertEqual(result["receipt"]["sdk_package_sha256"], m.SDK_PACKAGE_SHA256)
        os.close(result["receipt_fd"])

    def test_same_length_content_change_and_wrong_mode_denied(self):
        key = sorted(REAL)[0]
        target = self.fx.root / key
        original = target.read_bytes()
        target.chmod(0o600)
        target.write_bytes(bytes([original[0] ^ 1]) + original[1:])
        target.chmod(0o400)
        with self.assertRaises(m.CustodyDenied):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)

        target.chmod(0o600)
        target.write_bytes(original)
        with self.assertRaises(m.CustodyDenied):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)

    def test_extra_missing_and_preexisting_receipt_denied(self):
        extra = self.fx.root / "extra"
        self.fx.root.chmod(0o700)
        extra.write_bytes(b"x")
        extra.chmod(0o400)
        self.fx.root.chmod(0o500)
        with self.assertRaises(m.CustodyDenied):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)
        self.fx.root.chmod(0o700)
        extra.unlink()
        self.fx.root.chmod(0o500)
        (self.fx.parent / m.RECEIPT_LEAF).write_bytes(b"occupied")
        os.chmod(self.fx.parent / m.RECEIPT_LEAF, 0o600)
        with self.assertRaises((m.CustodyDenied, FileExistsError)):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)

    def test_supplied_fd_substitution_and_hardlink_denied(self):
        key = sorted(REAL)[0]
        replacement = tempfile.TemporaryFile()
        replacement.write(REAL[key].read_bytes())
        replacement.flush()
        bad = dict(self.fx.file_fds)
        bad[key] = replacement.fileno()
        with self.assertRaises(m.CustodyDenied):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, bad)
        replacement.close()
        target = self.fx.root / key
        os.chmod(target, 0o600)
        alias = self.fx.parent / "alias"
        os.link(target, alias)
        os.chmod(target, 0o400)
        with self.assertRaises(m.CustodyDenied):
            m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)

    def test_final_root_path_substitution_denied_and_receipt_retained(self):
        real_stat = m.os.stat
        calls = 0

        def changed(path, *args, **kwargs):
            nonlocal calls
            if path == m.ROOT_LEAF:
                calls += 1
                if calls == 2:
                    fake = list(real_stat(path, *args, **kwargs))
                    fake[1] += 1
                    return os.stat_result(fake)
            return real_stat(path, *args, **kwargs)

        with mock.patch.object(m.os, "stat", side_effect=changed):
            with self.assertRaises(m.CustodyDenied):
                m.verify_sdk_root(self.fx.parent_fd, self.fx.root_fd, self.fx.file_fds)
        self.assertTrue((self.fx.parent / m.RECEIPT_LEAF).exists())

    def test_no_process_network_delete_or_ambient_execution(self):
        source = SOURCE.read_text()
        for forbidden in ("subprocess", "socket", "urlopen", "requests", "unlink", "rmdir", "remove(", "execve", "Popen"):
            self.assertNotIn(forbidden, source)
        self.assertNotIn("PATH", source)
        result = subprocess.run(["python3", str(SOURCE)], text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 78)
        self.assertEqual(result.stdout, "compatible-full-app-sdk-root-custody HOLD source-only fd-caller-required\n")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
