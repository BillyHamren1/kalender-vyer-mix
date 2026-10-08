"""Long-lived b901-derived custody for the exact Node24 static server.

This source is inert without caller-held exact FDs and authenticated Node evidence.
It retains the Popen handle and PID/start-time record until explicit cleanup.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import resource
import stat
import subprocess
import time


OWNED_PROCESS_SHA256 = "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"
NODE_POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
NODE24_ADAPTER_SHA256 = "100c5a67bf3c2ade6f3b53cb105d8f38bc47cb012f329bc60258c6e94592cfee"
NODE_ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
SERVER_SHA256 = "9a73fddf2d2a8e0de1692274ef2b9ef2e031466705948ff038e43c98ae7da93a"
NODE_VERSION = "v24.21.0"
PROJECT_ROUTE = "/project/55555555-5555-4555-8555-555555555555/economy"
HOST = "127.0.0.1"
READINESS_SECONDS = 10
WHOLE_SECONDS = 135
OUTPUT_CAP = 1_048_576
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_nlink", "st_mode",
          "st_size", "st_mtime_ns", "st_ctime_ns")
_LIVE = {}
_PENDING = {}


class OwnerFailure(Exception):
    pass


def need(value):
    if value is not True:
        raise OwnerFailure("compatible_full_app_static_owner_denied")


def identity(value):
    return tuple(getattr(value, key) for key in FIELDS)


def lower_hash(value):
    need(type(value) is str and len(value) == 64 and all(char in "0123456789abcdef" for char in value))
    return value


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result); result[key] = value
    return result


def parse_node_evidence(raw, expected_sha256):
    need(type(raw) is bytes and 0 < len(raw) <= 4_096
         and hashlib.sha256(raw).hexdigest() == lower_hash(expected_sha256))
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(OwnerFailure()))
    except (ValueError, UnicodeError):
        raise OwnerFailure("compatible_full_app_static_owner_denied") from None
    need(type(value) is dict and set(value) == {"schema", "policy_sha256", "adapter_sha256",
         "archive_sha256", "node_version", "archive_root", "node_relative_path",
         "node_executable_sha256", "node_executable_bytes"})
    need(value["schema"] == "compatible-full-app-node24-executable-evidence.v1"
         and value["policy_sha256"] == NODE_POLICY_SHA256
         and value["adapter_sha256"] == NODE24_ADAPTER_SHA256
         and value["archive_sha256"] == NODE_ARCHIVE_SHA256
         and value["node_version"] == NODE_VERSION
         and value["archive_root"] == "node-v24.21.0-linux-x64"
         and value["node_relative_path"] == "bin/node"
         and type(value["node_executable_bytes"]) is int
         and 1_000_000 <= value["node_executable_bytes"] <= 268_435_456)
    lower_hash(value["node_executable_sha256"])
    return value


def verify_regular_fd(fd, expected_sha256, expected_bytes, maximum, executable, deadline):
    need(type(fd) is int and fd >= 3 and type(expected_bytes) is int and 0 < expected_bytes <= maximum
         and type(maximum) is int and maximum <= 268_435_456 and type(executable) is bool
         and time.monotonic() < deadline)
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid() and saved.st_nlink == 1
         and not saved.st_mode & 0o022 and saved.st_size == expected_bytes
         and (not executable or bool(saved.st_mode & 0o111)))
    digest = hashlib.sha256(); offset = 0
    while offset <= saved.st_size:
        need(time.monotonic() < deadline)
        part = os.pread(fd, min(1_048_576, saved.st_size + 1 - offset), offset)
        if not part: break
        offset += len(part); need(offset <= maximum); digest.update(part)
    need(offset == saved.st_size and digest.hexdigest() == lower_hash(expected_sha256)
         and identity(os.fstat(fd)) == identity(saved))
    return saved


def verify_directory_fd(fd):
    need(type(fd) is int and fd >= 3); saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid() and not saved.st_mode & 0o022)
    return saved


def verify_receipt_fd(fd, empty):
    need(type(fd) is int and fd >= 3); saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
         and saved.st_nlink == 1 and stat.S_IMODE(saved.st_mode) == 0o600
         and (saved.st_size == 0 if empty else 0 < saved.st_size <= 1_024))
    return saved


def canonical_receipt(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def canonical_owner(value):
    return json.dumps({"schema": value["schema"], "pid": value["pid"],
        "starttime": value["starttime"], "pgid": value["pgid"], "sid": value["sid"]},
        separators=(",", ":")).encode("ascii")


def parse_static_receipt(raw, saved, dist_saved):
    need(type(raw) is bytes and 0 < len(raw) <= 1_024)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(OwnerFailure()))
    except (ValueError, UnicodeError):
        raise OwnerFailure("compatible_full_app_static_owner_denied") from None
    need(type(value) is dict and set(value) == {"dist_dev", "dist_ino", "host", "pgid", "pid",
         "port", "project_route", "schema", "sid"} and canonical_receipt(value) == raw)
    need(value["schema"] == "compatible-full-app-static-server.v1" and value["host"] == HOST
         and value["project_route"] == PROJECT_ROUTE and type(value["port"]) is int
         and 0 < value["port"] < 65_536 and value["pid"] == saved[0]
         and value["pgid"] == saved[2] and value["sid"] == saved[3]
         and value["dist_dev"] == dist_saved.st_dev and value["dist_ino"] == dist_saved.st_ino)
    return value


class StaticHandle:
    __slots__ = ("child", "saved", "token", "receipt", "receipt_bytes", "receipt_fd", "dist_fd",
                 "node_fd", "server_fd", "journal_fd", "files", "stream_shapes", "identities",
                 "node_sha256", "node_bytes", "deadline", "__weakref__")


def file_shape(value):
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid, value.st_nlink, value.st_mode)


def _write_once(directory_fd, name, raw):
    need(type(name) is str and name and "/" not in name and type(raw) is bytes and len(raw) <= 4_096)
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
    try:
        os.fchmod(fd, 0o600); offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:]); need(count > 0); offset += count
        os.fsync(fd)
    finally: os.close(fd)


def start_static(custody, node_fd, server_fd, dist_fd, receipt_fd, journal_fd,
                 node_evidence_raw, node_evidence_sha256, serial, popen=subprocess.Popen):
    """Start and retain one exact server. Native positive evidence remains external."""
    need(type(serial) is int and 0 < serial <= 999 and not _LIVE and not _PENDING and not custody.UNCERTAIN_CHILDREN
         and all(row["complete"] for row in custody.REAPING_CHILDREN.values())
         and custody.proc_identity_valid() and len({node_fd, server_fd, dist_fd, receipt_fd, journal_fd}) == 5)
    started = time.monotonic(); ready_end = started + READINESS_SECONDS; whole_end = started + WHOLE_SECONDS
    evidence = parse_node_evidence(node_evidence_raw, node_evidence_sha256)
    node_saved = verify_regular_fd(node_fd, evidence["node_executable_sha256"],
                                   evidence["node_executable_bytes"], 268_435_456, True, ready_end)
    server_saved = verify_regular_fd(server_fd, SERVER_SHA256, 15_999, 1_048_576, False, ready_end)
    dist_saved = verify_directory_fd(dist_fd); journal_saved = verify_directory_fd(journal_fd)
    receipt_saved = verify_receipt_fd(receipt_fd, True)
    prefix = "node-static-%03d" % serial
    paths = [Path("/proc/self/fd/%d" % journal_fd) / (prefix + suffix)
             for suffix in (".out", ".err", ".owner.json")]
    handles = []; child = None; saved = None; token = "compatible-full-app-node-static-%03d" % serial
    accepted = False; cleaned = False
    try:
        for path in paths:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600); handles.append(os.fdopen(fd, "r+b", buffering=0))
        journal_saved = verify_directory_fd(journal_fd)
        owner_fd = handles[2].fileno()
        def acquire():
            resource.setrlimit(resource.RLIMIT_FSIZE, (OUTPUT_CAP, OUTPUT_CAP))
            acquired = custody.identity(os.getpid())
            packet = json.dumps({"schema": "auth-chain-command-owner.v1", "pid": acquired[0],
                "starttime": acquired[1], "pgid": acquired[2], "sid": acquired[3]},
                separators=(",", ":")).encode("ascii")
            offset = 0
            while offset < len(packet):
                count = os.write(owner_fd, packet[offset:]); need(count > 0); offset += count
            os.fsync(owner_fd); os.close(owner_fd)
        def captured():
            need(time.monotonic() < ready_end)
            before = os.fstat(owner_fd); need(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= 4_096)
            raw_owner = os.pread(owner_fd, before.st_size + 1, 0)
            need(len(raw_owner) == before.st_size and identity(os.fstat(owner_fd)) == identity(before))
            value = json.loads(raw_owner.decode("ascii"), object_pairs_hook=pairs,
                               parse_constant=lambda _: (_ for _ in ()).throw(OwnerFailure()))
            need(type(value) is dict and set(value) == {"schema", "pid", "starttime", "pgid", "sid"}
                 and value["schema"] == "auth-chain-command-owner.v1"
                 and canonical_owner(value) == raw_owner
                 and all(type(value[key]) is int and value[key] > 0 for key in ("pid", "starttime", "pgid", "sid"))
                 and value["pid"] == child.pid and value["pgid"] == child.pid and value["sid"] == child.pid)
            return (value["pid"], value["starttime"], value["pgid"], value["sid"], "?")
        command = ("/proc/self/fd/%d" % node_fd, "/proc/self/fd/%d" % server_fd,
                   str(dist_fd), str(receipt_fd))
        environment = {"CI": "true", "COMPATIBLE_FULL_APP_NODE_STATIC_SERVER": "1",
                       "PATH": "/usr/bin:/bin", "HOME": "/proc/self/fd/%d" % journal_fd,
                       "LANG": "C", "LC_ALL": "C"}
        child = popen(command, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1],
                      cwd="/proc/self/fd/%d" % journal_fd, start_new_session=True, preexec_fn=acquire,
                      pass_fds=(node_fd, server_fd, dist_fd, receipt_fd, journal_fd, owner_fd),
                      close_fds=True, env=environment)
        custody.UNCERTAIN_CHILDREN[token] = (child, paths[2])
        _PENDING[token] = {"child": child, "owner_path": paths[2], "handles": handles,
                           "journal_fd": journal_fd, "deadline": whole_end}
        saved = captured(); custody.leader_current(saved, ready_end)
        raw = b""
        while not raw:
            need(time.monotonic() < ready_end and custody.exited_unreaped(child, saved, ready_end) is None)
            current = verify_receipt_fd(receipt_fd, False) if os.fstat(receipt_fd).st_size else receipt_saved
            if current.st_size:
                raw = os.pread(receipt_fd, current.st_size + 1, 0); need(len(raw) == current.st_size)
                break
            time.sleep(.01)
        receipt = parse_static_receipt(raw, saved, dist_saved)
        receipt_current = verify_receipt_fd(receipt_fd, False)
        receipt_check = os.pread(receipt_fd, receipt_current.st_size + 1, 0)
        need(identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(server_fd)) == identity(server_saved)
             and identity(os.fstat(dist_fd)) == identity(dist_saved)
             and identity(os.fstat(journal_fd)) == identity(journal_saved)
             and os.fstat(receipt_fd).st_dev == receipt_saved.st_dev
             and os.fstat(receipt_fd).st_ino == receipt_saved.st_ino
             and receipt_check == raw and len(receipt_check) == receipt_current.st_size
             and identity(os.fstat(receipt_fd)) == identity(receipt_current))
        handle = StaticHandle(); handle.child = child; handle.saved = saved; handle.token = token
        handle.receipt = receipt; handle.receipt_bytes = raw; handle.receipt_fd = receipt_fd
        handle.dist_fd = dist_fd; handle.node_fd = node_fd; handle.server_fd = server_fd
        handle.journal_fd = journal_fd; handle.files = (paths, handles)
        handle.stream_shapes = tuple(file_shape(os.fstat(stream.fileno())) for stream in handles)
        handle.identities = (node_saved, server_saved, dist_saved, receipt_saved, journal_saved)
        handle.node_sha256 = evidence["node_executable_sha256"]
        handle.node_bytes = evidence["node_executable_bytes"]
        handle.deadline = whole_end; _LIVE[id(handle)] = handle; _PENDING.pop(token, None)
        accepted = True; return handle
    finally:
        if not accepted:
            if child is None:
                for stream in handles: stream.close()
            elif saved is None:
                # Never guess or signal. The exact Popen and recovery FDs remain strongly retained.
                need(custody.UNCERTAIN_CHILDREN.get(token, (None,))[0] is child
                     and _PENDING.get(token, {}).get("child") is child)
            else:
                try:
                    custody.stop_owned(child, saved, whole_end)
                    _write_once(journal_fd, prefix + ".closed.json", canonical_receipt({"pgid": saved[2],
                        "pid": saved[0], "schema": "auth-chain-command-closed.v1", "sid": saved[3],
                        "starttime": saved[1]}))
                    custody.UNCERTAIN_CHILDREN.pop(token, None)
                    _PENDING.pop(token, None); cleaned = True
                finally:
                    if cleaned:
                        for stream in handles: stream.close()


def check_static(custody, handle):
    need(type(handle) is StaticHandle and _LIVE.get(id(handle)) is handle and time.monotonic() < handle.deadline)
    custody.leader_current(handle.saved, handle.deadline)
    node_saved, server_saved, dist_saved, receipt_saved, journal_saved = handle.identities
    need(identity(os.fstat(handle.node_fd)) == identity(node_saved)
         and identity(os.fstat(handle.server_fd)) == identity(server_saved)
         and identity(os.fstat(handle.dist_fd)) == identity(dist_saved)
         and identity(os.fstat(handle.journal_fd)) == identity(journal_saved))
    current = os.fstat(handle.receipt_fd)
    need(current.st_dev == receipt_saved.st_dev and current.st_ino == receipt_saved.st_ino
         and current.st_size == len(handle.receipt_bytes)
         and os.pread(handle.receipt_fd, current.st_size + 1, 0) == handle.receipt_bytes
         and custody.exited_unreaped(handle.child, handle.saved, handle.deadline) is None)
    return handle.receipt_bytes


def stop_static(custody, handle):
    need(type(handle) is StaticHandle and _LIVE.get(id(handle)) is handle)
    paths, files = handle.files; failure = None
    try:
        custody.stop_owned(handle.child, handle.saved, handle.deadline)
        row = custody.REAPING_CHILDREN.get(id(handle.child))
        need(type(row) is dict and row.get("child") is handle.child and row.get("complete") is True)
        for stream in files: stream.flush()
        node_saved, server_saved, dist_saved, receipt_saved, journal_saved = handle.identities
        verify_regular_fd(handle.node_fd, handle.node_sha256, handle.node_bytes,
                          268_435_456, True, handle.deadline)
        verify_regular_fd(handle.server_fd, SERVER_SHA256, 15_999, 1_048_576, False, handle.deadline)
        need(identity(os.fstat(handle.dist_fd)) == identity(dist_saved))
        captured = []
        for index in (0, 1):
            info = os.fstat(files[index].fileno())
            need(file_shape(info) == handle.stream_shapes[index] and 0 <= info.st_size < OUTPUT_CAP)
            raw = os.pread(files[index].fileno(), info.st_size + 1, 0)
            need(len(raw) == info.st_size and identity(os.fstat(files[index].fileno())) == identity(info))
            captured.append(raw)
        stdout, stderr = captured
        need(len(stdout) < OUTPUT_CAP and len(stderr) < OUTPUT_CAP and not stderr
             and stdout.startswith(b"compatible-full-app-node-static-server CLOSED requests=")
             and stdout.endswith(b" native_browser=false\n")
             and stdout.count(b"\n") == 1)
        count = stdout[len(b"compatible-full-app-node-static-server CLOSED requests="):
                       -len(b" native_browser=false\n")]
        need(count.isdigit() and 0 <= int(count) <= 768)
        _write_once(handle.journal_fd, paths[2].name.replace(".owner.json", ".closed.json"),
                    canonical_receipt({"pgid": handle.saved[2], "pid": handle.saved[0],
                        "schema": "auth-chain-command-closed.v1", "sid": handle.saved[3],
                        "starttime": handle.saved[1]}))
        custody.UNCERTAIN_CHILDREN.pop(handle.token, None); _LIVE.pop(id(handle), None)
        return {"schema": "compatible-full-app-node-static-closed.v1", "pid": handle.saved[0],
                "starttime": handle.saved[1], "requests": int(count), "cleanup_complete": True}
    except BaseException as error:
        failure = error; raise
    finally:
        if failure is None:
            for stream in files: stream.close()


def main():
    print("FULL_APP_STATIC_OWNER_NODE24 HOLD native_exact_fd_and_cleanup_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
