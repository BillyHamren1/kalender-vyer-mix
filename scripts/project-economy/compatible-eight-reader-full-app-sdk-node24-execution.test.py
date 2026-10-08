from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-sdk-node24-execution.py"
spec = importlib.util.spec_from_file_location("sdk_execution", SOURCE)
sdk_execution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdk_execution)


class FakeCustody:
    def __init__(self):
        self.UNCERTAIN_CHILDREN = {}
        self.REAPING_CHILDREN = {}

    def proc_identity_valid(self):
        return True

    def identity(self, pid):
        return (pid, 12345, pid, pid, "?")

    def leader_current(self, saved, deadline):
        return True

    def exited_unreaped(self, child, saved, deadline):
        return SimpleNamespace(si_code=os.CLD_EXITED, si_status=0)

    def stop_owned(self, child, saved, deadline):
        self.REAPING_CHILDREN[id(child)] = {"child": child, "complete": True}


class FakePopen:
    next_pid = 20_000
    stderr = b""
    malformed_owner = False
    substitute_stdout = False

    def __init__(self, command, **kwargs):
        type(self).next_pid += 1
        self.pid = type(self).next_pid
        self.command = tuple(command)
        owner_fd = kwargs["pass_fds"][-1]
        owner = (b"{}" if type(self).malformed_owner else
                 sdk_execution.canonical({"schema": "auth-chain-command-owner.v1",
                                          "pid": self.pid, "starttime": 12345,
                                          "pgid": self.pid, "sid": self.pid}))
        os.write(owner_fd, owner); os.fsync(owner_fd)
        if self.command[-1] == "--version" and len(self.command) == 2:
            stdout = b"v24.21.0\n"
        elif self.command[-1] == "--version":
            stdout = b"11.19.0\n"
        elif self.command[-1] == "ci":
            stdout = b"added 1 package in 1s\n"
        else:
            stdout = sdk_execution.SDK_PASS
        kwargs["stdout"].write(stdout); kwargs["stdout"].flush()
        kwargs["stderr"].write(type(self).stderr); kwargs["stderr"].flush()
        if type(self).substitute_stdout:
            journal_fd = kwargs["pass_fds"][2]
            names = sorted(name for name in os.listdir(journal_fd) if name.endswith(".out"))
            original = names[-1]
            os.rename(original, original + ".retained", src_dir_fd=journal_fd,
                      dst_dir_fd=journal_fd)
            replacement = os.open(original, os.O_CREAT | os.O_EXCL | os.O_RDWR,
                                  0o600, dir_fd=journal_fd)
            os.write(replacement, stdout); os.close(replacement)

    def poll(self):
        return None


def open_dir(path: Path) -> int:
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)
    return os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)


