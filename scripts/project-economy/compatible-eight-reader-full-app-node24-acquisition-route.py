"""Held-FD Node24 acquisition/extraction/runner join; never launches a process.

The only successful output is source-bound evidence with launch admission false.
Any failure after the fixed attempt has been bound discards that whole attempt.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import stat
import time


PREPARATION_SHA256 = "e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42"
POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
ARCHIVE_URL = "https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz"
ARCHIVE_NAME = "node-v24.21.0-linux-x64.tar.xz"
ARCHIVE_ROOT = "node-v24.21.0-linux-x64"
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
NODE_PATH = "bin/node"
NPM_PATH = "lib/node_modules/npm/bin/npm-cli.js"
NPM_LINK = "bin/npm"
NPM_LINK_TARGET = "../lib/node_modules/npm/bin/npm-cli.js"
BASE_ADAPTER_SHA256 = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"
NODE24_ADAPTER_SHA256 = "100c5a67bf3c2ade6f3b53cb105d8f38bc47cb012f329bc60258c6e94592cfee"
ORIGIN_GUARD_SHA256 = "767145176eb49355611612f883b85a60babe8bff11cd41e69b4ffca33589369a"

ATTEMPT_LEAF = "compatible-full-app-node24-route-attempt"
QUARANTINE_LEAF = "compatible-full-app-node24-route-attempt.discarded"
ACQUISITION_LEAF = "archive-acquisition"
FETCH_RECEIPT_LEAF = "node24-fetch-receipt.json"
EXTRACTION_LEAF = "node24-extraction"
EXTRACTION_RECEIPT_LEAF = "node24-extraction-evidence.json"
EXTRACTED_LEAF = "node24-distribution"
JOURNAL_LEAF = "runner-journal"
OUTPUTS = {
    "node": "node24-node-version-evidence.json",
    "npm": "node24-npm-version-evidence.json",
    "owner": "node24-static-owner-evidence.json",
    "route": "node24-acquisition-route-evidence.json",
}
ARCHIVE_LIMIT = 67_108_864
NODE_LIMIT = 268_435_456
NPM_LIMIT = 16_777_216
RECEIPT_LIMIT = 65_536
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class RouteFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise RouteFailure("compatible_full_app_node24_acquisition_route_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def quarantine_transition(before: os.stat_result, after: os.stat_result) -> bool:
    before_values = dict(zip(FIELDS, identity(before)))
    after_values = dict(zip(FIELDS, identity(after)))
    stable = tuple(field for field in FIELDS if field != "st_ctime_ns")
    return (all(before_values[field] == after_values[field] for field in stable)
            and after_values["st_ctime_ns"] >= before_values["st_ctime_ns"])


def lower_hash(value) -> str:
    need(type(value) is str and len(value) == 64
         and all(character in "0123456789abcdef" for character in value))
    return value


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def exact(value, keys):
    need(type(value) is dict and set(value) == set(keys))
    return value


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def decode(raw: bytes, maximum: int = RECEIPT_LIMIT):
    need(type(raw) is bytes and 0 < len(raw) <= maximum)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(RouteFailure()))
    except (UnicodeError, ValueError):
        raise RouteFailure("compatible_full_app_node24_acquisition_route_denied") from None
    need(canonical(value) == raw)
    return value


class Deadline:
    def __init__(self, seconds: float = 60) -> None:
        need(type(seconds) in (int, float) and 0 < seconds <= 60)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        need(time.monotonic() < self.end)


def _directory(fd: int, private: bool = False) -> os.stat_result:
    need(type(fd) is int and fd >= 0)
    saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and not saved.st_mode & 0o022
         and (not private or stat.S_IMODE(saved.st_mode) == 0o700))
    return saved


def _open_directory(parent_fd: int, name: str, private: bool = False):
    need(type(name) is str and name not in ("", ".", "..") and "/" not in name)
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_gid == os.getegid() and not before.st_mode & 0o022
         and (not private or stat.S_IMODE(before.st_mode) == 0o700))
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
    except BaseException:
        os.close(fd)
        raise
    return fd, before


def _open_path(root_fd: int, relative: str, directory: bool = False):
    parts = relative.split("/")
    need(parts and all(part not in ("", ".", "..") for part in parts))
    opened = [os.dup(root_fd)]
    try:
        for part in parts[:-1]:
            child, _ = _open_directory(opened[-1], part)
            opened.append(child)
        before = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need((stat.S_ISDIR(before.st_mode) if directory else stat.S_ISREG(before.st_mode))
             and before.st_uid == os.geteuid() and before.st_gid == os.getegid()
             and not before.st_mode & 0o022 and (directory or before.st_nlink == 1))
        flags = os.O_RDONLY | os.O_NOFOLLOW
        if directory:
            flags |= os.O_DIRECTORY
        else:
            flags |= os.O_NONBLOCK
        fd = os.open(parts[-1], flags, dir_fd=opened[-1])
        try:
            need(identity(os.fstat(fd)) == identity(before))
            return fd, before
        except BaseException:
            os.close(fd)
            raise
    finally:
        for current in reversed(opened):
            os.close(current)


def _hash_fd(fd: int, maximum: int, deadline: Deadline, executable: bool = False):
    need(type(fd) is int and fd >= 0 and type(maximum) is int and maximum > 0)
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and saved.st_nlink == 1
         and not saved.st_mode & 0o022 and 0 < saved.st_size <= maximum
         and (not executable or bool(saved.st_mode & 0o111)))
    digest = hashlib.sha256()
    offset = 0
    while offset <= saved.st_size:
        deadline.check()
        part = os.pread(fd, min(1_048_576, saved.st_size + 1 - offset), offset)
        if not part:
            break
        offset += len(part)
        need(offset <= saved.st_size)
        digest.update(part)
    need(offset == saved.st_size and identity(os.fstat(fd)) == identity(saved))
    return digest.hexdigest(), saved


def _read_fd(fd: int, maximum: int, deadline: Deadline, mode: int | None = None,
             allow_empty: bool = False):
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and saved.st_nlink == 1
         and not saved.st_mode & 0o022 and (mode is None or stat.S_IMODE(saved.st_mode) == mode)
         and 0 <= saved.st_size <= maximum and (allow_empty or saved.st_size > 0))
    parts = []
    offset = 0
    while offset <= saved.st_size:
        deadline.check()
        part = os.pread(fd, min(65_536, saved.st_size + 1 - offset), offset)
        if not part:
            break
        offset += len(part)
        parts.append(part)
    raw = b"".join(parts)
    need(len(raw) == saved.st_size and identity(os.fstat(fd)) == identity(saved))
    return raw, saved


def _read_at(directory_fd: int, name: str, maximum: int, deadline: Deadline,
             allow_empty: bool = False):
    before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_gid == os.getegid() and before.st_nlink == 1
         and stat.S_IMODE(before.st_mode) == 0o600)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
        raw, saved = _read_fd(fd, maximum, deadline, 0o600, allow_empty)
        need(identity(saved) == identity(before)
             and identity(os.stat(name, dir_fd=directory_fd,
                                  follow_symlinks=False)) == identity(before))
        return raw, saved
    finally:
        os.close(fd)


def _write_once(directory_fd: int, name: str, raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= RECEIPT_LIMIT)
    fd = os.open(name, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    accepted = False
    try:
        os.fchmod(fd, 0o600)
        offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:])
            need(count > 0)
            offset += count
        os.fsync(fd)
        saved = os.fstat(fd)
        need(stat.S_ISREG(saved.st_mode) and saved.st_nlink == 1
             and saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
             and stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_size == len(raw)
             and os.pread(fd, len(raw) + 1, 0) == raw
             and identity(os.stat(name, dir_fd=directory_fd,
                                  follow_symlinks=False)) == identity(saved))
        accepted = True
        return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def _bind_attempt(parent_fd: int, attempt_fd: int):
    parent = _directory(parent_fd, True)
    attempt = _directory(attempt_fd, True)
    reopened, at_path = _open_directory(parent_fd, ATTEMPT_LEAF, True)
    try:
        need(identity(os.fstat(reopened)) == identity(attempt) == identity(at_path))
    finally:
        os.close(reopened)
    return parent, attempt


def _exact_names(fd: int, deadline: Deadline, expected: set[str]) -> None:
    """Stream a closed-layout check without allocating beyond its exact cap."""
    need(type(expected) is set and expected
         and all(type(name) is str and name not in ("", ".", "..")
                 and "/" not in name and "\x00" not in name for name in expected))
    observed = set()
    with os.scandir(fd) as entries:
        for entry in entries:
            deadline.check()
            name = entry.name
            need(type(name) is str and name not in ("", ".", "..")
                 and "/" not in name and "\x00" not in name
                 and len(observed) < len(expected) and name not in observed)
            observed.add(name)
    need(observed == expected)


def _rename_noreplace(parent_fd: int, source: str, destination: str) -> None:
    """Linux renameat2(RENAME_NOREPLACE): quarantine never replaces anything."""
    need(type(parent_fd) is int and parent_fd >= 0
         and source == ATTEMPT_LEAF and destination == QUARANTINE_LEAF)
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    need(renameat2 is not None)
    renameat2.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                          ctypes.c_char_p, ctypes.c_uint)
    renameat2.restype = ctypes.c_int
    result = renameat2(parent_fd, source.encode("ascii"), parent_fd,
                       destination.encode("ascii"), 1)
    if result != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def discard_attempt(parent_fd: int, attempt_fd: int, attempt_saved: os.stat_result) -> None:
    """Atomically quarantine the bound attempt; this source never deletes it."""
    deadline = Deadline(15)
    parent_saved = _directory(parent_fd, True)
    at_path = os.stat(ATTEMPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    pre_rename = os.fstat(attempt_fd)
    need(anchor(pre_rename) == anchor(attempt_saved) == anchor(at_path)
         and identity(at_path) == identity(pre_rename))
    try:
        os.stat(QUARANTINE_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        need(False)
    deadline.check()
    _rename_noreplace(parent_fd, ATTEMPT_LEAF, QUARANTINE_LEAF)
    deadline.check()
    quarantined = os.stat(QUARANTINE_LEAF, dir_fd=parent_fd,
                          follow_symlinks=False)
    reopened = os.open(QUARANTINE_LEAF,
                       os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                       dir_fd=parent_fd)
    try:
        post_saved = os.fstat(attempt_fd)
        need(quarantine_transition(pre_rename, post_saved)
             and identity(quarantined) == identity(post_saved)
             and identity(os.fstat(reopened)) == identity(post_saved))
        try:
            os.stat(ATTEMPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)
        os.fsync(parent_fd)
        need(identity(os.fstat(attempt_fd)) == identity(post_saved)
             and identity(os.fstat(reopened)) == identity(post_saved)
             and identity(os.stat(QUARANTINE_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(post_saved))
    finally:
        os.close(reopened)
    try:
        os.stat(ATTEMPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        need(False)
    current = os.fstat(parent_fd)
    need((current.st_dev, current.st_ino, current.st_uid, current.st_gid,
          current.st_mode) == (parent_saved.st_dev, parent_saved.st_ino,
                               parent_saved.st_uid, parent_saved.st_gid,
                               parent_saved.st_mode))


def _bind_inputs(attempt_fd: int, archive_fd: int, acquisition_receipt_fd: int,
                 extraction_receipt_fd: int, distribution_fd: int,
                 node_fd: int, npm_fd: int, journal_fd: int,
                 deadline: Deadline, outputs_present: bool = False):
    acquisition_fd = extraction_fd = None
    opened = []
    try:
        acquisition_fd, _ = _open_directory(attempt_fd, ACQUISITION_LEAF, True)
        extraction_fd, _ = _open_directory(attempt_fd, EXTRACTION_LEAF, True)
        expected = {ACQUISITION_LEAF, EXTRACTION_LEAF, JOURNAL_LEAF}
        if outputs_present:
            expected.update(OUTPUTS.values())
        _exact_names(attempt_fd, deadline, expected)
        opened_archive, archive_saved = _open_path(acquisition_fd, ARCHIVE_NAME)
        opened.append(opened_archive)
        opened_fetch, fetch_saved = _open_path(acquisition_fd, FETCH_RECEIPT_LEAF)
        opened.append(opened_fetch)
        opened_extract_receipt, extract_receipt_saved = _open_path(
            extraction_fd, EXTRACTION_RECEIPT_LEAF)
        opened.append(opened_extract_receipt)
        opened_distribution, distribution_saved = _open_path(
            extraction_fd, EXTRACTED_LEAF + "/" + ARCHIVE_ROOT, True)
        opened.append(opened_distribution)
        opened_node, node_saved = _open_path(opened_distribution, NODE_PATH)
        opened.append(opened_node)
        opened_npm, npm_saved = _open_path(opened_distribution, NPM_PATH)
        opened.append(opened_npm)
        opened_journal, journal_saved = _open_path(attempt_fd, JOURNAL_LEAF, True)
        opened.append(opened_journal)
        need(identity(os.fstat(archive_fd)) == identity(archive_saved)
             and identity(os.fstat(acquisition_receipt_fd)) == identity(fetch_saved)
             and identity(os.fstat(extraction_receipt_fd)) == identity(extract_receipt_saved)
             and identity(os.fstat(distribution_fd)) == identity(distribution_saved)
             and identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(npm_fd)) == identity(npm_saved)
             and identity(os.fstat(journal_fd)) == identity(journal_saved))
        link_parts = NPM_LINK.split("/")
        link_parent = os.dup(distribution_fd)
        try:
            for part in link_parts[:-1]:
                child, _ = _open_directory(link_parent, part)
                os.close(link_parent)
                link_parent = child
            link = os.stat(link_parts[-1], dir_fd=link_parent, follow_symlinks=False)
            need(stat.S_ISLNK(link.st_mode) and link.st_uid == os.geteuid()
                 and os.readlink(link_parts[-1], dir_fd=link_parent) == NPM_LINK_TARGET)
        finally:
            os.close(link_parent)
        return (archive_saved, fetch_saved, extract_receipt_saved, distribution_saved,
                node_saved, npm_saved, link, journal_saved)
    finally:
        for fd in reversed(opened):
            os.close(fd)
        if extraction_fd is not None:
            os.close(extraction_fd)
        if acquisition_fd is not None:
            os.close(acquisition_fd)


def _parse_acquisition(raw: bytes, archive_sha: str, archive_saved: os.stat_result):
    value = decode(raw)
    exact(value, ("schema", "url", "redirects", "bytes", "sha256", "proxy",
                  "bootstrap_ca_sha256"))
    need(value["schema"] == "compatible-full-app-node-archive-fetch-receipt.v1"
         and value["url"] == ARCHIVE_URL and value["redirects"] == 0
         and value["bytes"] == archive_saved.st_size and value["sha256"] == archive_sha
         and value["proxy"] == "disabled")
    lower_hash(value["bootstrap_ca_sha256"])
    return value


def _leaf_evidence(value, relative: str, digest: str, saved: os.stat_result):
    exact(value, ("relative_path", "sha256", "bytes", "identity"))
    need(value["relative_path"] == relative and value["sha256"] == digest
         and value["bytes"] == saved.st_size and value["identity"] == list(identity(saved)))


def _parse_extraction(raw: bytes, archive_saved: os.stat_result,
                      distribution_saved: os.stat_result, node_sha: str,
                      node_saved: os.stat_result, npm_sha: str, npm_saved: os.stat_result,
                      npm_link_saved: os.stat_result):
    value = decode(raw)
    exact(value, ("schema", "preparation_sha256", "policy_sha256", "archive_sha256",
                  "archive_identity", "archive_root", "distribution_root_identity",
                  "node_version", "npm_version", "members", "expanded_bytes", "node",
                  "npm_cli", "npm_link", "node_executed", "runtime_admission"))
    need(value["schema"] == "compatible-full-app-node24-extraction-evidence.v1"
         and value["preparation_sha256"] == PREPARATION_SHA256
         and value["policy_sha256"] == POLICY_SHA256
         and value["archive_sha256"] == ARCHIVE_SHA256
         and value["archive_identity"] == list(identity(archive_saved))
         and value["archive_root"] == ARCHIVE_ROOT
         and value["distribution_root_identity"] == list(identity(distribution_saved))
         and value["node_version"] == NODE_VERSION and value["npm_version"] == NPM_VERSION
         and type(value["members"]) is int and 0 < value["members"] <= 65_536
         and type(value["expanded_bytes"]) is int and 0 < value["expanded_bytes"] <= 402_653_184
         and value["node_executed"] is False and value["runtime_admission"] is False)
    _leaf_evidence(value["node"], NODE_PATH, node_sha, node_saved)
    _leaf_evidence(value["npm_cli"], NPM_PATH, npm_sha, npm_saved)
    exact(value["npm_link"], ("relative_path", "target", "identity"))
    need(value["npm_link"]["relative_path"] == NPM_LINK
         and value["npm_link"]["target"] == NPM_LINK_TARGET
         and value["npm_link"]["identity"] == list(identity(npm_link_saved)))
    return value


RUNNER_KEYS = {"schema", "purpose", "serial", "pid", "starttime", "policy_sha256",
               "node_sha256", "npm_cli_sha256", "npm_trust_evidence_sha256",
               "stdout_bytes", "stdout_sha256", "stderr_bytes", "stderr_sha256",
               "cleanup_complete", "base_adapter_sha256", "base_receipt_sha256",
               "distribution_archive_sha256", "node_version", "npm_version",
               "origin_guard_sha256"}


def _runner(journal_fd: int, serial: int, purpose: str, expected_output: bytes,
            node_sha: str, npm_sha: str, deadline: Deadline):
    prefix = "long-command-%d-%s" % (serial, purpose)
    supplemental_raw, _ = _read_at(journal_fd, prefix + ".node24.receipt.json",
                                   RECEIPT_LIMIT, deadline)
    value = decode(supplemental_raw)
    exact(value, RUNNER_KEYS)
    need(value["schema"] == "compatible-full-app-long-process-node24-receipt.v1"
         and value["purpose"] == purpose and value["serial"] == serial
         and type(value["pid"]) is int and value["pid"] > 0
         and type(value["starttime"]) is int and value["starttime"] > 0
         and value["node_sha256"] == node_sha and value["npm_cli_sha256"] == npm_sha
         and value["cleanup_complete"] is True
         and value["base_adapter_sha256"] == BASE_ADAPTER_SHA256
         and value["distribution_archive_sha256"] == ARCHIVE_SHA256
         and value["node_version"] == NODE_VERSION and value["npm_version"] == NPM_VERSION
         and value["origin_guard_sha256"] == ORIGIN_GUARD_SHA256)
    for key in ("policy_sha256", "node_sha256", "npm_cli_sha256",
                "npm_trust_evidence_sha256", "stdout_sha256", "stderr_sha256",
                "base_receipt_sha256"):
        lower_hash(value[key])
    base_raw, _ = _read_at(journal_fd, prefix + ".receipt.json", RECEIPT_LIMIT, deadline)
    need(hashlib.sha256(base_raw).hexdigest() == value["base_receipt_sha256"])
    base = decode(base_raw)
    base_keys = RUNNER_KEYS - {"base_adapter_sha256", "base_receipt_sha256",
                               "distribution_archive_sha256", "node_version",
                               "npm_version", "origin_guard_sha256"}
    exact(base, base_keys)
    need(base["schema"] == "compatible-full-app-long-process-receipt.v1"
         and all(base[key] == value[key] for key in base_keys - {"schema"}))
    stdout, _ = _read_at(journal_fd, prefix + ".out", 65_536, deadline, True)
    stderr, _ = _read_at(journal_fd, prefix + ".err", 65_536, deadline, True)
    need(stdout == expected_output and stderr == b""
         and value["stdout_bytes"] == len(stdout)
         and value["stdout_sha256"] == hashlib.sha256(stdout).hexdigest()
         and value["stderr_bytes"] == 0
         and value["stderr_sha256"] == hashlib.sha256(b"").hexdigest())
    owner_raw, _ = _read_at(journal_fd, prefix + ".owner.json", 4_096, deadline)
    closed_raw, _ = _read_at(journal_fd, prefix + ".closed.json", 4_096, deadline)
    owner = decode(owner_raw, 4_096)
    closed = decode(closed_raw, 4_096)
    exact(owner, ("schema", "pid", "starttime", "pgid", "sid"))
    exact(closed, ("schema", "pid", "starttime", "pgid", "sid"))
    need(owner["schema"] == "auth-chain-command-owner.v1"
         and closed["schema"] == "auth-chain-command-closed.v1"
         and all(owner[key] == closed[key] for key in ("pid", "starttime", "pgid", "sid"))
         and owner["pid"] == value["pid"] and owner["starttime"] == value["starttime"]
         and owner["pid"] == owner["pgid"] == owner["sid"])
    return value, supplemental_raw


def _tool_receipt(tool: str, version: str, tool_sha: str, tool_saved: os.stat_result,
                  node_sha: str, runner: dict, runner_raw: bytes):
    return {
        "schema": "compatible-full-app-node24-tool-version-evidence.v1",
        "tool": tool,
        "version": version,
        "launcher_node_sha256": node_sha,
        "tool_sha256": tool_sha,
        "tool_bytes": tool_saved.st_size,
        "tool_identity": list(identity(tool_saved)),
        "runner_receipt_sha256": hashlib.sha256(runner_raw).hexdigest(),
        "runner_policy_sha256": runner["policy_sha256"],
        "runner_stdout_sha256": runner["stdout_sha256"],
        "cleanup_complete": True,
        "runtime_admission": False,
    }


def join_route(preparation_raw: bytes, parent_fd: int, attempt_fd: int,
               archive_fd: int, acquisition_receipt_fd: int,
               extraction_receipt_fd: int, distribution_fd: int,
               node_fd: int, npm_fd: int, journal_fd: int):
    """Join already-produced evidence. This function has no process-launch seam."""
    bound = False
    attempt_saved = None
    outputs = []
    try:
        deadline = Deadline(60)
        _, attempt_saved = _bind_attempt(parent_fd, attempt_fd)
        bound = True
        need(len({parent_fd, attempt_fd, archive_fd, acquisition_receipt_fd,
                  extraction_receipt_fd, distribution_fd, node_fd, npm_fd,
                  journal_fd}) == 9)
        need(type(preparation_raw) is bytes and 0 < len(preparation_raw) <= RECEIPT_LIMIT
             and hashlib.sha256(preparation_raw).hexdigest() == PREPARATION_SHA256)
        (archive_layout, fetch_layout, extract_layout, distribution_layout,
         node_layout, npm_layout, npm_link_layout, journal_layout) = _bind_inputs(
            attempt_fd, archive_fd, acquisition_receipt_fd, extraction_receipt_fd,
            distribution_fd, node_fd, npm_fd, journal_fd, deadline)
        archive_sha, archive_saved = _hash_fd(archive_fd, ARCHIVE_LIMIT, deadline)
        node_sha, node_saved = _hash_fd(node_fd, NODE_LIMIT, deadline, True)
        npm_sha, npm_saved = _hash_fd(npm_fd, NPM_LIMIT, deadline)
        need(archive_sha == ARCHIVE_SHA256
             and not archive_saved.st_mode & 0o222
             and 1_000_000 <= node_saved.st_size <= NODE_LIMIT
             and identity(archive_saved) == identity(archive_layout)
             and identity(node_saved) == identity(node_layout)
             and identity(npm_saved) == identity(npm_layout)
             and identity(distribution_layout) == identity(os.fstat(distribution_fd))
             and identity(journal_layout) == identity(os.fstat(journal_fd)))
        acquisition_raw, fetch_saved = _read_fd(acquisition_receipt_fd,
                                                RECEIPT_LIMIT, deadline, 0o600)
        extraction_raw, extraction_saved = _read_fd(extraction_receipt_fd,
                                                    RECEIPT_LIMIT, deadline, 0o600)
        need(identity(fetch_saved) == identity(fetch_layout)
             and identity(extraction_saved) == identity(extract_layout))
        _parse_acquisition(acquisition_raw, archive_sha, archive_saved)
        extraction = _parse_extraction(extraction_raw, archive_saved,
                                       os.fstat(distribution_fd), node_sha, node_saved,
                                       npm_sha, npm_saved, npm_link_layout)
        node_runner, node_runner_raw = _runner(journal_fd, 1, "node-version",
                                               (NODE_VERSION + "\n").encode("ascii"),
                                               node_sha, npm_sha, deadline)
        npm_runner, npm_runner_raw = _runner(journal_fd, 2, "npm-version",
                                             (NPM_VERSION + "\n").encode("ascii"),
                                             node_sha, npm_sha, deadline)
        need(node_runner["policy_sha256"] == npm_runner["policy_sha256"]
             and node_runner["npm_trust_evidence_sha256"] ==
             npm_runner["npm_trust_evidence_sha256"])
        node_receipt = _tool_receipt("node", NODE_VERSION, node_sha, node_saved,
                                     node_sha, node_runner, node_runner_raw)
        npm_receipt = _tool_receipt("npm", NPM_VERSION, npm_sha, npm_saved,
                                    node_sha, npm_runner, npm_runner_raw)
        owner_evidence = {
            "schema": "compatible-full-app-node24-executable-evidence.v1",
            "policy_sha256": POLICY_SHA256,
            "adapter_sha256": NODE24_ADAPTER_SHA256,
            "archive_sha256": ARCHIVE_SHA256,
            "node_version": NODE_VERSION,
            "archive_root": ARCHIVE_ROOT,
            "node_relative_path": NODE_PATH,
            "node_executable_sha256": node_sha,
            "node_executable_bytes": node_saved.st_size,
        }
        node_raw = canonical(node_receipt)
        npm_raw = canonical(npm_receipt)
        owner_raw = canonical(owner_evidence)
        need(len(owner_raw) <= 4_096)
        route = {
            "schema": "compatible-full-app-node24-acquisition-route-evidence.v1",
            "preparation_sha256": PREPARATION_SHA256,
            "acquisition_receipt_sha256": hashlib.sha256(acquisition_raw).hexdigest(),
            "extraction_receipt_sha256": hashlib.sha256(extraction_raw).hexdigest(),
            "archive_sha256": archive_sha,
            "archive_identity": list(identity(archive_saved)),
            "distribution_root_identity": extraction["distribution_root_identity"],
            "node_version_receipt_sha256": hashlib.sha256(node_raw).hexdigest(),
            "npm_version_receipt_sha256": hashlib.sha256(npm_raw).hexdigest(),
            "static_owner_evidence_sha256": hashlib.sha256(owner_raw).hexdigest(),
            "runner_policy_sha256": node_runner["policy_sha256"],
            "sdk_routing": False,
            "immutable_source_root_bound": False,
            "writable_build_root_or_overlay_bound": False,
            "source_to_build_derivation_bound": False,
            "read_only_tree_bound": False,
            "launch_admitted": False,
            "runtime_admission": False,
            "blockers": [
                "exact2445_root_has_no_scripts_directory_use_separate_verified_sdk_package_root",
                "immutable_source_root_transition_receipt_required",
                "separately_verified_writable_build_root_or_overlay_receipt_required",
                "immutable_source_root_must_not_be_npm_ci_or_build_cwd",
                "built_dist_read_only_transition_receipt_required",
                "static_owner_native_positive_required",
                "browser_import_actor_cleanup_and_outer_workflow_required",
            ],
        }
        route_raw = canonical(route)
        for key, raw in (("node", node_raw), ("npm", npm_raw),
                         ("owner", owner_raw), ("route", route_raw)):
            fd, saved = _write_once(attempt_fd, OUTPUTS[key], raw)
            outputs.append((fd, saved, key, raw))
        os.fsync(attempt_fd)
        final_archive, _ = _hash_fd(archive_fd, ARCHIVE_LIMIT, deadline)
        final_node, _ = _hash_fd(node_fd, NODE_LIMIT, deadline, True)
        final_npm, _ = _hash_fd(npm_fd, NPM_LIMIT, deadline)
        _, final_attempt = _bind_attempt(parent_fd, attempt_fd)
        final_layout = _bind_inputs(
            attempt_fd, archive_fd, acquisition_receipt_fd, extraction_receipt_fd,
            distribution_fd, node_fd, npm_fd, journal_fd, deadline, True)
        need(final_archive == archive_sha and final_node == node_sha and final_npm == npm_sha
             and os.pread(acquisition_receipt_fd, fetch_saved.st_size + 1, 0) == acquisition_raw
             and os.pread(extraction_receipt_fd, extraction_saved.st_size + 1, 0) == extraction_raw
             and anchor(final_attempt) == anchor(attempt_saved)
             and all(identity(final_layout[index]) == identity(value)
                     for index, value in enumerate((archive_layout, fetch_layout,
                                                    extract_layout, distribution_layout,
                                                    node_layout, npm_layout,
                                                    npm_link_layout, journal_layout))))
        for fd, saved, key, raw in outputs:
            need(identity(os.fstat(fd)) == identity(saved)
                 and os.pread(fd, len(raw) + 1, 0) == raw
                 and identity(os.stat(OUTPUTS[key], dir_fd=attempt_fd,
                                      follow_symlinks=False)) == identity(saved))
        return {"node": node_raw, "npm": npm_raw, "owner": owner_raw, "route": route_raw}
    except BaseException as failure:
        if bound:
            try:
                discard_attempt(parent_fd, attempt_fd, attempt_saved)
            except BaseException as cleanup:
                raise RouteFailure(
                    "compatible_full_app_node24_acquisition_route_cleanup_incomplete"
                ) from cleanup
        if isinstance(failure, RouteFailure):
            raise
        raise RouteFailure("compatible_full_app_node24_acquisition_route_denied") from failure
    finally:
        for fd, *_ in outputs:
            try:
                os.close(fd)
            except OSError:
                pass


def main() -> int:
    print("compatible-full-app-node24-acquisition-route HOLD extraction_publication_readonly_tree_and_native_runner_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
