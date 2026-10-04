"""Unrouted b901-custodied export of exact Node24 bundled root certificates."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import stat
import subprocess
import time


OWNED_PROCESS_SHA256 = "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
NODE_VERSION = "v24.21.0"
SCRIPT = ("const tls=require('node:tls');"
          "if(!Array.isArray(tls.rootCertificates)||tls.rootCertificates.length===0)process.exit(65);"
          "for(const cert of tls.rootCertificates){"
          "if(typeof cert!=='string'||!cert.startsWith('-----BEGIN CERTIFICATE-----\\n')||"
          "!cert.endsWith('\\n-----END CERTIFICATE-----')||cert.includes('\\r'))process.exit(66);"
          "process.stdout.write(cert+'\\n');}")
SCRIPT_SHA256 = hashlib.sha256(SCRIPT.encode("utf-8")).hexdigest()
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")
EXECUTION_SECONDS = 10
CLEANUP_RESERVE = 15
CA_LIMIT = 4_194_304
PENDING_RECOVERY = {}


class CaExportFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise CaExportFailure("compatible_full_app_node24_ca_export_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def lowercase_hash(value: str) -> str:
    need(type(value) is str and len(value) == 64
         and all(character in "0123456789abcdef" for character in value))
    return value


def verify_regular_fd(fd: int, expected_hash: str, maximum: int,
                      executable: bool) -> os.stat_result:
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid() and saved.st_nlink == 1
         and not saved.st_mode & 0o022 and 0 < saved.st_size <= maximum
         and (not executable or bool(saved.st_mode & 0o111)))
    digest = hashlib.sha256(); offset = 0
    while offset <= saved.st_size:
        part = os.pread(fd, min(65_536, saved.st_size + 1 - offset), offset)
        if not part: break
        offset += len(part); digest.update(part)
    need(offset == saved.st_size and digest.hexdigest() == lowercase_hash(expected_hash)
         and identity(os.fstat(fd)) == identity(saved))
    return saved


def command(node_fd: int) -> tuple[str, ...]:
    need(type(node_fd) is int and node_fd >= 0)
    return ("/proc/self/fd/" + str(node_fd), "-e", SCRIPT)


def parse_ca(raw: bytes) -> int:
    need(type(raw) is bytes and 0 < len(raw) <= CA_LIMIT and b"\r" not in raw and raw.endswith(b"\n"))
    pattern = re.compile(rb"(?:-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+"
                         rb"-----END CERTIFICATE-----\n)+")
    need(pattern.fullmatch(raw) is not None)
    count = raw.count(b"-----BEGIN CERTIFICATE-----\n")
    need(0 < count == raw.count(b"-----END CERTIFICATE-----\n") <= 1_024)
    return count


def _write_once(directory_fd: int, name: str, raw: bytes) -> None:
    need("/" not in name and name not in ("", ".", "..") and len(raw) <= 65_536)
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    try:
        os.fchmod(fd, 0o600); cursor = 0
        while cursor < len(raw):
            written = os.write(fd, raw[cursor:]); need(written > 0); cursor += written
        os.fsync(fd)
    finally: os.close(fd)


def _empty_artifact(handle, path: Path, saved: os.stat_result) -> None:
    """Bind empty stderr to its held FD and unchanged journal pathname."""
    current = os.fstat(handle.fileno())
    need(identity(current) == identity(saved) and current.st_size == 0
         and identity(path.lstat()) == identity(current))


def load_custody(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536
         and hashlib.sha256(raw).hexdigest() == OWNED_PROCESS_SHA256)
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(
        "captured_node24_ca_owned_process", loader=None))
    exec(compile(raw, "<captured-node24-ca-owned-process>", "exec"), module.__dict__)
    need(callable(module.exited_unreaped) and callable(module.stop_owned)
         and callable(module.proc_identity_valid))
    return module


def _decode_owner(raw: bytes, child_pid: int) -> tuple[int, int, int, int, str]:
    need(type(raw) is bytes and 0 < len(raw) <= 4_096)
    value = json.loads(raw.decode("ascii"))
    need(type(value) is dict and set(value) == {"schema", "pid", "starttime", "pgid", "sid"}
         and value["schema"] == "auth-chain-command-owner.v1"
         and all(type(value[key]) is int and value[key] > 0
                 for key in ("pid", "starttime", "pgid", "sid"))
         and value["pid"] == child_pid and value["pgid"] == child_pid
         and value["sid"] == child_pid)
    return (value["pid"], value["starttime"], value["pgid"], value["sid"], "?")


def _owner_anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def _capture_owner_fd(owner_fd: int, owner_path: Path, child_pid: int,
                      created_anchor: tuple[int, ...]):
    before = os.fstat(owner_fd)
    need(_owner_anchor(before) == created_anchor
         and stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
         and 0 < before.st_size <= 4_096)
    raw = os.pread(owner_fd, before.st_size + 1, 0)
    need(len(raw) == before.st_size
         and identity(os.fstat(owner_fd)) == identity(before)
         and identity(owner_path.lstat()) == identity(before))
    return _decode_owner(raw, child_pid), before


def recover_pending(journal_fd: int, seconds: float = CLEANUP_RESERVE) -> dict:
    """Recover one returned child retained after owner-capture failure."""
    need(type(journal_fd) is int and journal_fd >= 0
         and type(seconds) in (int, float) and 0 < seconds <= CLEANUP_RESERVE
         and len(PENDING_RECOVERY) == 1)
    token, row = next(iter(PENDING_RECOVERY.items()))
    need(type(row) is dict and set(row) == {
        "custody", "child", "journal_identity", "owner_leaf", "owner_fd",
        "owner_anchor", "owner_identity", "saved"
    } and row["owner_leaf"] == "ca-export.owner.json"
         and identity(os.fstat(journal_fd)) == row["journal_identity"])
    custody, child = row["custody"], row["child"]
    need(custody.UNCERTAIN_CHILDREN.get(token, (None,))[0] is child)
    saved = row["saved"]
    owner_path = Path("/proc/self/fd/%d/%s" % (journal_fd, row["owner_leaf"]))
    if saved is None:
        saved, owner_saved = _capture_owner_fd(
            row["owner_fd"], owner_path, child.pid, row["owner_anchor"])
        row["saved"] = saved
        row["owner_identity"] = identity(owner_saved)
    need(identity(os.fstat(row["owner_fd"])) == row["owner_identity"]
         and identity(owner_path.lstat()) == row["owner_identity"])
    deadline = time.monotonic() + seconds
    custody.stop_owned(child, saved, deadline)
    reaped = custody.REAPING_CHILDREN.get(id(child))
    need(type(reaped) is dict and reaped.get("child") is child
         and reaped.get("complete") is True)
    need(identity(os.fstat(journal_fd)) == row["journal_identity"]
         and identity(os.fstat(row["owner_fd"])) == row["owner_identity"]
         and identity(owner_path.lstat()) == row["owner_identity"])
    os.close(row["owner_fd"])
    custody.UNCERTAIN_CHILDREN.pop(token, None)
    PENDING_RECOVERY.pop(token)
    return {"schema": "compatible-full-app-node24-ca-export-recovery.v1",
            "cleanup_complete": True}


def export_ca(custody_raw: bytes, node_fd: int, node_sha256: str, ca_fd: int,
              journal_fd: int, popen=subprocess.Popen) -> dict:
    """Execute only the fixed exporter; native runtime evidence remains open."""
    need(len({node_fd, ca_fd, journal_fd}) == 3 and not PENDING_RECOVERY)
    custody = load_custody(custody_raw)
    need(not custody.UNCERTAIN_CHILDREN
         and all(row["complete"] for row in custody.REAPING_CHILDREN.values())
         and custody.proc_identity_valid())
    node_saved = verify_regular_fd(node_fd, node_sha256, 268_435_456, True)
    ca_saved = os.fstat(ca_fd); journal_saved = os.fstat(journal_fd)
    need(stat.S_ISREG(ca_saved.st_mode) and ca_saved.st_uid == os.geteuid()
         and ca_saved.st_nlink == 1 and stat.S_IMODE(ca_saved.st_mode) == 0o600
         and ca_saved.st_size == 0
         and stat.S_ISDIR(journal_saved.st_mode) and journal_saved.st_uid == os.geteuid()
         and stat.S_IMODE(journal_saved.st_mode) == 0o700)
    started = time.monotonic(); execution_end = started + EXECUTION_SECONDS
    cleanup_end = execution_end + CLEANUP_RESERVE
    err_path = Path("/proc/self/fd/%d/ca-export.err" % journal_fd)
    owner_path = Path("/proc/self/fd/%d/ca-export.owner.json" % journal_fd)
    handles = []; child = None; saved = None; err_saved = None
    recovery_journal_saved = None; recovery_owner_fd = None; owner_created_anchor = None
    token = "compatible-full-app-node24-ca-export"
    try:
        for path in (err_path, owner_path):
            fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600); handles.append(os.fdopen(fd, "r+b", buffering=0))
        err_saved = os.fstat(handles[0].fileno())
        owner_fd = handles[1].fileno()
        owner_created = os.fstat(owner_fd)
        need(stat.S_ISREG(owner_created.st_mode) and owner_created.st_uid == os.geteuid()
             and owner_created.st_nlink == 1 and stat.S_IMODE(owner_created.st_mode) == 0o600
             and owner_created.st_size == 0 and identity(owner_path.lstat()) == identity(owner_created))
        owner_created_anchor = _owner_anchor(owner_created)
        recovery_owner_fd = os.dup(owner_fd)
        need(_owner_anchor(os.fstat(recovery_owner_fd)) == owner_created_anchor)
        recovery_journal_saved = os.fstat(journal_fd)
        def acquire():
            resource.setrlimit(resource.RLIMIT_FSIZE, (CA_LIMIT, CA_LIMIT))
            exact = custody.identity(os.getpid())
            packet = json.dumps({"schema": "auth-chain-command-owner.v1", "pid": exact[0],
                                 "starttime": exact[1], "pgid": exact[2], "sid": exact[3]},
                                separators=(",", ":")).encode("ascii")
            cursor = 0
            while cursor < len(packet):
                written = os.write(owner_fd, packet[cursor:]); need(written > 0); cursor += written
            os.fsync(owner_fd); os.close(owner_fd)
        def captured():
            need(time.monotonic() < cleanup_end)
            value, owner_saved = _capture_owner_fd(
                owner_fd, owner_path, child.pid, owner_created_anchor)
            if token in PENDING_RECOVERY:
                PENDING_RECOVERY[token]["owner_identity"] = identity(owner_saved)
            return value
        child = popen(command(node_fd), stdin=subprocess.DEVNULL, stdout=ca_fd, stderr=handles[0],
                      cwd="/proc/self/fd/%d" % journal_fd, start_new_session=True, preexec_fn=acquire,
                      pass_fds=(node_fd, ca_fd, journal_fd, owner_fd), close_fds=True,
                      env={"LC_ALL": "C", "LANG": "C"})
        custody.UNCERTAIN_CHILDREN[token] = (child, owner_path)
        PENDING_RECOVERY[token] = {
            "custody": custody, "child": child,
            "journal_identity": identity(recovery_journal_saved),
            "owner_leaf": "ca-export.owner.json", "owner_fd": recovery_owner_fd,
            "owner_anchor": owner_created_anchor, "owner_identity": None, "saved": None,
        }
        recovery_owner_fd = None
        saved = captured(); PENDING_RECOVERY[token]["saved"] = saved
        custody.leader_current(saved, cleanup_end)
        while True:
            status = custody.exited_unreaped(child, saved, cleanup_end)
            if status is not None:
                need(status.si_code == os.CLD_EXITED and status.si_status == 0); break
            need(time.monotonic() < execution_end); time.sleep(.005)
        need(time.monotonic() < execution_end)
        os.fsync(ca_fd); handles[0].flush()
        _empty_artifact(handles[0], err_path, err_saved)
        need(identity(os.fstat(node_fd)) == identity(node_saved))
    finally:
        try:
            if child is None:
                # Popen did not return an identified child.  Preserve the
                # primary spawn failure and never enter the ownership kernel
                # with invented/absent identity.
                pass
            else:
                # Once Popen returned a child, failure to validate the owner
                # record deliberately leaves the uncertain entry intact for
                # caller recovery.  stop_owned is only called with a captured
                # and validated identity.
                if saved is None: saved = captured()
                need(type(saved) is tuple and len(saved) == 5)
                custody.stop_owned(child, saved, cleanup_end)
                row = custody.REAPING_CHILDREN.get(id(child))
                need(type(row) is dict and row.get("child") is child and row.get("complete") is True)
                pending = PENDING_RECOVERY[token]
                need(pending["owner_identity"] is not None
                     and identity(os.fstat(pending["owner_fd"])) == pending["owner_identity"]
                     and identity(owner_path.lstat()) == pending["owner_identity"])
                os.close(pending["owner_fd"])
                custody.UNCERTAIN_CHILDREN.pop(token, None)
                PENDING_RECOVERY.pop(token, None)
        finally:
            try:
                if child is not None and handles and err_saved is not None:
                    _empty_artifact(handles[0], err_path, err_saved)
            finally:
                for handle in handles: handle.close()
                if recovery_owner_fd is not None: os.close(recovery_owner_fd)
    need(not custody.UNCERTAIN_CHILDREN
         and all(row["complete"] for row in custody.REAPING_CHILDREN.values()))
    node_after_cleanup = verify_regular_fd(node_fd, node_sha256, 268_435_456, True)
    need(identity(node_after_cleanup) == identity(node_saved))
    closed = {"schema": "compatible-full-app-node24-ca-export-closed.v1",
              "pid": saved[0], "starttime": saved[1], "pgid": saved[2], "sid": saved[3]}
    _write_once(journal_fd, "ca-export.closed.json",
                json.dumps(closed, sort_keys=True, separators=(",", ":")).encode("ascii"))
    final = os.fstat(ca_fd)
    need(final.st_dev == ca_saved.st_dev and final.st_ino == ca_saved.st_ino
         and final.st_uid == ca_saved.st_uid and final.st_gid == ca_saved.st_gid
         and final.st_mode == ca_saved.st_mode and final.st_nlink == 1
         and 0 < final.st_size <= CA_LIMIT)
    raw = os.pread(ca_fd, final.st_size + 1, 0)
    need(len(raw) == final.st_size and identity(os.fstat(ca_fd)) == identity(final))
    certificates = parse_ca(raw)
    receipt = {"schema": "compatible-full-app-node24-ca-export-receipt.v1",
               "archive_sha256": ARCHIVE_SHA256, "node_version": NODE_VERSION,
               "node_sha256": lowercase_hash(node_sha256), "script_sha256": SCRIPT_SHA256,
               "ca_sha256": hashlib.sha256(raw).hexdigest(), "ca_bytes": len(raw),
               "certificates": certificates, "cleanup_complete": True}
    _write_once(journal_fd, "ca-export.receipt.json",
                json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii"))
    return receipt


def main() -> int:
    print("compatible-full-app-node24-ca-export FAIL unrouted_exact_node_and_native_evidence_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
