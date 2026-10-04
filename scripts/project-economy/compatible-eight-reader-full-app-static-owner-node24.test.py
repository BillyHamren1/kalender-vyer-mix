import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SOURCE = Path(__file__).with_name("compatible-eight-reader-full-app-static-owner-node24.py")
SPEC = importlib.util.spec_from_file_location("static_owner_node24", SOURCE)
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)


def evidence():
    value = {"schema": "compatible-full-app-node24-executable-evidence.v1",
        "policy_sha256": m.NODE_POLICY_SHA256, "adapter_sha256": m.NODE24_ADAPTER_SHA256,
        "archive_sha256": m.NODE_ARCHIVE_SHA256, "node_version": m.NODE_VERSION,
        "archive_root": "node-v24.21.0-linux-x64", "node_relative_path": "bin/node",
        "node_executable_sha256": "1" * 64, "node_executable_bytes": 1_000_000}
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
    return raw, hashlib.sha256(raw).hexdigest()


def start_resources(root):
    dist = root / "dist"; journal = root / "journal"; dist.mkdir(mode=0o700); journal.mkdir(mode=0o700)
    receipt = root / "receipt"; receipt.touch(mode=0o600)
    node = root / "node"; node.write_bytes(b"N" * 1_000_000); node.chmod(0o500)
    value = {"schema": "compatible-full-app-node24-executable-evidence.v1",
        "policy_sha256": m.NODE_POLICY_SHA256, "adapter_sha256": m.NODE24_ADAPTER_SHA256,
        "archive_sha256": m.NODE_ARCHIVE_SHA256, "node_version": m.NODE_VERSION,
        "archive_root": "node-v24.21.0-linux-x64", "node_relative_path": "bin/node",
        "node_executable_sha256": hashlib.sha256(node.read_bytes()).hexdigest(),
        "node_executable_bytes": node.stat().st_size}
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    fds = [os.open(node, flags), os.open(SOURCE.with_name("compatible-eight-reader-full-app-node-static-server.mjs"), flags),
           os.open(dist, flags | os.O_DIRECTORY), os.open(receipt, os.O_RDWR | os.O_NOFOLLOW),
           os.open(journal, flags | os.O_DIRECTORY)]
    return fds, raw, hashlib.sha256(raw).hexdigest()


def clear_fake_pending(custody):
    for row in m._PENDING.values():
        for stream in row["handles"]:
            if not stream.closed: stream.close()
    m._PENDING.clear(); m._LIVE.clear(); custody.UNCERTAIN_CHILDREN.clear(); custody.REAPING_CHILDREN.clear()