class ExecutionSourceTests(unittest.TestCase):
    def setUp(self):
        sdk_execution._PENDING.clear()
        FakePopen.stderr = b""
        FakePopen.malformed_owner = False
        FakePopen.substitute_stdout = False

    def test_fixed_commands_select_node24_sdk_only(self):
        command = sdk_execution._phase_command("sdk-unit", 10, 11)
        self.assertEqual(command, ("/proc/self/fd/10",
            "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs"))
        self.assertNotIn("compatible-eight-reader-full-app-sdk-shape-test.mjs", command)

    def test_old_node22_path_mutation_is_denied(self):
        original = sdk_execution.SDK_TEST
        try:
            sdk_execution.SDK_TEST = (
                "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs")
            with self.assertRaises(sdk_execution.ExecutionFailure):
                sdk_execution._phase_command("sdk-unit", 10, 11)
        finally:
            sdk_execution.SDK_TEST = original

    def test_four_ordered_phases_use_held_outputs_and_cleanup(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fds = [open_dir(root / name) for name in
                   ("build", "state", "journal", "distribution")]
            files = []
            try:
                for name in ("node", "npm", "ca", "guard"):
                    path = root / name; path.write_bytes(name.encode("ascii")); os.chmod(path, 0o600)
                    files.append(os.open(path, os.O_RDONLY | os.O_NOFOLLOW))
                custody = FakeCustody()
                policy = {"npm_trust": {"registry_origin": "https://registry.npmjs.org/",
                                         "ca_sha256": "a" * 64,
                                         "evidence_sha256": "b" * 64}}
                rows = []
                for serial, purpose in enumerate(sdk_execution.PHASES, 1):
                    rows.append(sdk_execution._run_phase(
                        custody, purpose, serial, fds[0], fds[1], fds[2], fds[3],
                        files[0], files[1], files[2], files[3], policy, popen=FakePopen))
                self.assertEqual([row["purpose"] for row in rows], list(sdk_execution.PHASES))
                self.assertTrue(all(row["cleanup_complete"] and row["survivor_absence"]
                                    for row in rows))
                self.assertEqual(custody.UNCERTAIN_CHILDREN, {})
                self.assertEqual(sdk_execution._PENDING, {})
                observed = sorted(path.name for path in (root / "journal").iterdir())
                self.assertEqual(len(observed), 4 * 5)
                durable = sdk_execution._rebind_journal(fds[2], rows)
                self.assertEqual([row["purpose"] for row in durable],
                                 list(sdk_execution.PHASES))
                self.assertTrue(all(len(row["receipt_sha256"]) == 64 for row in durable))
            finally:
                for fd in files + fds:
                    os.close(fd)

    def test_sdk_stderr_is_rejected_after_owned_cleanup(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fds = [open_dir(root / name) for name in
                   ("build", "state", "journal", "distribution")]
            files = []
            try:
                for name in ("node", "npm", "ca", "guard"):
                    path = root / name; path.write_bytes(b"x"); os.chmod(path, 0o600)
                    files.append(os.open(path, os.O_RDONLY | os.O_NOFOLLOW))
                custody = FakeCustody(); FakePopen.stderr = b"diagnostic\n"
                policy = {"npm_trust": {"registry_origin": "https://registry.npmjs.org/",
                                         "ca_sha256": "a" * 64,
                                         "evidence_sha256": "b" * 64}}
                with self.assertRaises(sdk_execution.ExecutionFailure):
                    sdk_execution._run_phase(custody, "sdk-unit", 4, fds[0], fds[1],
                        fds[2], fds[3], files[0], files[1], files[2], files[3],
                        policy, popen=FakePopen)
                self.assertEqual(custody.UNCERTAIN_CHILDREN, {})
                self.assertEqual(sdk_execution._PENDING, {})
            finally:
                for fd in files + fds:
                    os.close(fd)

    def test_malformed_owner_retains_strong_pending_custody(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fds = [open_dir(root / name) for name in
                   ("build", "state", "journal", "distribution")]
            files = []
            custody = FakeCustody()
            try:
                for name in ("node", "npm", "ca", "guard"):
                    path = root / name; path.write_bytes(b"x"); os.chmod(path, 0o600)
                    files.append(os.open(path, os.O_RDONLY | os.O_NOFOLLOW))
                FakePopen.malformed_owner = True
                policy = {"npm_trust": {"registry_origin": "https://registry.npmjs.org/",
                                         "ca_sha256": "a" * 64,
                                         "evidence_sha256": "b" * 64}}
                with self.assertRaises(sdk_execution.ExecutionFailure):
                    sdk_execution._run_phase(custody, "node-version", 1, fds[0], fds[1],
                        fds[2], fds[3], files[0], files[1], files[2], files[3],
                        policy, popen=FakePopen)
                self.assertEqual(set(sdk_execution._PENDING),
                                 {"sdk-execution-1-node-version"})
                self.assertEqual(set(custody.UNCERTAIN_CHILDREN),
                                 {"sdk-execution-1-node-version"})
                pending = sdk_execution._PENDING["sdk-execution-1-node-version"]
                self.assertIsNotNone(pending["child"])
                self.assertEqual(len(pending["handles"]), 3)
                recovered = sdk_execution.recover_pending(
                    custody, "sdk-execution-1-node-version", 1)
                self.assertTrue(recovered["cleanup_complete"])
                self.assertTrue(recovered["survivor_absence"])
                self.assertFalse(recovered["owner_capture_verified"])
                self.assertEqual(sdk_execution._PENDING, {})
                self.assertEqual(custody.UNCERTAIN_CHILDREN, {})
            finally:
                for pending in sdk_execution._PENDING.values():
                    for handle in pending["handles"]:
                        handle.close()
                sdk_execution._PENDING.clear(); custody.UNCERTAIN_CHILDREN.clear()
                for fd in files + fds:
                    os.close(fd)

    def test_stdout_path_substitution_is_denied_after_cleanup(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fds = [open_dir(root / name) for name in
                   ("build", "state", "journal", "distribution")]
            files = []
            try:
                for name in ("node", "npm", "ca", "guard"):
                    path = root / name; path.write_bytes(b"x"); os.chmod(path, 0o600)
                    files.append(os.open(path, os.O_RDONLY | os.O_NOFOLLOW))
                custody = FakeCustody(); FakePopen.substitute_stdout = True
                policy = {"npm_trust": {"registry_origin": "https://registry.npmjs.org/",
                                         "ca_sha256": "a" * 64,
                                         "evidence_sha256": "b" * 64}}
                with self.assertRaises(sdk_execution.ExecutionFailure):
                    sdk_execution._run_phase(custody, "node-version", 1, fds[0], fds[1],
                        fds[2], fds[3], files[0], files[1], files[2], files[3],
                        policy, popen=FakePopen)
                self.assertEqual(custody.UNCERTAIN_CHILDREN, {})
                self.assertEqual(sdk_execution._PENDING, {})
                self.assertTrue((root / "journal" /
                    "sdk-execution-1-node-version.out.retained").exists())
            finally:
                for fd in files + fds:
                    os.close(fd)

    def test_bounded_tree_manifest_accepts_internal_link(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "tree"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
            (root / "dir").mkdir(); (root / "dir" / "file").write_bytes(b"payload")
            os.symlink("dir/file", root / "link")
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                value = sdk_execution._tree_manifest(fd, __import__("time").monotonic() + 5)
            finally:
                os.close(fd)
            self.assertEqual((value["entries"], value["directories"], value["files"],
                              value["symlinks"], value["bytes"]), (3, 2, 1, 1, 7))
            self.assertEqual(len(value["tree_sha256"]), 64)

    def test_tree_manifest_rejects_escaping_link(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "tree"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
            os.symlink("../outside", root / "escape")
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                with self.assertRaises(sdk_execution.ExecutionFailure):
                    sdk_execution._tree_manifest(fd, __import__("time").monotonic() + 5)
            finally:
                os.close(fd)

    def test_duplicate_json_keys_are_rejected(self):
        with self.assertRaises(sdk_execution.ExecutionFailure):
            sdk_execution.decode(b'{"schema":"a","schema":"b"}')

    def test_ca_journal_binds_empty_stderr_owner_closed_and_receipt_fd(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "ca-journal"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
            owner = sdk_execution.canonical({"schema": "auth-chain-command-owner.v1",
                "pid": 31, "starttime": 41, "pgid": 31, "sid": 31})
            closed = sdk_execution.canonical({
                "schema": "compatible-full-app-node24-ca-export-closed.v1",
                "pid": 31, "starttime": 41, "pgid": 31, "sid": 31})
            receipt = sdk_execution.canonical({"schema": "synthetic-ca-receipt"})
            for leaf, value in (("ca-export.err", b""),
                                ("ca-export.owner.json", owner),
                                ("ca-export.closed.json", closed),
                                ("ca-export.receipt.json", receipt)):
                (root / leaf).write_bytes(value); os.chmod(root / leaf, 0o600)
            journal_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            receipt_fd = os.open(root / "ca-export.receipt.json", os.O_RDONLY | os.O_NOFOLLOW)
            try:
                result = sdk_execution._validate_ca_journal(journal_fd, receipt_fd, receipt)
                self.assertEqual((result["pid"], result["starttime"]), (31, 41))
                self.assertEqual(result["stderr_sha256"],
                                 __import__("hashlib").sha256(b"").hexdigest())
            finally:
                os.close(receipt_fd); os.close(journal_fd)

    def test_replayable_egress_v1_cannot_open_process_route(self):
        with self.assertRaisesRegex(
                sdk_execution.ExecutionFailure, "active_egress_enforcer_required"):
            sdk_execution._active_egress_gate()

    def test_static_scope_and_cli_hold(self):
        source = SOURCE.read_text()
        self.assertNotIn("shell=True", source)
        self.assertNotIn("os.unlink(", source)
        self.assertNotIn("os.rmdir(", source)
        self.assertIn('"app_build_admitted": False', source)
        self.assertIn('"product_runtime_admission": False', source)
        self.assertEqual(sdk_execution.main(), 78)


if __name__ == "__main__":
    unittest.main(verbosity=2)
