"""Support/negative tests only; never executes Node."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-node24-ca-export.py"
CUSTODY = HERE.parent / "root-auth-checked-parent-coherent-source/scripts/project-economy/auth-chain-cleanup-owned-process.py"
spec = importlib.util.spec_from_file_location("node24_ca_export", SOURCE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


CERT = (b"-----BEGIN CERTIFICATE-----\n"
        b"QUJDREVGR0g=\n"
        b"-----END CERTIFICATE-----\n")


class Controls(unittest.TestCase):
    def tearDown(self):
        m.PENDING_RECOVERY.clear()

    def test_script_and_command_are_exact_finite_and_nonsecret(self):
        self.assertEqual(hashlib.sha256(m.SCRIPT.encode()).hexdigest(), m.SCRIPT_SHA256)
        self.assertEqual(m.command(17), ("/proc/self/fd/17", "-e", m.SCRIPT))
        self.assertIn("node:tls", m.SCRIPT)
        self.assertIn("tls.rootCertificates", m.SCRIPT)
        self.assertNotIn("process.env", m.SCRIPT)

    def test_ca_parser_accepts_exact_lf_pems_and_rejects_malformed(self):
        self.assertEqual(m.parse_ca(CERT), 1)
        self.assertEqual(m.parse_ca(CERT + CERT), 2)
        for raw in (b"", CERT.replace(b"\n", b"\r\n"), CERT[:-1],
                    b"prefix" + CERT, CERT.replace(b"QUJDREVGR0g=", b"not pem!")):
            with self.assertRaises(m.CaExportFailure): m.parse_ca(raw)

    def test_exact_frozen_custody_load_and_mutation_refuse(self):
        raw = CUSTODY.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.OWNED_PROCESS_SHA256)
        module = m.load_custody(raw)
        self.assertTrue(callable(module.stop_owned))
        with self.assertRaises(m.CaExportFailure): m.load_custody(raw + b" ")

    def test_node_fd_hash_mode_and_identity_are_bound(self):
        with tempfile.TemporaryDirectory() as name:
            node = Path(name) / "node"; node.write_bytes(b"exact-node"); node.chmod(0o500)
            fd = os.open(node, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                saved = m.verify_regular_fd(fd, hashlib.sha256(b"exact-node").hexdigest(), 1024, True)
                self.assertEqual(saved.st_size, 10)
                with self.assertRaises(m.CaExportFailure): m.verify_regular_fd(fd, "0" * 64, 1024, True)
            finally: os.close(fd)

    def test_stderr_held_fd_and_path_replacement_are_both_denied(self):
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name); path = directory / "ca-export.err"
            path.touch(mode=0o600); path.chmod(0o600)
            handle = path.open("r+b", buffering=0); saved = os.fstat(handle.fileno())
            try:
                m._empty_artifact(handle, path, saved)
                replacement = directory / "replacement"; replacement.touch(mode=0o600)
                os.replace(replacement, path)
                with self.assertRaises(m.CaExportFailure):
                    m._empty_artifact(handle, path, saved)
            finally:
                handle.close()
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "ca-export.err"; path.touch(mode=0o600); path.chmod(0o600)
            handle = path.open("r+b", buffering=0); saved = os.fstat(handle.fileno())
            try:
                handle.write(b"stderr"); handle.flush()
                with self.assertRaises(m.CaExportFailure):
                    m._empty_artifact(handle, path, saved)
            finally:
                handle.close()

    def test_uncertain_process_state_refuses_before_popen(self):
        custody = types.SimpleNamespace(UNCERTAIN_CHILDREN={"x": object()}, REAPING_CHILDREN={},
                                        proc_identity_valid=lambda: True)
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); node = base / "node"; node.write_bytes(b"node"); node.chmod(0o500)
            ca = base / "ca"; ca.touch(mode=0o600); ca.chmod(0o600)
            journal = base / "journal"; journal.mkdir(); journal.chmod(0o700)
            node_fd = os.open(node, os.O_RDONLY); ca_fd = os.open(ca, os.O_RDWR)
            journal_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with mock.patch.object(m, "load_custody", return_value=custody):
                    with self.assertRaises(m.CaExportFailure):
                        m.export_ca(b"captured", node_fd, hashlib.sha256(b"node").hexdigest(),
                                    ca_fd, journal_fd, popen=mock.Mock(side_effect=AssertionError("spawn")))
            finally:
                os.close(journal_fd); os.close(ca_fd); os.close(node_fd)

    def test_popen_failure_never_calls_ownership_kernel_without_child(self):
        class SpawnFailure(RuntimeError): pass
        custody = types.SimpleNamespace(
            UNCERTAIN_CHILDREN={}, REAPING_CHILDREN={},
            proc_identity_valid=lambda: True,
            stop_owned=mock.Mock(side_effect=AssertionError("must not stop absent child")),
            exited_unreaped=mock.Mock(), leader_current=mock.Mock(),
            identity=mock.Mock())
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); node = base / "node"; node.write_bytes(b"node"); node.chmod(0o500)
            ca = base / "ca"; ca.touch(mode=0o600); ca.chmod(0o600)
            journal = base / "journal"; journal.mkdir(); journal.chmod(0o700)
            node_fd = os.open(node, os.O_RDONLY); ca_fd = os.open(ca, os.O_RDWR)
            journal_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with mock.patch.object(m, "load_custody", return_value=custody):
                    with self.assertRaisesRegex(SpawnFailure, "primary-spawn-failure"):
                        m.export_ca(b"captured", node_fd, hashlib.sha256(b"node").hexdigest(),
                                    ca_fd, journal_fd,
                                    popen=mock.Mock(side_effect=SpawnFailure("primary-spawn-failure")))
                custody.stop_owned.assert_not_called()
                self.assertEqual(custody.UNCERTAIN_CHILDREN, {})
                self.assertFalse((journal / "ca-export.closed.json").exists())
                self.assertFalse((journal / "ca-export.receipt.json").exists())
            finally:
                os.close(journal_fd); os.close(ca_fd); os.close(node_fd)

    def test_real_loaded_custody_survives_unwind_and_explicit_recovery(self):
        child = types.SimpleNamespace(pid=12345)
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); node = base / "node"; node.write_bytes(b"node"); node.chmod(0o500)
            ca = base / "ca"; ca.touch(mode=0o600); ca.chmod(0o600)
            journal = base / "journal"; journal.mkdir(); journal.chmod(0o700)
            node_fd = os.open(node, os.O_RDONLY); ca_fd = os.open(ca, os.O_RDWR)
            journal_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
            try:
                exact_load = m.load_custody
                loaded = []
                def supported_load(raw):
                    value = exact_load(raw)
                    # This test runner intentionally has a virtualized PID
                    # view.  Patch only that platform gate after exact b901
                    # bytes were dynamically loaded; keep its real registries.
                    value.proc_identity_valid = lambda: True
                    loaded.append(value)
                    return value
                with mock.patch.object(m, "load_custody", side_effect=supported_load):
                    with self.assertRaises(m.CaExportFailure):
                        m.export_ca(CUSTODY.read_bytes(), node_fd,
                                    hashlib.sha256(b"node").hexdigest(), ca_fd, journal_fd,
                                    popen=mock.Mock(return_value=child))
                loaded.clear()
                self.assertEqual(set(m.PENDING_RECOVERY),
                                 {"compatible-full-app-node24-ca-export"})
                pending = m.PENDING_RECOVERY["compatible-full-app-node24-ca-export"]
                custody = pending["custody"]
                self.assertTrue(callable(custody.stop_owned))
                self.assertIn("compatible-full-app-node24-ca-export",
                              custody.UNCERTAIN_CHILDREN)
                self.assertIs(custody.UNCERTAIN_CHILDREN[
                    "compatible-full-app-node24-ca-export"][0], child)
                with self.assertRaises(m.CaExportFailure):
                    m.recover_pending(journal_fd)
                self.assertIn("compatible-full-app-node24-ca-export",
                              m.PENDING_RECOVERY)
                owner = {"schema": "auth-chain-command-owner.v1", "pid": child.pid,
                         "starttime": 77, "pgid": child.pid, "sid": child.pid}
                owner_raw = json.dumps(owner, separators=(",", ":")).encode("ascii")
                os.ftruncate(pending["owner_fd"], 0)
                self.assertEqual(os.pwrite(pending["owner_fd"], owner_raw, 0), len(owner_raw))
                os.fsync(pending["owner_fd"])
                def stopped(actual_child, saved, _deadline):
                    self.assertIs(actual_child, child)
                    self.assertEqual(saved[:4], (child.pid, 77, child.pid, child.pid))
                    custody.REAPING_CHILDREN[id(child)] = {
                        "child": child, "complete": True}
                custody.stop_owned = mock.Mock(side_effect=stopped)
                result = m.recover_pending(journal_fd)
                self.assertEqual(result, {
                    "schema": "compatible-full-app-node24-ca-export-recovery.v1",
                    "cleanup_complete": True})
                custody.stop_owned.assert_called_once()
                self.assertEqual(m.PENDING_RECOVERY, {})
                self.assertNotIn("compatible-full-app-node24-ca-export",
                                 custody.UNCERTAIN_CHILDREN)
            finally:
                os.close(journal_fd); os.close(ca_fd); os.close(node_fd)

    def test_same_uid_owner_replacement_is_not_adopted(self):
        child = types.SimpleNamespace(pid=23456)
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); node = base / "node"; node.write_bytes(b"node"); node.chmod(0o500)
            ca = base / "ca"; ca.touch(mode=0o600); ca.chmod(0o600)
            journal = base / "journal"; journal.mkdir(); journal.chmod(0o700)
            node_fd = os.open(node, os.O_RDONLY); ca_fd = os.open(ca, os.O_RDWR)
            journal_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
            pending = None
            try:
                exact_load = m.load_custody
                def supported_load(raw):
                    value = exact_load(raw); value.proc_identity_valid = lambda: True
                    return value
                with mock.patch.object(m, "load_custody", side_effect=supported_load):
                    with self.assertRaises(m.CaExportFailure):
                        m.export_ca(CUSTODY.read_bytes(), node_fd,
                                    hashlib.sha256(b"node").hexdigest(), ca_fd, journal_fd,
                                    popen=mock.Mock(return_value=child))
                pending = m.PENDING_RECOVERY["compatible-full-app-node24-ca-export"]
                owner = {"schema": "auth-chain-command-owner.v1", "pid": child.pid,
                         "starttime": 88, "pgid": child.pid, "sid": child.pid}
                owner_raw = json.dumps(owner, separators=(",", ":")).encode("ascii")
                os.ftruncate(pending["owner_fd"], 0)
                os.pwrite(pending["owner_fd"], owner_raw, 0); os.fsync(pending["owner_fd"])
                owner_path = journal / "ca-export.owner.json"
                retained = journal / "retained-owner"
                owner_path.rename(retained)
                owner_path.write_bytes(owner_raw); owner_path.chmod(0o600)
                with self.assertRaises(m.CaExportFailure):
                    m._capture_owner_fd(pending["owner_fd"], owner_path, child.pid,
                                        pending["owner_anchor"])
                with self.assertRaises(m.CaExportFailure):
                    m.recover_pending(journal_fd)
                self.assertIn("compatible-full-app-node24-ca-export", m.PENDING_RECOVERY)
                self.assertEqual(os.pread(pending["owner_fd"], len(owner_raw) + 1, 0), owner_raw)
                self.assertNotEqual(os.fstat(pending["owner_fd"]).st_ino,
                                    owner_path.lstat().st_ino)
            finally:
                if pending is not None:
                    try: os.close(pending["owner_fd"])
                    except OSError: pass
                os.close(journal_fd); os.close(ca_fd); os.close(node_fd)

    def test_source_uses_wnowait_custody_not_poll_wait_kill(self):
        text = SOURCE.read_text()
        self.assertIn("custody.exited_unreaped", text)
        self.assertIn("custody.stop_owned", text)
        self.assertIn("if child is None:", text)
        self.assertIn("if saved is None: saved = captured()", text)
        self.assertIn("PENDING_RECOVERY[token]", text)
        self.assertIn("def recover_pending(", text)
        self.assertIn("CLEANUP_RESERVE", text)
        self.assertGreaterEqual(text.count("verify_regular_fd(node_fd, node_sha256"), 2)
        self.assertIn("_empty_artifact(handles[0], err_path, err_saved)", text)
        for forbidden in (".poll(", ".wait(", "os.kill(", "os.killpg(", "shell=True"):
            self.assertNotIn(forbidden, text)

    def test_main_is_fixed_refusal(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(),
                         "compatible-full-app-node24-ca-export FAIL unrouted_exact_node_and_native_evidence_required\n")


if __name__ == "__main__": unittest.main()