class StaticOwnerControls(unittest.TestCase):
    def test_node_evidence_binds_distribution_adapter_and_derived_executable(self):
        raw, digest = evidence(); value = m.parse_node_evidence(raw, digest)
        self.assertEqual(value["node_version"], "v24.21.0")
        self.assertEqual(value["node_executable_sha256"], "1" * 64)
        self.assertEqual(value["adapter_sha256"], "100c5a67bf3c2ade6f3b53cb105d8f38bc47cb012f329bc60258c6e94592cfee")

    def test_node_evidence_rejects_change_unknown_duplicate_and_wrong_outer_hash(self):
        raw, digest = evidence(); changed = json.loads(raw); changed["node_version"] = "v24.19.0"
        unknown = json.loads(raw); unknown["ambient"] = True
        for candidate, outer in ((json.dumps(changed).encode(), hashlib.sha256(json.dumps(changed).encode()).hexdigest()),
                                 (json.dumps(unknown).encode(), hashlib.sha256(json.dumps(unknown).encode()).hexdigest()),
                                 (b'{"schema":"x","schema":"y"}', hashlib.sha256(b'{"schema":"x","schema":"y"}').hexdigest()),
                                 (raw, "0" * 64)):
            with self.assertRaises(m.OwnerFailure): m.parse_node_evidence(candidate, outer)

    def test_regular_fd_is_content_bound_and_rejects_writable_or_changed_bytes(self):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "node"; path.write_bytes(b"exact"); path.chmod(0o500)
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                saved = m.verify_regular_fd(fd, hashlib.sha256(b"exact").hexdigest(), 5, 10, True,
                                            __import__("time").monotonic() + 2)
                self.assertEqual(saved.st_size, 5)
            finally: os.close(fd)
            path.chmod(0o520)
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                with self.assertRaises(m.OwnerFailure):
                    m.verify_regular_fd(fd, hashlib.sha256(b"exact").hexdigest(), 5, 10, True,
                                        __import__("time").monotonic() + 2)
            finally: os.close(fd)

    def test_static_receipt_is_canonical_and_binds_owner_and_dist(self):
        with tempfile.TemporaryDirectory() as name:
            saved = os.stat(name); owner = (123, 456, 123, 123, "?")
            value = {"dist_dev": saved.st_dev, "dist_ino": saved.st_ino, "host": "127.0.0.1",
                "pgid": 123, "pid": 123, "port": 43210,
                "project_route": m.PROJECT_ROUTE, "schema": "compatible-full-app-static-server.v1", "sid": 123}
            raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
            self.assertEqual(m.parse_static_receipt(raw, owner, saved)["port"], 43210)
            with self.assertRaises(m.OwnerFailure): m.parse_static_receipt(raw + b" ", owner, saved)
            value["pid"] = 124; bad = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
            with self.assertRaises(m.OwnerFailure): m.parse_static_receipt(bad, owner, saved)

    def test_long_lived_handle_survives_start_check_and_retains_identity_until_cleanup(self):
        class Custody:
            UNCERTAIN_CHILDREN = {}; REAPING_CHILDREN = {}
            @staticmethod
            def proc_identity_valid(): return True
            @staticmethod
            def identity(pid): return (pid, 987654, pid, pid, "R")
            @staticmethod
            def leader_current(saved, deadline):
                self.assertEqual(saved[:4], (os.getpid(), 987654, os.getpid(), os.getpid()))
            @staticmethod
            def exited_unreaped(child, saved, deadline): return None
            @staticmethod
            def stop_owned(child, saved, deadline):
                child.stdout.write(b"compatible-full-app-node-static-server CLOSED requests=2 native_browser=false\n")
                child.stdout.flush(); Custody.REAPING_CHILDREN[id(child)] = {"child": child, "saved": saved[:4], "complete": True}
        class Popen:
            def __init__(child, command, **kwargs):
                child.pid = os.getpid(); child.stdout = kwargs["stdout"]
                owner_fd = kwargs["pass_fds"][-1]; backup = os.dup(owner_fd)
                try: kwargs["preexec_fn"](); os.dup2(backup, owner_fd)
                finally: os.close(backup)
                dist = os.fstat(int(command[-2])); receipt_fd = int(command[-1])
                packet = json.dumps({"dist_dev": dist.st_dev, "dist_ino": dist.st_ino, "host": m.HOST,
                    "pgid": child.pid, "pid": child.pid, "port": 43210, "project_route": m.PROJECT_ROUTE,
                    "schema": "compatible-full-app-static-server.v1", "sid": child.pid},
                    sort_keys=True, separators=(",", ":")).encode("ascii")
                os.write(receipt_fd, packet); os.fsync(receipt_fd)
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); dist = root / "dist"; journal = root / "journal"
            dist.mkdir(mode=0o700); journal.mkdir(mode=0o700)
            receipt = root / "receipt"; receipt.touch(mode=0o600)
            node = root / "node"; node.write_bytes(b"N" * 1_000_000); node.chmod(0o500)
            raw_value = {"schema": "compatible-full-app-node24-executable-evidence.v1",
                "policy_sha256": m.NODE_POLICY_SHA256, "adapter_sha256": m.NODE24_ADAPTER_SHA256,
                "archive_sha256": m.NODE_ARCHIVE_SHA256, "node_version": m.NODE_VERSION,
                "archive_root": "node-v24.21.0-linux-x64", "node_relative_path": "bin/node",
                "node_executable_sha256": hashlib.sha256(node.read_bytes()).hexdigest(),
                "node_executable_bytes": node.stat().st_size}
            raw = json.dumps(raw_value, sort_keys=True, separators=(",", ":")).encode("ascii")
            flags = os.O_RDONLY | os.O_NOFOLLOW
            fds = [os.open(node, flags), os.open(SOURCE.with_name("compatible-eight-reader-full-app-node-static-server.mjs"), flags),
                   os.open(dist, flags | os.O_DIRECTORY), os.open(receipt, os.O_RDWR | os.O_NOFOLLOW),
                   os.open(journal, flags | os.O_DIRECTORY)]
            try:
                handle = m.start_static(Custody, *fds, raw, hashlib.sha256(raw).hexdigest(), 1, popen=Popen)
                self.assertIn(id(handle), m._LIVE); self.assertEqual(handle.saved[1], 987654)
                self.assertIs(Custody.UNCERTAIN_CHILDREN[handle.token][0], handle.child)
                self.assertEqual(m.check_static(Custody, handle), handle.receipt_bytes)
                closed = m.stop_static(Custody, handle)
                self.assertTrue(closed["cleanup_complete"]); self.assertEqual(closed["starttime"], 987654)
                self.assertNotIn(id(handle), m._LIVE); self.assertFalse(Custody.UNCERTAIN_CHILDREN)
            finally:
                for fd in fds: os.close(fd)

    def test_pre_popen_failure_never_calls_stop_with_no_child(self):
        class Custody:
            UNCERTAIN_CHILDREN = {}; REAPING_CHILDREN = {}; stops = 0
            @staticmethod
            def proc_identity_valid(): return True
            @staticmethod
            def stop_owned(*args): Custody.stops += 1
        class Popen:
            calls = 0
            def __init__(self, *args, **kwargs): Popen.calls += 1
        with tempfile.TemporaryDirectory() as name:
            fds, raw, digest = start_resources(Path(name))
            try:
                with self.assertRaises(m.OwnerFailure):
                    m.start_static(Custody, *fds, raw, "0" * 64, 2, popen=Popen)
                self.assertEqual((Popen.calls, Custody.stops), (0, 0))
                self.assertFalse(Custody.UNCERTAIN_CHILDREN); self.assertFalse(m._PENDING)
            finally:
                for fd in fds: os.close(fd)

    def test_malformed_or_duplicate_owner_is_retained_pending_without_signal(self):
        for owner_raw in (b"{", b'{"schema":"auth-chain-command-owner.v1","pid":1,"pid":1,"starttime":2,"pgid":1,"sid":1}'):
            class Custody:
                UNCERTAIN_CHILDREN = {}; REAPING_CHILDREN = {}; stops = 0
                @staticmethod
                def proc_identity_valid(): return True
                @staticmethod
                def stop_owned(*args): Custody.stops += 1
            class Popen:
                def __init__(child, command, **kwargs):
                    child.pid = 1; os.write(kwargs["pass_fds"][-1], owner_raw); os.fsync(kwargs["pass_fds"][-1])
            with tempfile.TemporaryDirectory() as name:
                fds, raw, digest = start_resources(Path(name))
                try:
                    with self.assertRaises((m.OwnerFailure, ValueError, json.JSONDecodeError)):
                        m.start_static(Custody, *fds, raw, digest, 3, popen=Popen)
                    self.assertEqual(Custody.stops, 0); self.assertEqual(len(Custody.UNCERTAIN_CHILDREN), 1)
                    self.assertEqual(len(m._PENDING), 1)
                    pending = next(iter(m._PENDING.values())); self.assertEqual(pending["child"].pid, 1)
                finally:
                    clear_fake_pending(Custody)
                    for fd in fds: os.close(fd)

    def test_proc_validation_and_cleanup_failure_retains_pending_handle(self):
        class Custody:
            UNCERTAIN_CHILDREN = {}; REAPING_CHILDREN = {}; stops = 0
            @staticmethod
            def proc_identity_valid(): return True
            @staticmethod
            def leader_current(saved, deadline): raise OSError("proc unavailable")
            @staticmethod
            def stop_owned(*args): Custody.stops += 1; raise OSError("proc unavailable")
        class Popen:
            def __init__(child, command, **kwargs):
                child.pid = 7; raw_owner = json.dumps({"schema": "auth-chain-command-owner.v1", "pid": 7,
                    "starttime": 99, "pgid": 7, "sid": 7}, separators=(",", ":")).encode()
                os.write(kwargs["pass_fds"][-1], raw_owner); os.fsync(kwargs["pass_fds"][-1])
        with tempfile.TemporaryDirectory() as name:
            fds, raw, digest = start_resources(Path(name))
            try:
                with self.assertRaises(OSError): m.start_static(Custody, *fds, raw, digest, 4, popen=Popen)
                self.assertEqual(Custody.stops, 1); self.assertEqual(len(Custody.UNCERTAIN_CHILDREN), 1)
                self.assertEqual(len(m._PENDING), 1); self.assertFalse(next(iter(m._PENDING.values()))["handles"][0].closed)
            finally:
                clear_fake_pending(Custody)
                for fd in fds: os.close(fd)

    def test_cli_is_fixed_hold_and_no_ambient_node_path(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(), "FULL_APP_STATIC_OWNER_NODE24 HOLD native_exact_fd_and_cleanup_required\n")
        source = SOURCE.read_text()
        self.assertNotIn("/usr/bin/node", source); self.assertNotIn("which node", source)
        self.assertIn('"/proc/self/fd/%d" % node_fd', source)


if __name__ == "__main__": unittest.main()
