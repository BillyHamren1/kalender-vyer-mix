"""Source-only, held-FD Node24 install and SDK-unit execution join.

This additive controller is intentionally limited to node/npm version probes,
``npm ci`` and the fixed SDK shape unit.  It consumes the separately reviewed
post-placement writable-root evidence and never mutates the immutable source
snapshot.  It grants no app-build, browser, product-runtime or release
authority.  No CLI route is enabled.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import PurePosixPath
import resource
import stat
import subprocess
import time


SOURCE_HEAD = "b6449cc43c46176e842cc6c891dd609fdcd44579"
SOURCE_TREE = "038e81fb51f61062c103711f4823435c4dd2f6d4"
PLACEMENT_SOURCE_SHA256 = "965c801b795dde27cf5c5d5c8753eb8cf9029f4dfe4780ebee49c1497422358e"
WRITABLE_SOURCE_SHA256 = "dd063d2fd138dea08bae107a73bb81704fc9f129b3ea7f63e210bb9df0062c8d"
NODE24_RUNNER_SHA256 = "7a3028e0650e1ba5f3751a893fe15cb8213e05ba90381b241eed3beb087245c8"
BASE_RUNNER_SHA256 = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"
ORIGIN_GUARD_SHA256 = "767145176eb49355611612f883b85a60babe8bff11cd41e69b4ffca33589369a"
CA_EXPORT_SOURCE_SHA256 = "dad7e0cd6b352f899da2dc2a9a50069a478f1a866db7402207355a6699e8008b"
CA_EXPORT_CAPTURE_SHA256 = "16a0644858cd8f1090a61f0b6ac96fd17d0811bcecab15a5f362a5310f7a602f"
CA_EXPORT_SCRIPT_SHA256 = "eabddb520af9e19ab8970752e9c21db7e5b15385abe2cad298635fc100aed646"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
PREPARATION_SHA256 = "e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42"
PREPARATION_POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
ARCHIVE_ROOT = "node-v24.21.0-linux-x64"
NODE_RELATIVE = ARCHIVE_ROOT + "/bin/node"
NPM_RELATIVE = ARCHIVE_ROOT + "/lib/node_modules/npm/bin/npm-cli.js"
NPM_LINK_RELATIVE = ARCHIVE_ROOT + "/bin/npm"
NPM_LINK_TARGET = "../lib/node_modules/npm/bin/npm-cli.js"
ATTEMPT_LEAF = "compatible-full-app-writable-attempt"
BUILD_ROOT_LEAF = "compatible-full-app-writable-root"
WRITABLE_RECEIPT_LEAF = "compatible-full-app-writable-build-root-evidence.json"
PLACEMENT_RECEIPT_LEAF = "sdk-placement-node24-evidence.json"
EXECUTION_RECEIPT_LEAF = "sdk-node24-execution-evidence.json"
SDK_TEST = "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs"
SDK_PASS = ("compatible-full-app-sdk-shape-node24 PASS node=v24.21.0 sdk=2.116.0 "
            "source_files=2445 services=9 forwarded=9 auth=false native=false app=false\n").encode("ascii")
SDK_FILES = {
    "scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts":
        ("b6bde1facf9ed7c886f715069924e2c049808d2da9e16b72a35debb46013e764", 7394),
    SDK_TEST: ("67725d5ecb583a44969a660b7a803de58d268ba14623489d8111f7aeafb1772a", 8991),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-source.mjs":
        ("51b68fc0b98ce5d54943d627fc2ee5bc3668f7cb471625ebe7ed97b2ea2b7292", 6822),
}
PHASES = ("node-version", "npm-version", "npm-ci", "sdk-unit")
SECONDS = {"node-version": 10, "npm-version": 10, "npm-ci": 600, "sdk-unit": 60}
OUTPUT_CAPS = {"node-version": 65_536, "npm-version": 65_536,
               "npm-ci": 8_388_608, "sdk-unit": 1_048_576}
CLEANUP_SECONDS = 15
TREE_SECONDS = 300
ENTRY_CAP = 500_000
DIRECTORY_CAP = 100_000
TOTAL_BYTES_CAP = 4_294_967_296
FILE_BYTES_CAP = 268_435_456
RECEIPT_CAP = 65_536
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")
PLACEMENT_KEYS = {
    "schema", "source_head", "source_tree", "app_manifest_sha256",
    "writable_build_receipt_sha256", "sdk_root_receipt_sha256",
    "node24_extraction_receipt_sha256", "writable_pre_root_identity",
    "writable_pre_tree_identity_sha256", "writable_post_root_identity",
    "writable_post_tree_identity_sha256", "sdk_package_sha256", "files",
    "node_version", "npm_version", "node_sha256", "node_identity",
    "npm_cli_sha256", "npm_cli_identity", "execution_cwd_identity",
    "execution_purpose", "execution_relative_path", "placement_complete",
    "sdk_root_producer_provenance", "node_executed", "npm_ci_admitted",
    "sdk_unit_admitted", "app_build_admitted", "post_build_dist_verification",
    "runtime_admission",
}
EGRESS_KEYS = {"schema", "archive_sha256", "registry_origin", "tcp_destination",
               "dns_policy_sha256", "raw_socket_denied", "producer_sha256"}
CA_KEYS = {"schema", "archive_sha256", "node_version", "node_sha256",
           "script_sha256", "ca_sha256", "ca_bytes", "certificates",
           "cleanup_complete"}
_PENDING: dict[str, dict] = {}


class ExecutionFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise ExecutionFailure("compatible_full_app_sdk_node24_execution_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def lowercase_hash(value) -> str:
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
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True).encode("ascii")


def decode(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= RECEIPT_CAP)
    try:
        return json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(ExecutionFailure()))
    except (ValueError, UnicodeError):
        raise ExecutionFailure("compatible_full_app_sdk_node24_execution_denied") from None


def _load(raw: bytes, expected: str, name: str):
    need(type(raw) is bytes and 0 < len(raw) <= 131_072
         and hashlib.sha256(raw).hexdigest() == expected and name.isidentifier())
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader=None))
    exec(compile(raw, "<captured-" + name + ">", "exec"), module.__dict__)
    return module


def _directory(fd: int, mode: int = 0o700) -> os.stat_result:
    value = os.fstat(fd)
    need(stat.S_ISDIR(value.st_mode) and value.st_uid == os.geteuid()
         and value.st_gid == os.getegid() and stat.S_IMODE(value.st_mode) == mode)
    return value


def _empty(fd: int) -> None:
    with os.scandir(fd) as entries:
        need(next(entries, None) is None)


def _read_fd(fd: int, cap: int, expected: str | None = None,
             allow_empty: bool = False) -> tuple[bytes, os.stat_result]:
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_nlink == 1 and not saved.st_mode & 0o022
         and 0 <= saved.st_size <= cap and (allow_empty or saved.st_size > 0))
    raw = os.pread(fd, saved.st_size + 1, 0)
    need(len(raw) == saved.st_size and identity(os.fstat(fd)) == identity(saved))
    if expected is not None:
        need(hashlib.sha256(raw).hexdigest() == lowercase_hash(expected))
    return raw, saved


def _bound_leaf(parent_fd: int, leaf: str, fd: int, raw: bytes) -> os.stat_result:
    at = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
    need(identity(at) == identity(os.fstat(fd)) and at.st_size == len(raw)
         and os.pread(fd, len(raw) + 1, 0) == raw)
    return at


def _open_relative(root_fd: int, relative: str) -> tuple[int, os.stat_result]:
    parts = PurePosixPath(relative).parts
    need(parts and not PurePosixPath(relative).is_absolute()
         and all(part not in ("", ".", "..") for part in parts))
    opened = [os.dup(root_fd)]
    try:
        for part in parts[:-1]:
            before = os.stat(part, dir_fd=opened[-1], follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
                 and not before.st_mode & 0o022)
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=opened[-1])
            need(identity(os.fstat(child)) == identity(before))
            opened.append(child)
        before = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_nlink == 1 and not before.st_mode & 0o022)
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=opened[-1])
        need(identity(os.fstat(leaf)) == identity(before))
        return leaf, before
    finally:
        for fd in reversed(opened):
            os.close(fd)


def _verify_sdk_files(build_fd: int, held: dict[str, int]) -> dict[str, list[int]]:
    need(type(held) is dict and set(held) == set(SDK_FILES)
         and len(set(held.values())) == len(held))
    result = {}
    for path, (digest, size) in SDK_FILES.items():
        opened, saved = _open_relative(build_fd, path)
        try:
            raw, held_saved = _read_fd(held[path], size, digest)
            need(len(raw) == size and hashlib.sha256(os.pread(opened, size + 1, 0)).hexdigest() == digest
                 and identity(os.fstat(opened)) == identity(saved)
                 and identity(held_saved) == identity(saved))
            result[path] = list(identity(saved))
        finally:
            os.close(opened)
    return result


def _safe_link(parent: PurePosixPath, target: str) -> str:
    need(type(target) is str and 0 < len(target.encode("utf-8")) <= 4096
         and not target.startswith("/"))
    stack = list(parent.parts)
    for part in PurePosixPath(target).parts:
        if part in ("", "."):
            continue
        if part == "..":
            need(bool(stack)); stack.pop()
        else:
            need(part not in ("/",)); stack.append(part)
    return "/".join(stack)


def _tree_manifest(root_fd: int, deadline: float) -> dict:
    """Bounded FD/openat inventory of the complete mutable build tree."""
    need(time.monotonic() < deadline)
    root_saved = _directory(root_fd)
    digest = hashlib.sha256()
    counters = {"entries": 0, "directories": 1, "files": 0, "symlinks": 0,
                "bytes": 0}

    def visit(directory_fd: int, prefix: PurePosixPath, depth: int) -> None:
        need(depth <= 64 and time.monotonic() < deadline)
        names = []
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                counters["entries"] += 1
                need(counters["entries"] <= ENTRY_CAP and time.monotonic() < deadline
                     and entry.name not in ("", ".", "..") and "/" not in entry.name
                     and "\x00" not in entry.name)
                names.append(entry.name)
        names.sort(key=lambda name: name.encode("utf-8"))
        for name in names:
            need(time.monotonic() < deadline)
            path = prefix / name
            shown = str(path)
            before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            need(before.st_uid == os.geteuid())
            if stat.S_ISDIR(before.st_mode):
                need(not before.st_mode & 0o022)
                counters["directories"] += 1
                need(counters["directories"] <= DIRECTORY_CAP)
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=directory_fd)
                try:
                    need(identity(os.fstat(child)) == identity(before))
                    digest.update(canonical(["d", shown, stat.S_IMODE(before.st_mode)]))
                    visit(child, path, depth + 1)
                    need(identity(os.fstat(child)) == identity(before))
                finally:
                    os.close(child)
            elif stat.S_ISREG(before.st_mode):
                need(before.st_nlink == 1 and before.st_size <= FILE_BYTES_CAP
                     and not before.st_mode & 0o022)
                leaf = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                               dir_fd=directory_fd)
                try:
                    need(identity(os.fstat(leaf)) == identity(before))
                    content = hashlib.sha256(); offset = 0
                    while offset <= before.st_size:
                        need(time.monotonic() < deadline)
                        part = os.pread(leaf, min(65_536, before.st_size + 1 - offset), offset)
                        if not part:
                            break
                        offset += len(part); content.update(part)
                    need(offset == before.st_size and identity(os.fstat(leaf)) == identity(before))
                finally:
                    os.close(leaf)
                counters["files"] += 1; counters["bytes"] += before.st_size
                need(counters["bytes"] <= TOTAL_BYTES_CAP)
                digest.update(canonical(["f", shown, stat.S_IMODE(before.st_mode),
                                         before.st_size, content.hexdigest()]))
            elif stat.S_ISLNK(before.st_mode):
                target = os.readlink(name, dir_fd=directory_fd)
                _safe_link(prefix, target)
                need(identity(os.stat(name, dir_fd=directory_fd,
                                      follow_symlinks=False)) == identity(before))
                counters["symlinks"] += 1
                digest.update(canonical(["l", shown, target]))
            else:
                need(False)

    visit(root_fd, PurePosixPath(), 0)
    need(identity(os.fstat(root_fd)) == identity(root_saved))
    return {"root_identity": list(identity(root_saved)),
            "tree_sha256": digest.hexdigest(), **counters}


def _verify_original_files(writable, build_fd: int, rows: dict) -> str:
    """Rehash all exact 2,445 source files while tolerating added node_modules."""
    deadline = writable.Deadline(TREE_SECONDS)
    result = hashlib.sha256()
    for path in sorted(rows):
        deadline.check()
        row = rows[path]
        fd, saved = writable._open_relative(build_fd, path, False, 0o600)
        try:
            raw = writable._read_fd(fd, row["bytes"], deadline)
            need(writable._blob(raw) == row["git_blob_sha1"]
                 and identity(os.fstat(fd)) == identity(saved))
            result.update(path.encode("utf-8") + b"\0")
            result.update(row["git_blob_sha1"].encode("ascii") + b"\n")
        finally:
            os.close(fd)
    return result.hexdigest()


def _write_once(directory_fd: int, leaf: str, raw: bytes) -> tuple[int, os.stat_result]:
    need(type(raw) is bytes and 0 < len(raw) <= RECEIPT_CAP
         and leaf not in ("", ".", "..") and "/" not in leaf)
    fd = os.open(leaf, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    accepted = False
    try:
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            need(written > 0); offset += written
        os.fchmod(fd, 0o600); os.fsync(fd); saved = os.fstat(fd)
        need(stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_nlink == 1
             and saved.st_size == len(raw) and os.pread(fd, len(raw) + 1, 0) == raw
             and identity(os.stat(leaf, dir_fd=directory_fd,
                                  follow_symlinks=False)) == identity(saved))
        accepted = True
        return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def _read_named(directory_fd: int, leaf: str, cap: int,
                allow_empty: bool) -> tuple[bytes, os.stat_result]:
    before = os.stat(leaf, dir_fd=directory_fd, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
         and 0 <= before.st_size < cap and (allow_empty or before.st_size > 0))
    fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                 dir_fd=directory_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
        raw = os.pread(fd, before.st_size + 1, 0)
        need(len(raw) == before.st_size and identity(os.fstat(fd)) == identity(before)
             and identity(os.stat(leaf, dir_fd=directory_fd,
                                  follow_symlinks=False)) == identity(before))
        return raw, before
    finally:
        os.close(fd)


def _rebind_journal(journal_fd: int, phase_receipts: list[dict]) -> list[dict]:
    expected = set()
    for serial, purpose in enumerate(PHASES, 1):
        prefix = "sdk-execution-%d-%s" % (serial, purpose)
        expected.update(prefix + suffix for suffix in
                        (".out", ".err", ".owner.json", ".closed.json", ".receipt.json"))
    observed = set()
    with os.scandir(journal_fd) as entries:
        for entry in entries:
            need(len(observed) < len(expected) and entry.name not in observed)
            observed.add(entry.name)
    need(observed == expected and len(phase_receipts) == len(PHASES))
    durable = []
    for serial, purpose in enumerate(PHASES, 1):
        prefix = "sdk-execution-%d-%s" % (serial, purpose)
        receipt_raw, _ = _read_named(journal_fd, prefix + ".receipt.json",
                                     RECEIPT_CAP + 1, False)
        receipt = decode(receipt_raw)
        need(receipt == phase_receipts[serial - 1] and canonical(receipt) == receipt_raw)
        stdout, _ = _read_named(journal_fd, prefix + ".out", OUTPUT_CAPS[purpose], True)
        stderr, _ = _read_named(journal_fd, prefix + ".err", OUTPUT_CAPS[purpose], True)
        owner_raw, _ = _read_named(journal_fd, prefix + ".owner.json", 4097, False)
        closed_raw, _ = _read_named(journal_fd, prefix + ".closed.json", 4097, False)
        owner = decode(owner_raw); closed = decode(closed_raw)
        exact(owner, ("schema", "pid", "starttime", "pgid", "sid"))
        exact(closed, ("schema", "pid", "starttime", "pgid", "sid"))
        need(canonical(owner) == owner_raw and canonical(closed) == closed_raw
             and owner["schema"] == "auth-chain-command-owner.v1"
             and closed["schema"] == "auth-chain-command-closed.v1"
             and all(owner[key] == closed[key] for key in ("pid", "starttime", "pgid", "sid"))
             and owner["pid"] == receipt["pid"] and owner["starttime"] == receipt["starttime"]
             and len(stdout) == receipt["stdout_bytes"]
             and hashlib.sha256(stdout).hexdigest() == receipt["stdout_sha256"]
             and len(stderr) == receipt["stderr_bytes"]
             and hashlib.sha256(stderr).hexdigest() == receipt["stderr_sha256"])
        durable.append({"purpose": purpose, "serial": serial, "pid": receipt["pid"],
                        "starttime": receipt["starttime"],
                        "receipt_sha256": hashlib.sha256(receipt_raw).hexdigest(),
                        "stdout_sha256": receipt["stdout_sha256"],
                        "stderr_sha256": receipt["stderr_sha256"]})
    return durable


def _validate_ca_journal(ca_journal_fd: int, ca_receipt_fd: int,
                         ca_receipt_raw: bytes) -> dict:
    _directory(ca_journal_fd)
    expected = {"ca-export.err", "ca-export.owner.json",
                "ca-export.closed.json", "ca-export.receipt.json"}
    observed = set()
    with os.scandir(ca_journal_fd) as entries:
        for entry in entries:
            need(len(observed) < len(expected) and entry.name not in observed)
            observed.add(entry.name)
    need(observed == expected)
    stderr, _ = _read_named(ca_journal_fd, "ca-export.err", 65_536, True)
    owner_raw, _ = _read_named(ca_journal_fd, "ca-export.owner.json", 4097, False)
    closed_raw, _ = _read_named(ca_journal_fd, "ca-export.closed.json", 4097, False)
    receipt_path_raw, receipt_path_saved = _read_named(
        ca_journal_fd, "ca-export.receipt.json", RECEIPT_CAP + 1, False)
    owner = decode(owner_raw); closed = decode(closed_raw)
    exact(owner, ("schema", "pid", "starttime", "pgid", "sid"))
    exact(closed, ("schema", "pid", "starttime", "pgid", "sid"))
    need(stderr == b"" and canonical(owner) == owner_raw and canonical(closed) == closed_raw
         and owner["schema"] == "auth-chain-command-owner.v1"
         and closed["schema"] == "compatible-full-app-node24-ca-export-closed.v1"
         and all(type(owner[key]) is int and owner[key] > 0
                 for key in ("pid", "starttime", "pgid", "sid"))
         and all(owner[key] == closed[key] for key in ("pid", "starttime", "pgid", "sid"))
         and receipt_path_raw == ca_receipt_raw
         and identity(receipt_path_saved) == identity(os.fstat(ca_receipt_fd)))
    return {"owner_sha256": hashlib.sha256(owner_raw).hexdigest(),
            "closed_sha256": hashlib.sha256(closed_raw).hexdigest(),
            "stderr_sha256": hashlib.sha256(stderr).hexdigest(),
            "pid": owner["pid"], "starttime": owner["starttime"]}


def _capture_owner(fd: int, child, deadline: float) -> tuple[int, int, int, int, str]:
    while time.monotonic() < deadline:
        raw = os.pread(fd, 4097, 0)
        if raw:
            break
        time.sleep(.01)
    need(raw and len(raw) <= 4096)
    value = decode(raw)
    exact(value, ("schema", "pid", "starttime", "pgid", "sid"))
    need(value["schema"] == "auth-chain-command-owner.v1"
         and canonical(value) == raw
         and all(type(value[key]) is int and value[key] > 0
                 for key in ("pid", "starttime", "pgid", "sid"))
         and value["pid"] == child.pid and value["pgid"] == child.pid
         and value["sid"] == child.pid)
    return (value["pid"], value["starttime"], value["pgid"], value["sid"], "?")


def _phase_command(purpose: str, node_fd: int, npm_fd: int) -> tuple[str, ...]:
    need(SDK_TEST ==
         "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs")
    node = "/proc/self/fd/%d" % node_fd
    npm = "/proc/self/fd/%d" % npm_fd
    return {"node-version": (node, "--version"),
            "npm-version": (node, npm, "--version"),
            "npm-ci": (node, npm, "ci"),
            "sdk-unit": (node,
                         "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs")}[purpose]


def _phase_environment(state_fd: int, ca_fd: int, distribution_fd: int,
                       guard_fd: int, policy: dict) -> dict[str, str]:
    trust = policy["npm_trust"]
    return {"PATH": "/proc/self/fd/%d/%s/bin" % (distribution_fd, ARCHIVE_ROOT),
            "HOME": "/proc/self/fd/%d/home" % state_fd,
            "CI": "true", "LC_ALL": "C", "LANG": "C",
            "NPM_CONFIG_CACHE": "/proc/self/fd/%d/npm-cache" % state_fd,
            "NPM_CONFIG_REGISTRY": trust["registry_origin"],
            "NPM_CONFIG_CAFILE": "/proc/self/fd/%d" % ca_fd,
            "NPM_CONFIG_STRICT_SSL": "true",
            "NPM_CONFIG_UPDATE_NOTIFIER": "false", "NPM_CONFIG_AUDIT": "false",
            "NPM_CONFIG_FUND": "false", "NPM_CONFIG_PROXY": "",
            "NPM_CONFIG_HTTPS_PROXY": "",
            "NODE_OPTIONS": "--require=/proc/self/fd/%d" % guard_fd}


def _active_egress_gate() -> None:
    """Fail closed until an active child-lineage kernel enforcer is reviewed."""
    raise ExecutionFailure(
        "compatible_full_app_sdk_node24_active_egress_enforcer_required")


def recover_pending(custody, token: str, seconds: float = CLEANUP_SECONDS) -> dict:
    """Recover only an originally retained child and its held artifact FDs.

    No pathname is reopened and no PID is adopted from ambient state.  If the
    owner bytes cannot be authenticated, the identity query is anchored to the
    original unreleased Popen child.  Any uncertainty leaves `_PENDING` and
    `UNCERTAIN_CHILDREN` intact for a later outer recovery attempt.
    """
    need(type(token) is str and token in _PENDING
         and type(seconds) in (int, float) and 0 < seconds <= CLEANUP_SECONDS)
    pending = _PENDING[token]; child = pending["child"]
    need(token in custody.UNCERTAIN_CHILDREN
         and custody.UNCERTAIN_CHILDREN[token][0] is child
         and len(pending["handles"]) == 3)
    deadline = time.monotonic() + seconds
    try:
        try:
            saved = _capture_owner(pending["owner_fd"], child, deadline)
            owner_capture_verified = True
        except BaseException:
            acquired = custody.identity(child.pid)
            need(type(acquired) is tuple and len(acquired) >= 4
                 and acquired[0] == child.pid and acquired[2] == child.pid
                 and acquired[3] == child.pid)
            saved = (acquired[0], acquired[1], acquired[2], acquired[3], "?")
            owner_capture_verified = False
        pending["saved"] = saved
        custody.leader_current(saved, deadline)
        custody.stop_owned(child, saved, deadline)
        row = custody.REAPING_CHILDREN.get(id(child))
        need(type(row) is dict and row.get("child") is child and row.get("complete") is True)
        artifacts = []
        for handle, label in zip(pending["handles"], ("stdout", "stderr", "owner")):
            handle.flush(); saved_artifact = os.fstat(handle.fileno())
            need(stat.S_ISREG(saved_artifact.st_mode) and saved_artifact.st_uid == os.geteuid()
                 and saved_artifact.st_nlink == 1 and saved_artifact.st_size < 8_388_608)
            raw = os.pread(handle.fileno(), saved_artifact.st_size + 1, 0)
            need(len(raw) == saved_artifact.st_size
                 and identity(os.fstat(handle.fileno())) == identity(saved_artifact))
            artifacts.append({"name": label, "bytes": len(raw),
                              "sha256": hashlib.sha256(raw).hexdigest(),
                              "identity": list(identity(saved_artifact))})
        recovered = {"schema": "compatible-full-app-sdk-node24-recovery-evidence.v1",
                     "token": token, "pid": saved[0], "starttime": saved[1],
                     "pgid": saved[2], "sid": saved[3],
                     "owner_capture_verified": owner_capture_verified,
                     "artifacts": artifacts, "cleanup_complete": True,
                     "survivor_absence": True, "attempt_quarantine_admitted": True,
                     "execution_admission": False}
        raw = canonical(recovered)
        recovery_fd, recovery_saved = _write_once(
            pending["journal_fd"], token + ".recovery-closed.json", raw)
        try:
            need(os.pread(recovery_fd, len(raw) + 1, 0) == raw
                 and identity(os.fstat(recovery_fd)) == identity(recovery_saved))
        finally:
            os.close(recovery_fd)
        for handle in pending["handles"]:
            handle.close()
        os.close(pending["journal_fd"])
        custody.UNCERTAIN_CHILDREN.pop(token, None); _PENDING.pop(token, None)
        return recovered
    except BaseException as failure:
        if isinstance(failure, ExecutionFailure):
            raise
        raise ExecutionFailure("compatible_full_app_sdk_node24_recovery_incomplete") from failure


def _run_phase(custody, purpose: str, serial: int, build_fd: int, state_fd: int,
               journal_fd: int, distribution_fd: int, node_fd: int, npm_fd: int,
               ca_fd: int, guard_fd: int, policy: dict, popen=subprocess.Popen) -> dict:
    need(purpose in PHASES and serial == PHASES.index(purpose) + 1
         and not custody.UNCERTAIN_CHILDREN and not _PENDING
         and custody.proc_identity_valid()
         and all(row.get("complete") is True for row in custody.REAPING_CHILDREN.values()))
    began = time.monotonic(); execution_end = began + SECONDS[purpose]
    cleanup_end = execution_end + CLEANUP_SECONDS
    cap = OUTPUT_CAPS[purpose]; prefix = "sdk-execution-%d-%s" % (serial, purpose)
    handles = []; child = None; saved = None; token = prefix; completed = False
    journal_hold = os.dup(journal_fd)
    try:
        for suffix in (".out", ".err", ".owner.json"):
            fd = os.open(prefix + suffix, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                         0o600, dir_fd=journal_fd)
            os.fchmod(fd, 0o600); handles.append(os.fdopen(fd, "r+b", buffering=0))
        owner_fd = handles[2].fileno()

        def acquire():
            resource.setrlimit(resource.RLIMIT_FSIZE, (cap, cap))
            acquired = custody.identity(os.getpid())
            packet = canonical({"schema": "auth-chain-command-owner.v1",
                                "pid": acquired[0], "starttime": acquired[1],
                                "pgid": acquired[2], "sid": acquired[3]})
            offset = 0
            while offset < len(packet):
                written = os.write(owner_fd, packet[offset:])
                if written <= 0:
                    os._exit(126)
                offset += written
            os.fsync(owner_fd); os.close(owner_fd)

        passed = (build_fd, state_fd, journal_fd, distribution_fd, node_fd, npm_fd,
                  ca_fd, guard_fd, owner_fd)
        child = popen(_phase_command(purpose, node_fd, npm_fd), stdin=subprocess.DEVNULL,
                      stdout=handles[0], stderr=handles[1],
                      cwd="/proc/self/fd/%d" % build_fd, start_new_session=True,
                      preexec_fn=acquire, pass_fds=passed, close_fds=True,
                      env=_phase_environment(state_fd, ca_fd, distribution_fd, guard_fd, policy))
        owner_path = "/proc/self/fd/%d/%s.owner.json" % (journal_fd, prefix)
        custody.UNCERTAIN_CHILDREN[token] = (child, owner_path)
        _PENDING[token] = {"child": child, "handles": tuple(handles),
                           "owner_fd": owner_fd, "saved": None,
                           "journal_fd": journal_hold}
        saved = _capture_owner(owner_fd, child, cleanup_end)
        _PENDING[token]["saved"] = saved
        custody.leader_current(saved, cleanup_end)
        while True:
            status = custody.exited_unreaped(child, saved, cleanup_end)
            if status is not None:
                need(status.si_code == os.CLD_EXITED and status.si_status == 0)
                break
            need(time.monotonic() < execution_end)
            time.sleep(.01)
        need(time.monotonic() < execution_end)
        completed = True
    finally:
        if child is not None and saved is not None:
            custody.stop_owned(child, saved, cleanup_end)
            row = custody.REAPING_CHILDREN.get(id(child))
            need(type(row) is dict and row.get("child") is child and row.get("complete") is True)
            closed = canonical({"schema": "auth-chain-command-closed.v1", "pid": saved[0],
                                "starttime": saved[1], "pgid": saved[2], "sid": saved[3]})
            closed_fd, _ = _write_once(journal_fd, prefix + ".closed.json", closed)
            os.close(closed_fd)
            custody.UNCERTAIN_CHILDREN.pop(token, None); _PENDING.pop(token, None)
            os.close(journal_hold); journal_hold = -1
        if not completed and (child is None or saved is not None):
            for handle in handles:
                handle.close()
            if journal_hold >= 0:
                os.close(journal_hold); journal_hold = -1
    need(child is not None and saved is not None and token not in _PENDING
         and token not in custody.UNCERTAIN_CHILDREN
         and all(row.get("complete") is True for row in custody.REAPING_CHILDREN.values()))
    try:
        for handle in handles:
            handle.flush()
        output_values = []
        for handle, suffix in zip(handles, (".out", ".err", ".owner.json")):
            saved_output = os.fstat(handle.fileno())
            need(stat.S_ISREG(saved_output.st_mode) and saved_output.st_uid == os.geteuid()
                 and saved_output.st_nlink == 1 and stat.S_IMODE(saved_output.st_mode) == 0o600
                 and saved_output.st_size < (cap if suffix != ".owner.json" else 4097)
                 and identity(os.stat(prefix + suffix, dir_fd=journal_fd,
                                      follow_symlinks=False)) == identity(saved_output))
            raw_output = os.pread(handle.fileno(), saved_output.st_size + 1, 0)
            need(len(raw_output) == saved_output.st_size
                 and identity(os.fstat(handle.fileno())) == identity(saved_output))
            output_values.append(raw_output)
        out_raw, err_raw, owner_raw = output_values
        owner = decode(owner_raw)
        need(canonical(owner) == owner_raw and owner["pid"] == saved[0]
             and owner["starttime"] == saved[1] and owner["pgid"] == saved[2]
             and owner["sid"] == saved[3])
    finally:
        for handle in handles:
            handle.close()
    need(len(out_raw) < cap and len(err_raw) < cap)
    if purpose == "node-version":
        need(out_raw == (NODE_VERSION + "\n").encode("ascii") and err_raw == b"")
    if purpose == "npm-version":
        need(out_raw == (NPM_VERSION + "\n").encode("ascii") and err_raw == b"")
    if purpose == "sdk-unit":
        need(out_raw == SDK_PASS and err_raw == b"")
    receipt = {"schema": "compatible-full-app-sdk-node24-phase-receipt.v1",
               "purpose": purpose, "serial": serial, "pid": saved[0],
               "starttime": saved[1], "node_version": NODE_VERSION,
               "npm_version": NPM_VERSION, "stdout_bytes": len(out_raw),
               "stdout_sha256": hashlib.sha256(out_raw).hexdigest(),
               "stderr_bytes": len(err_raw),
               "stderr_sha256": hashlib.sha256(err_raw).hexdigest(),
               "cleanup_complete": True, "survivor_absence": True}
    raw = canonical(receipt)
    phase_fd, phase_saved = _write_once(journal_fd, prefix + ".receipt.json", raw)
    try:
        need(os.pread(phase_fd, len(raw) + 1, 0) == raw
             and identity(os.fstat(phase_fd)) == identity(phase_saved))
    finally:
        os.close(phase_fd)
    return receipt


def execute_sdk_unit(
    placement_source_raw: bytes,
    writable_source_raw: bytes,
    ca_export_source_raw: bytes,
    ca_export_capture_raw: bytes,
    node24_runner_raw: bytes,
    base_runner_raw: bytes,
    manifest_raw: bytes,
    placement_raw: bytes,
    writable_raw: bytes,
    extraction_raw: bytes,
    policy_raw: bytes,
    policy_sha256: str,
    egress_raw: bytes,
    egress_sha256: str,
    ca_receipt_raw: bytes,
    custody,
    build_parent_fd: int,
    attempt_fd: int,
    build_fd: int,
    writable_fd: int,
    placement_fd: int,
    distribution_fd: int,
    extraction_fd: int,
    node_fd: int,
    npm_fd: int,
    ca_fd: int,
    ca_receipt_fd: int,
    ca_journal_fd: int,
    guard_fd: int,
    state_fd: int,
    journal_fd: int,
    sdk_destination_fds: dict[str, int],
) -> bytes:
    """Run the four fixed phases and emit one held aggregate receipt.

    The fixed internal runner is not caller-selectable.  Local tests exercise
    the runner boundary directly with a synthetic Popen; that cannot mint the
    aggregate execution evidence returned by this function.
    """
    deadline = time.monotonic() + TREE_SECONDS
    bound = False; execution_fd = None; attempt_initial = None
    try:
        scalar_fds = [build_parent_fd, attempt_fd, build_fd, writable_fd, placement_fd,
                      distribution_fd, extraction_fd, node_fd, npm_fd, ca_fd, guard_fd,
                      ca_receipt_fd, ca_journal_fd, state_fd, journal_fd]
        need(all(type(fd) is int and fd >= 0 for fd in scalar_fds)
             and len(set(scalar_fds + list(sdk_destination_fds.values()))) ==
             len(scalar_fds) + len(sdk_destination_fds))
        placement = _load(placement_source_raw, PLACEMENT_SOURCE_SHA256, "placement_source")
        writable = _load(writable_source_raw, WRITABLE_SOURCE_SHA256, "writable_source")
        _load(ca_export_source_raw, CA_EXPORT_SOURCE_SHA256, "ca_export_source")
        need(type(ca_export_capture_raw) is bytes and 0 < len(ca_export_capture_raw) <= 262_144
             and hashlib.sha256(ca_export_capture_raw).hexdigest() == CA_EXPORT_CAPTURE_SHA256)
        runner = _load(node24_runner_raw, NODE24_RUNNER_SHA256, "node24_runner")
        _load(base_runner_raw, BASE_RUNNER_SHA256, "base_runner")
        need(runner.BASE_ADAPTER_SHA256 == BASE_RUNNER_SHA256
             and runner.ORIGIN_GUARD_SHA256 == ORIGIN_GUARD_SHA256)
        parent_initial = _directory(build_parent_fd)
        attempt_initial = _directory(attempt_fd)
        build_initial = _directory(build_fd)
        _directory(state_fd); _directory(journal_fd); _empty(state_fd); _empty(journal_fd)
        need(identity(os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd,
                              follow_symlinks=False)) == identity(attempt_initial)
             and identity(os.stat(BUILD_ROOT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(build_initial))
        _bound_leaf(attempt_fd, WRITABLE_RECEIPT_LEAF, writable_fd, writable_raw)
        placement_at = _bound_leaf(attempt_fd, PLACEMENT_RECEIPT_LEAF,
                                   placement_fd, placement_raw)
        placement_value = decode(placement_raw)
        exact(placement_value, PLACEMENT_KEYS)
        need(placement_value["schema"] == placement.PLACEMENT_SCHEMA
             and placement_value["source_head"] == "438e7913d0428290846fdd270efc61a134872428"
             and placement_value["source_tree"] == "4842a9c7d9b2ee799665c8904da27c8fab290ce2"
             and placement_value["app_manifest_sha256"] == APP_MANIFEST_SHA256
             and placement_value["writable_build_receipt_sha256"] ==
                 hashlib.sha256(writable_raw).hexdigest()
             and placement_value["node24_extraction_receipt_sha256"] ==
                 hashlib.sha256(extraction_raw).hexdigest()
             and placement_value["writable_post_root_identity"] == list(identity(build_initial))
             and placement_value["execution_cwd_identity"] == list(identity(build_initial))
             and placement_value["execution_purpose"] == "sdk-unit"
             and placement_value["execution_relative_path"] == SDK_TEST
             and placement_value["placement_complete"] is True
             and placement_value["node_version"] == NODE_VERSION
             and placement_value["npm_version"] == NPM_VERSION
             and placement_value["node_executed"] is False
             and placement_value["npm_ci_admitted"] is False
             and placement_value["sdk_unit_admitted"] is False
             and placement_value["app_build_admitted"] is False
             and placement_value["runtime_admission"] is False)
        rows = {}
        need(type(placement_value["files"]) is list and len(placement_value["files"]) == 3)
        for row in placement_value["files"]:
            exact(row, ("path", "sha256", "bytes", "source_identity", "destination_identity"))
            need(row["path"] not in rows); rows[row["path"]] = row
        need({path: (row["sha256"], row["bytes"]) for path, row in rows.items()} == SDK_FILES)
        sdk_identities = _verify_sdk_files(build_fd, sdk_destination_fds)
        need(all(sdk_identities[path] == rows[path]["destination_identity"] for path in SDK_FILES))
        manifest_rows, manifest_directories = writable._manifest(manifest_raw)
        combined_rows = dict(manifest_rows)
        combined_directories = set(manifest_directories)
        combined_directories.update(("scripts", "scripts/project-economy"))
        for path, (digest, size) in SDK_FILES.items():
            raw, _ = _read_fd(sdk_destination_fds[path], size, digest)
            combined_rows[path] = {"path": path, "mode": "100644", "bytes": size,
                                   "git_blob_sha1": hashlib.sha1(
                                       b"blob " + str(size).encode("ascii") + b"\0" + raw
                                   ).hexdigest()}
        exact_nodes, exact_digest = writable._scan(
            build_fd, combined_rows, combined_directories, 0o700, 0o600,
            writable.Deadline(TREE_SECONDS))
        need(exact_nodes["."] == identity(build_initial)
             and exact_digest == placement_value["writable_post_tree_identity_sha256"])
        extraction_at = os.fstat(extraction_fd)
        need(stat.S_ISREG(extraction_at.st_mode) and extraction_at.st_nlink == 1
             and os.pread(extraction_fd, len(extraction_raw) + 1, 0) == extraction_raw)
        extraction, node_saved, npm_saved = placement._extraction_receipt(
            extraction_raw, distribution_fd, os.fstat(distribution_fd), node_fd, npm_fd)
        need(extraction["preparation_sha256"] == PREPARATION_SHA256
             and extraction["policy_sha256"] == PREPARATION_POLICY_SHA256
             and extraction["archive_sha256"] == ARCHIVE_SHA256
             and extraction["node_version"] == NODE_VERSION
             and extraction["npm_version"] == NPM_VERSION
             and extraction["node"]["relative_path"] == NODE_RELATIVE
             and extraction["npm_cli"]["relative_path"] == NPM_RELATIVE
             and extraction["npm_link"] == {"relative_path": NPM_LINK_RELATIVE,
                                             "target": NPM_LINK_TARGET,
                                             "identity": extraction["npm_link"]["identity"]})
        policy = runner.parse_policy(policy_raw, policy_sha256)
        need(policy["node"]["sha256"] == extraction["node"]["sha256"]
             and policy["npm_cli"]["sha256"] == extraction["npm_cli"]["sha256"])
        ca_raw, ca_saved = _read_fd(ca_fd, 16_777_216, policy["npm_trust"]["ca_sha256"])
        ca_receipt_bytes, ca_receipt_saved = _read_fd(
            ca_receipt_fd, RECEIPT_CAP, hashlib.sha256(ca_receipt_raw).hexdigest())
        need(ca_receipt_bytes == ca_receipt_raw)
        ca_receipt = decode(ca_receipt_raw); exact(ca_receipt, CA_KEYS)
        need(ca_receipt["schema"] == "compatible-full-app-node24-ca-export-receipt.v1"
             and ca_receipt["archive_sha256"] == ARCHIVE_SHA256
             and ca_receipt["node_version"] == NODE_VERSION
             and ca_receipt["node_sha256"] == extraction["node"]["sha256"]
             and ca_receipt["script_sha256"] == CA_EXPORT_SCRIPT_SHA256
             and ca_receipt["ca_sha256"] == policy["npm_trust"]["ca_sha256"]
             and ca_receipt["ca_sha256"] == hashlib.sha256(ca_raw).hexdigest()
             and ca_receipt["ca_bytes"] == len(ca_raw)
             and type(ca_receipt["certificates"]) is int
             and ca_receipt["certificates"] > 0
             and ca_receipt["cleanup_complete"] is True)
        _validate_ca_journal(ca_journal_fd, ca_receipt_fd, ca_receipt_raw)
        _, guard_saved = _read_fd(guard_fd, 65_536, ORIGIN_GUARD_SHA256)
        need(hashlib.sha256(egress_raw).hexdigest() == lowercase_hash(egress_sha256)
             and policy["npm_trust"]["evidence_sha256"] == egress_sha256)
        egress = decode(egress_raw); exact(egress, EGRESS_KEYS)
        need(egress["schema"] == "compatible-full-app-kernel-egress-receipt.v1"
             and egress["archive_sha256"] == ARCHIVE_SHA256
             and egress["registry_origin"] == "https://registry.npmjs.org/"
             and egress["tcp_destination"] == "registry.npmjs.org:443"
             and egress["raw_socket_denied"] is True)
        lowercase_hash(egress["dns_policy_sha256"]); lowercase_hash(egress["producer_sha256"])
        # The v1 egress JSON is replayable preparatory metadata.  It lacks a
        # live attempt/root/netns/cgroup/child-lineage binding and therefore
        # must never open the process route.  A later reviewed active enforcer
        # replaces this fixed denial; no Popen is reachable in this source.
        _active_egress_gate()
        for leaf in ("home", "npm-cache"):
            os.mkdir(leaf, 0o700, dir_fd=state_fd)
            child = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=state_fd)
            try: _directory(child)
            finally: os.close(child)
        os.fsync(state_fd)
        before = _tree_manifest(build_fd, deadline)
        need(before["root_identity"] == list(identity(build_initial)))
        bound = True
        phase_receipts = []
        for serial, purpose in enumerate(PHASES, 1):
            receipt = _run_phase(custody, purpose, serial, build_fd, state_fd, journal_fd,
                                 distribution_fd, node_fd, npm_fd, ca_fd, guard_fd,
                                 policy)
            need(receipt["purpose"] == purpose and receipt["serial"] == serial
                 and receipt["cleanup_complete"] is True
                 and receipt["survivor_absence"] is True)
            phase_receipts.append(receipt)
            if purpose == "npm-ci":
                installed = _tree_manifest(build_fd, time.monotonic() + TREE_SECONDS)
                need(anchor(os.fstat(build_fd)) == anchor(build_initial))
                source_post_npm = _verify_original_files(writable, build_fd, manifest_rows)
                _verify_sdk_files(build_fd, sdk_destination_fds)
        after = _tree_manifest(build_fd, time.monotonic() + TREE_SECONDS)
        source_post_sdk = _verify_original_files(writable, build_fd, manifest_rows)
        durable_phases = _rebind_journal(journal_fd, phase_receipts)
        final_root = os.fstat(build_fd)
        need(anchor(final_root) == anchor(build_initial)
             and _verify_sdk_files(build_fd, sdk_destination_fds) == sdk_identities
             and identity(os.stat(BUILD_ROOT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(final_root)
             and not custody.UNCERTAIN_CHILDREN and not _PENDING
             and all(row.get("complete") is True for row in custody.REAPING_CHILDREN.values()))
        execution = {
            "schema": "compatible-full-app-sdk-node24-execution-evidence.v1",
            "source_head": SOURCE_HEAD, "source_tree": SOURCE_TREE,
            "placement_receipt_sha256": hashlib.sha256(placement_raw).hexdigest(),
            "writable_build_receipt_sha256": hashlib.sha256(writable_raw).hexdigest(),
            "node24_extraction_receipt_sha256": hashlib.sha256(extraction_raw).hexdigest(),
            "toolchain_policy_sha256": policy_sha256,
            "kernel_egress_receipt_sha256": egress_sha256,
            "writable_pre_execution_root_identity": before["root_identity"],
            "writable_pre_execution_tree_sha256": before["tree_sha256"],
            "writable_post_npm_root_identity": installed["root_identity"],
            "writable_post_npm_tree_sha256": installed["tree_sha256"],
            "original_source_post_npm_sha256": source_post_npm,
            "writable_post_sdk_root_identity": after["root_identity"],
            "writable_post_sdk_tree_sha256": after["tree_sha256"],
            "original_source_post_sdk_sha256": source_post_sdk,
            "post_npm_entries": installed["entries"],
            "post_npm_directories": installed["directories"],
            "post_npm_files": installed["files"],
            "post_npm_symlinks": installed["symlinks"],
            "post_npm_bytes": installed["bytes"],
            "node_version": NODE_VERSION, "npm_version": NPM_VERSION,
            "node_sha256": policy["node"]["sha256"],
            "npm_cli_sha256": policy["npm_cli"]["sha256"],
            "sdk_files": [{"path": path, "sha256": SDK_FILES[path][0],
                            "bytes": SDK_FILES[path][1],
                            "identity": sdk_identities[path]} for path in sorted(SDK_FILES)],
            "phase_receipts": durable_phases,
            "node_executed": True, "npm_ci_admitted": True,
            "sdk_unit_admitted": True, "sdk_fixed_pass": True,
            "sdk_stderr_empty": True, "cleanup_complete": True,
            "survivor_absence": True, "app_build_admitted": False,
            "post_build_dist_verification": False, "product_runtime_admission": False,
            "release_admission": False,
        }
        raw = canonical(execution)
        execution_fd, execution_saved = _write_once(attempt_fd, EXECUTION_RECEIPT_LEAF, raw)
        os.fsync(attempt_fd); os.fsync(build_parent_fd)
        need(identity(os.fstat(execution_fd)) == identity(execution_saved)
             and os.pread(execution_fd, len(raw) + 1, 0) == raw
             and identity(os.stat(EXECUTION_RECEIPT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(execution_saved)
             and identity(os.fstat(placement_fd)) == identity(placement_at)
             and os.pread(placement_fd, len(placement_raw) + 1, 0) == placement_raw
             and identity(os.fstat(extraction_fd)) == identity(extraction_at)
             and os.pread(extraction_fd, len(extraction_raw) + 1, 0) == extraction_raw
             and identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(npm_fd)) == identity(npm_saved)
             and identity(os.fstat(ca_fd)) == identity(ca_saved)
             and identity(os.fstat(ca_receipt_fd)) == identity(ca_receipt_saved)
             and os.pread(ca_receipt_fd, len(ca_receipt_raw) + 1, 0) == ca_receipt_raw
             and identity(os.fstat(guard_fd)) == identity(guard_saved)
             and identity(os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd,
                                  follow_symlinks=False)) == identity(os.fstat(attempt_fd))
             and anchor(os.fstat(build_parent_fd)) == anchor(parent_initial))
        return raw
    except BaseException as failure:
        if bound and not _PENDING and not custody.UNCERTAIN_CHILDREN:
            try:
                placement._quarantine(build_parent_fd, attempt_fd, attempt_initial)
            except BaseException as quarantine:
                raise ExecutionFailure(
                    "compatible_full_app_sdk_node24_execution_quarantine_incomplete"
                ) from quarantine
        if isinstance(failure, ExecutionFailure):
            raise
        raise ExecutionFailure("compatible_full_app_sdk_node24_execution_denied") from failure
    finally:
        if execution_fd is not None:
            os.close(execution_fd)


def main() -> int:
    print("compatible-full-app-sdk-node24-execution HOLD native_inputs_and_runtime_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
