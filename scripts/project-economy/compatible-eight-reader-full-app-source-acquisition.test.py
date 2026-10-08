"""Support/negative controls only; native exact809f acquisition remains a CI gate."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "source_acquisition", HERE / "compatible-eight-reader-full-app-source-acquisition.py")
a = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(a)
MANIFEST_RAW = (HERE / "compatible-eight-reader-full-app-compilemanifest.json").read_bytes()
PATHS = a.manifest_paths(MANIFEST_RAW)


class FakeCustody:
    UNCERTAIN_CHILDREN = {}
    REAPING_CHILDREN = {}

    @staticmethod
    def proc_identity_valid():
        return True


class FakeRunner:
    def __init__(self, mode: str = "replace-archive") -> None:
        self.mode = mode
        self.calls = []

    def __call__(self, custody, argv, source_fd, journal_fd, serial, deadline, extra_fds=()):
        self.calls.append((argv, source_fd, serial, extra_fds))
        deadline.check()
        if argv == a.probe_command("head"):
            return (a.COMMIT + "\n").encode()
        if argv == a.probe_command("tree"):
            return (a.TREE + "\n").encode()
        if argv == a.probe_command("clean"):
            return b""
        if self.mode == "raise":
            raise a.AcquisitionFailure("test refusal")
        archive_fd = extra_fds[0]
        if self.mode == "replace-archive":
            parent = Path(os.readlink("/proc/self/fd/" + str(archive_fd))).parent
            original = parent / a.ARCHIVE_NAME
            original.rename(parent / "displaced")
            original.write_bytes(b"replacement")
            original.chmod(0o600)
            os.write(archive_fd, b"held-original")
        elif self.mode == "replace-source":
            source = Path(os.readlink("/proc/self/fd/" + str(source_fd)))
            moved = source.parent / "moved-source"
            source.rename(moved)
            source.mkdir()
            os.write(archive_fd, b"held-original")
        else:
            raise AssertionError("unexpected fake mode")
        return b""


def private(path: Path) -> None:
    path.mkdir()
    path.chmod(0o700)


class SourceAcquisitionControls(unittest.TestCase):
    def test_exact_manifest_and_literal_command(self):
        self.assertEqual(len(PATHS), 2_445)
        self.assertEqual(len(set(PATHS)), 2_445)
        command = a.archive_command(17, PATHS)
        self.assertEqual(command[:11], (
            "/usr/bin/git", "--no-replace-objects", "--literal-pathspecs", "-c", "tar.umask=0022",
            "archive", "--format=tar", "--prefix=compatible-app-809f/",
            "--output=/proc/self/fd/17", a.COMMIT, "--"))
        self.assertEqual(command[11:], PATHS)
        self.assertNotIn("--worktree-attributes", command)

    def test_manifest_commit_tree_count_total_and_paths_are_closed(self):
        base = json.loads(MANIFEST_RAW)
        mutations = []
        for key, value in (("source_commit", "0" * 40), ("source_tree", "1" * 40),
                           ("tree_truncated", True), ("runtime_admission", True)):
            changed = json.loads(MANIFEST_RAW)
            changed[key] = value
            mutations.append(changed)
        changed = json.loads(MANIFEST_RAW)
        changed["files"] = changed["files"][:-1]
        mutations.append(changed)
        changed = json.loads(MANIFEST_RAW)
        changed["files"][1]["path"] = changed["files"][0]["path"]
        mutations.append(changed)
        changed = json.loads(MANIFEST_RAW)
        changed["files"][0]["path"] = "../outside"
        mutations.append(changed)
        changed = json.loads(MANIFEST_RAW)
        changed["files"][0]["bytes"] += 1
        mutations.append(changed)
        for document in mutations:
            raw = json.dumps(document, separators=(",", ":")).encode()
            with patch.object(a, "MANIFEST_SHA256", hashlib.sha256(raw).hexdigest()):
                with self.assertRaises(a.AcquisitionFailure):
                    a.manifest_paths(raw)
        self.assertEqual(base["source_commit"], a.COMMIT)

    def test_manifest_hash_mismatch_refuses_before_parse(self):
        with patch.object(a.json, "loads", side_effect=AssertionError("must not parse")):
            with self.assertRaises(a.AcquisitionFailure):
                a.manifest_paths(MANIFEST_RAW + b" ")

    def test_archive_parent_must_be_fresh_private_and_distinct(self):
        for mode in ("existing", "extra", "public", "symlink"):
            with tempfile.TemporaryDirectory() as name:
                base = Path(name)
                source = base / "source"
                archive = base / "archive"
                journal = base / "journal"
                source.mkdir()
                private(archive)
                private(journal)
                if mode == "existing":
                    (archive / a.ARCHIVE_NAME).write_bytes(b"old")
                    (archive / a.ARCHIVE_NAME).chmod(0o600)
                elif mode == "extra":
                    (archive / "other").write_bytes(b"other")
                elif mode == "public":
                    archive.chmod(0o755)
                else:
                    archive.rmdir()
                    archive.symlink_to(source, target_is_directory=True)
                runner = FakeRunner()
                with self.assertRaises(Exception):
                    a.acquire(source.resolve(), archive.absolute(), journal.resolve(), FakeCustody(), runner)
                self.assertEqual(runner.calls, [])

    def test_held_archive_fd_replacement_refuses(self):
        with tempfile.TemporaryDirectory() as name:
            base = Path(name)
            source = base / "source"
            archive = base / "archive"
            journal = base / "journal"
            source.mkdir()
            private(archive)
            private(journal)
            runner = FakeRunner("replace-archive")
            with self.assertRaises(a.AcquisitionFailure):
                a.acquire(source.resolve(), archive.resolve(), journal.resolve(), FakeCustody(), runner)
            self.assertEqual(len(runner.calls), 7)
            self.assertEqual((archive / "displaced").read_bytes(), b"held-original")
            self.assertEqual((archive / a.ARCHIVE_NAME).read_bytes(), b"replacement")

    def test_source_root_replacement_after_archive_refuses(self):
        with tempfile.TemporaryDirectory() as name:
            base = Path(name)
            source = base / "source"
            archive = base / "archive"
            journal = base / "journal"
            source.mkdir()
            private(archive)
            private(journal)
            runner = FakeRunner("replace-source")
            with self.assertRaises(a.AcquisitionFailure):
                a.acquire(source.resolve(), archive.resolve(), journal.resolve(), FakeCustody(), runner)
            self.assertEqual(len(runner.calls), 7)

    def test_runner_failure_cannot_print_or_return_pass(self):
        with tempfile.TemporaryDirectory() as name:
            base = Path(name)
            source = base / "source"
            archive = base / "archive"
            journal = base / "journal"
            source.mkdir()
            private(archive)
            private(journal)
            runner = FakeRunner("raise")
            with self.assertRaises(a.AcquisitionFailure):
                a.acquire(source.resolve(), archive.resolve(), journal.resolve(), FakeCustody(), runner)
            self.assertEqual((archive / a.ARCHIVE_NAME).stat().st_size, 0)

    def test_probe_mismatch_stops_before_archive_dispatch(self):
        class WrongHead(FakeRunner):
            def __call__(self, custody, argv, source_fd, journal_fd, serial, deadline, extra_fds=()):
                self.calls.append((argv, source_fd, serial, extra_fds))
                return b"0" * 40 + b"\n"
        with tempfile.TemporaryDirectory() as name:
            base = Path(name)
            source = base / "source"
            archive = base / "archive"
            journal = base / "journal"
            source.mkdir()
            private(archive)
            private(journal)
            runner = WrongHead()
            with self.assertRaises(a.AcquisitionFailure):
                a.acquire(source.resolve(), archive.resolve(), journal.resolve(), FakeCustody(), runner)
            self.assertEqual(len(runner.calls), 3)
            self.assertEqual((archive / a.ARCHIVE_NAME).stat().st_size, 0)

    def test_bound_runner_rejects_non_git_or_modified_archive_before_process(self):
        custody = FakeCustody()
        with tempfile.TemporaryDirectory() as name:
            journal = Path(name)
            journal.chmod(0o700)
            fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
            try:
                modified = list(a.archive_command(19, PATHS))
                modified[-1] = "unknown"
                for command, extra in ((("/bin/true",), ()),
                                       (tuple(modified), (19,)),
                                       (a.probe_command("head") + ("extra",), ()),
                                       (a.probe_command("head"), (19,)),
                                       (a.probe_command("tree"), ())):
                    with patch.object(a.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
                        with self.assertRaises(Exception):
                            a.run_bound(custody, command, fd, fd, 1, a.Deadline(1), extra)
            finally:
                os.close(fd)

    def test_frozen_custody_hash_and_byte_execution(self):
        raw = (HERE.parents[2] / "root-auth-checked-parent-coherent-source" /
               "scripts/project-economy/auth-chain-cleanup-owned-process.py").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), a.OWNED_PROCESS_SHA256)
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            target = root / "scripts/project-economy"
            target.mkdir(parents=True)
            helper = target / "auth-chain-cleanup-owned-process.py"
            helper.write_bytes(raw)
            helper.chmod(0o600)
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                module = a.load_custody(fd, a.Deadline(2))
                self.assertTrue(callable(module.stop_owned))
                with patch.object(a, "OWNED_PROCESS_SHA256", "0" * 64):
                    with self.assertRaises(a.AcquisitionFailure):
                        a.load_custody(fd, a.Deadline(2))
            finally:
                os.close(fd)

    def test_deadline_and_main_inputs_are_closed(self):
        deadline = a.Deadline(1)
        deadline.end = 0
        with self.assertRaises(a.AcquisitionFailure):
            deadline.check()
        with patch.object(a.sys, "argv", ["tool"]), patch.dict(a.os.environ, {}, clear=True):
            self.assertEqual(a.main(), 1)


if __name__ == "__main__":
    unittest.main()
