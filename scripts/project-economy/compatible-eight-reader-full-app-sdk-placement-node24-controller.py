"""Held-FD SDK placement and exact Node24 execution preflight.

This source never launches a process.  It mutates only the separately derived
writable build root, emits a post-placement receipt, and keeps npm/build/dist
and product runtime admission false.
"""
from __future__ import annotations

import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import PurePosixPath
import stat
import time


SOURCE_HEAD = "438e7913d0428290846fdd270efc61a134872428"
SOURCE_TREE = "4842a9c7d9b2ee799665c8904da27c8fab290ce2"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
APP_SOURCE_COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
APP_SOURCE_TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
MANIFEST_PROJECTION_SHA256 = "9fac867355f20d6586ffca32227ee8b861f64879cc2619c1427c1b3d97ea8cf8"
SDK_CUSTODY_SOURCE_HEAD = "8e83f41965fd6153b665a12d95791e592c00b16a"
SDK_CUSTODY_SOURCE_TREE = "15dfbe62f89ecedf3638e22af7e6a3f54c0dba4d"
WRITABLE_SOURCE_SHA256 = "dd063d2fd138dea08bae107a73bb81704fc9f129b3ea7f63e210bb9df0062c8d"
NODE24_RUNNER_SHA256 = "7a3028e0650e1ba5f3751a893fe15cb8213e05ba90381b241eed3beb087245c8"
BASE_RUNNER_SHA256 = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"
SDK_PACKAGE_SHA256 = "540f52028b7f0adad9cb62853f1f396668cd6fee260995b75a09b4750f2d3e09"
SDK_ROOT_RECEIPT_SCHEMA = "compatible-full-app-sdk-root-evidence.v1"
WRITABLE_RECEIPT_SCHEMA = "compatible-full-app-writable-build-root-evidence.v1"
EXTRACTION_RECEIPT_SCHEMA = "compatible-full-app-node24-extraction-evidence.v1"
PLACEMENT_SCHEMA = "compatible-full-app-sdk-placement-node24-evidence.v1"
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
PREPARATION_SHA256 = "e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42"
POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
ARCHIVE_ROOT = "node-v24.21.0-linux-x64"
NODE_RELATIVE = "bin/node"
NPM_RELATIVE = "lib/node_modules/npm/bin/npm-cli.js"
NPM_LINK_RELATIVE = "bin/npm"
NPM_LINK_TARGET = "../lib/node_modules/npm/bin/npm-cli.js"

ATTEMPT_LEAF = "compatible-full-app-build-derivation-attempt"
QUARANTINE_LEAF = ATTEMPT_LEAF + ".sdk-placement-discarded"
BUILD_ROOT_LEAF = "writable-build-root"
WRITABLE_RECEIPT_LEAF = "writable-build-root-evidence.json"
SDK_ROOT_LEAF = "compatible-full-app-sdk-root"
SDK_ROOT_RECEIPT_LEAF = "compatible-full-app-sdk-root-evidence.json"
PLACEMENT_RECEIPT_LEAF = "sdk-placement-node24-evidence.json"
SDK_DIRECTORY = "scripts/project-economy"
SDK_TEST = SDK_DIRECTORY + "/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs"
MAX_SECONDS = 300
MAX_RECEIPT = 65_536
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")

SDK_FILES = {
    "scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts":
        ("b6bde1facf9ed7c886f715069924e2c049808d2da9e16b72a35debb46013e764", 7394),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs":
        ("67725d5ecb583a44969a660b7a803de58d268ba14623489d8111f7aeafb1772a", 8991),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-source.mjs":
        ("51b68fc0b98ce5d54943d627fc2ee5bc3668f7cb471625ebe7ed97b2ea2b7292", 6822),
}

WRITABLE_KEYS = {
    "schema", "source_commit", "source_tree", "app_manifest_sha256",
    "manifest_projection_sha256", "immutable_source_receipt_sha256",
    "immutable_source_root_identity", "immutable_source_identity_sha256",
    "writable_build_root_identity", "writable_build_identity_sha256",
    "source_files", "source_bytes", "source_directories_excluding_root",
    "source_root_purpose", "build_root_purpose", "same_root", "file_mode",
    "directory_mode", "complete_source_join", "sdk_routing", "npm_ci_admitted",
    "app_build_admitted", "post_build_dist_verification", "runtime_admission",
}
SDK_ROOT_KEYS = {
    "schema", "source_commit", "source_tree", "exact_app_manifest_sha256",
    "node_version", "sdk_root_leaf", "sdk_root_identity", "sdk_package_sha256",
    "files", "placement_to_writable_build_root", "sdk_unit_admitted",
    "npm_install_admitted", "app_build_admitted", "runtime_admission",
}
EXTRACTION_KEYS = {
    "schema", "preparation_sha256", "policy_sha256", "archive_sha256",
    "archive_identity", "archive_root", "distribution_root_identity",
    "node_version", "npm_version", "members", "expanded_bytes", "node",
    "npm_cli", "npm_link", "node_executed", "runtime_admission",
}


class PlacementFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise PlacementFailure("compatible_full_app_sdk_placement_node24_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def sdk_identity(value: os.stat_result) -> tuple[int, ...]:
    """Identity order emitted by compatible-full-app-sdk-root-evidence.v1."""
    return (value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid,
            value.st_size, value.st_nlink, value.st_mtime_ns, value.st_ctime_ns)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def object_anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid)


def quarantine_transition(before: os.stat_result, after: os.stat_result) -> bool:
    a = dict(zip(FIELDS, identity(before)))
    b = dict(zip(FIELDS, identity(after)))
    return (all(a[field] == b[field] for field in FIELDS if field != "st_ctime_ns")
            and b["st_ctime_ns"] >= a["st_ctime_ns"])


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def canonical(value, newline: bool = False) -> bytes:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return raw + (b"\n" if newline else b"")


def decode(raw: bytes, *, newline: bool = False):
    need(type(raw) is bytes and 0 < len(raw) <= MAX_RECEIPT)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(PlacementFailure()))
    except (UnicodeError, ValueError):
        raise PlacementFailure("compatible_full_app_sdk_placement_node24_denied") from None
    need(canonical(value, newline) == raw)
    return value


def lower_hash(value) -> str:
    need(type(value) is str and len(value) == 64
         and all(character in "0123456789abcdef" for character in value))
    return value


class Deadline:
    def __init__(self, seconds: float = MAX_SECONDS):
        need(type(seconds) in (int, float) and 0 < seconds <= MAX_SECONDS)
        self.end = time.monotonic() + seconds

    def check(self):
        need(time.monotonic() < self.end)


def _directory(fd: int, mode: int) -> os.stat_result:
    need(type(fd) is int and fd >= 0)
    saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and stat.S_IMODE(saved.st_mode) == mode)
    return saved


def _open_dir(parent_fd: int, name: str, mode: int) -> tuple[int, os.stat_result]:
    need(type(name) is str and name not in ("", ".", "..") and "/" not in name)
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_gid == os.getegid() and stat.S_IMODE(before.st_mode) == mode)
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                 dir_fd=parent_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
        return fd, before
    except BaseException:
        os.close(fd)
        raise


def _names(fd: int, expected: set[str], deadline: Deadline) -> None:
    observed = set()
    with os.scandir(fd) as entries:
        for entry in entries:
            deadline.check()
            need(len(observed) < len(expected) and entry.name not in observed
                 and entry.name in expected and entry.name not in ("", ".", ".."))
            observed.add(entry.name)
    need(observed == expected)


def _read_fd(fd: int, size: int, deadline: Deadline) -> bytes:
    need(type(size) is int and 0 <= size <= MAX_RECEIPT)
    raw = bytearray()
    while len(raw) <= size:
        deadline.check()
        part = os.pread(fd, min(65_536, size + 1 - len(raw)), len(raw))
        if not part:
            break
        raw.extend(part)
    need(len(raw) == size)
    return bytes(raw)


def _hash_fd(fd: int, expected_size: int, expected_sha: str,
             deadline: Deadline, *, mode: int | None = None) -> os.stat_result:
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and saved.st_nlink == 1
         and saved.st_size == expected_size and 0 < expected_size <= 268_435_456
         and (mode is None or stat.S_IMODE(saved.st_mode) == mode))
    digest = hashlib.sha256(); offset = 0
    while offset < expected_size:
        deadline.check()
        part = os.pread(fd, min(65_536, expected_size - offset), offset)
        need(bool(part)); offset += len(part); digest.update(part)
    need(os.pread(fd, 1, offset) == b"" and digest.hexdigest() == lower_hash(expected_sha)
         and identity(os.fstat(fd)) == identity(saved))
    return saved


def _bound_receipt(fd: int, raw: bytes, parent_fd: int, leaf: str,
                   deadline: Deadline) -> os.stat_result:
    at = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISREG(at.st_mode) and at.st_uid == os.geteuid() and at.st_gid == os.getegid()
         and at.st_nlink == 1 and stat.S_IMODE(at.st_mode) == 0o600
         and at.st_size == len(raw) and identity(os.fstat(fd)) == identity(at)
         and _read_fd(fd, len(raw), deadline) == raw)
    return at


def _load_source(raw: bytes, expected_sha: str, name: str):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536
         and hashlib.sha256(raw).hexdigest() == expected_sha and name.isidentifier())
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader=None))
    exec(compile(raw, "<captured-" + name + ">", "exec"), module.__dict__)
    return module


def _writable_receipt(raw: bytes, build_saved: os.stat_result):
    value = decode(raw)
    need(type(value) is dict and set(value) == WRITABLE_KEYS
         and value["schema"] == WRITABLE_RECEIPT_SCHEMA
         and value["source_commit"] == APP_SOURCE_COMMIT
         and value["source_tree"] == APP_SOURCE_TREE
         and value["app_manifest_sha256"] == APP_MANIFEST_SHA256
         and value["manifest_projection_sha256"] == MANIFEST_PROJECTION_SHA256
         and value["writable_build_root_identity"] == list(identity(build_saved))
         and value["source_files"] == 2445 and value["source_bytes"] == 20_984_073
         and value["source_directories_excluding_root"] == 220
         and value["source_root_purpose"] == "immutable_source_snapshot_only"
         and value["build_root_purpose"] == "derived_writable_build_root"
         and value["same_root"] is False and value["file_mode"] == "0600"
         and value["directory_mode"] == "0700" and value["complete_source_join"] is True
         and value["sdk_routing"] is False and value["npm_ci_admitted"] is False
         and value["app_build_admitted"] is False
         and value["post_build_dist_verification"] is False
         and value["runtime_admission"] is False)
    for key in ("manifest_projection_sha256", "immutable_source_receipt_sha256",
                "immutable_source_identity_sha256", "writable_build_identity_sha256"):
        lower_hash(value[key])
    return value


def _sdk_receipt(raw: bytes, sdk_saved: os.stat_result):
    value = decode(raw, newline=True)
    need(type(value) is dict and set(value) == SDK_ROOT_KEYS
         and value["schema"] == SDK_ROOT_RECEIPT_SCHEMA
         and value["source_commit"] == SDK_CUSTODY_SOURCE_HEAD
         and value["source_tree"] == SDK_CUSTODY_SOURCE_TREE
         and value["exact_app_manifest_sha256"] == APP_MANIFEST_SHA256
         and value["node_version"] == NODE_VERSION and value["sdk_root_leaf"] == SDK_ROOT_LEAF
         and value["sdk_root_identity"] == list(sdk_identity(sdk_saved))
         and value["sdk_package_sha256"] == SDK_PACKAGE_SHA256
         and value["placement_to_writable_build_root"] is False
         and value["sdk_unit_admitted"] is False and value["npm_install_admitted"] is False
         and value["app_build_admitted"] is False and value["runtime_admission"] is False
         and type(value["files"]) is list and len(value["files"]) == len(SDK_FILES))
    rows = {}
    for row in value["files"]:
        need(type(row) is dict and set(row) == {"path", "sha256", "bytes", "identity"}
             and row["path"] not in rows and type(row["identity"]) is list
             and len(row["identity"]) == len(FIELDS)
             and all(type(item) is int and item >= 0 for item in row["identity"]))
        rows[row["path"]] = row
    need({path: (row["sha256"], row["bytes"]) for path, row in rows.items()} == SDK_FILES)
    return value, rows


def _extraction_receipt(raw: bytes, distribution_fd: int, distribution_saved: os.stat_result,
                        node_fd: int, npm_fd: int, deadline: Deadline):
    value = decode(raw)
    need(type(value) is dict and set(value) == EXTRACTION_KEYS
         and value["schema"] == EXTRACTION_RECEIPT_SCHEMA
         and value["preparation_sha256"] == PREPARATION_SHA256
         and value["policy_sha256"] == POLICY_SHA256
         and value["archive_sha256"] == ARCHIVE_SHA256
         and value["archive_root"] == ARCHIVE_ROOT
         and value["distribution_root_identity"] == list(identity(distribution_saved))
         and value["node_version"] == NODE_VERSION and value["npm_version"] == NPM_VERSION
         and type(value["archive_identity"]) is list
         and len(value["archive_identity"]) == len(FIELDS)
         and type(value["members"]) is int and 0 < value["members"] <= 65_536
         and type(value["expanded_bytes"]) is int and 0 < value["expanded_bytes"] <= 402_653_184
         and value["node_executed"] is False and value["runtime_admission"] is False)
    node = value["node"]; npm = value["npm_cli"]; link = value["npm_link"]
    need(type(node) is dict and set(node) == {"relative_path", "sha256", "bytes", "identity"}
         and type(npm) is dict and set(npm) == {"relative_path", "sha256", "bytes", "identity"}
         and type(link) is dict and set(link) == {"relative_path", "target", "identity"}
         and type(node["bytes"]) is int and type(npm["bytes"]) is int
         and type(node["identity"]) is list and type(npm["identity"]) is list
         and len(node["identity"]) == len(FIELDS) and len(npm["identity"]) == len(FIELDS)
         and all(type(item) is int and item >= 0
                 for item in node["identity"] + npm["identity"])
         and node["relative_path"] == NODE_RELATIVE and npm["relative_path"] == NPM_RELATIVE
         and link["relative_path"] == NPM_LINK_RELATIVE and link["target"] == NPM_LINK_TARGET)
    node_saved = _hash_fd(node_fd, node["bytes"], node["sha256"], deadline)
    npm_saved = _hash_fd(npm_fd, npm["bytes"], npm["sha256"], deadline)
    opened_node, node_at = _open_distribution_leaf(distribution_fd, node_fd,
                                                    NODE_RELATIVE, True)
    opened_npm, npm_at = _open_distribution_leaf(distribution_fd, npm_fd,
                                                  NPM_RELATIVE, False)
    try:
        need(identity(node_at) == identity(node_saved)
             and identity(npm_at) == identity(npm_saved))
    finally:
        os.close(opened_npm); os.close(opened_node)
    _verify_distribution_link(distribution_fd, NPM_LINK_RELATIVE, NPM_LINK_TARGET)
    need(node["identity"] == list(identity(node_saved))
         and npm["identity"] == list(identity(npm_saved)))
    return value, node_saved, npm_saved


def _open_distribution_leaf(distribution_fd: int, supplied_fd: int,
                            relative: str, executable: bool) -> tuple[int, os.stat_result]:
    parts = PurePosixPath(relative).parts
    need(parts and all(part not in ("", ".", "..") for part in parts))
    opened = [os.dup(distribution_fd)]
    try:
        for part in parts[:-1]:
            child, _ = _open_dir(opened[-1], part, 0o700)
            opened.append(child)
        at = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISREG(at.st_mode) and at.st_uid == os.geteuid()
             and at.st_gid == os.getegid() and at.st_nlink == 1
             and not at.st_mode & 0o022 and bool(at.st_mode & 0o111) is executable
             and identity(os.fstat(supplied_fd)) == identity(at))
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                     dir_fd=opened[-1])
        need(identity(os.fstat(fd)) == identity(at))
        return fd, at
    finally:
        for held in reversed(opened):
            os.close(held)


def _verify_distribution_link(distribution_fd: int,
                              relative: str, target: str) -> None:
    parts = PurePosixPath(relative).parts
    opened = [os.dup(distribution_fd)]
    try:
        for part in parts[:-1]:
            child, _ = _open_dir(opened[-1], part, 0o700)
            opened.append(child)
        at = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISLNK(at.st_mode) and at.st_uid == os.geteuid()
             and at.st_gid == os.getegid()
             and os.readlink(parts[-1], dir_fd=opened[-1]) == target
             and identity(os.stat(parts[-1], dir_fd=opened[-1],
                                  follow_symlinks=False)) == identity(at))
    finally:
        for held in reversed(opened):
            os.close(held)


def _open_relative(root_fd: int, relative: str, mode: int) -> tuple[int, os.stat_result]:
    parts = PurePosixPath(relative).parts
    need(parts and all(part not in ("", ".", "..") for part in parts))
    opened = [os.dup(root_fd)]
    try:
        for part in parts[:-1]:
            child, _ = _open_dir(opened[-1], part, 0o500)
            opened.append(child)
        at = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISREG(at.st_mode) and stat.S_IMODE(at.st_mode) == mode
             and at.st_uid == os.geteuid() and at.st_gid == os.getegid() and at.st_nlink == 1)
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                     dir_fd=opened[-1])
        need(identity(os.fstat(fd)) == identity(at))
        return fd, at
    finally:
        for held in reversed(opened):
            os.close(held)


def _copy(source_fd: int, destination_parent_fd: int, name: str, size: int,
          expected_sha: str, deadline: Deadline) -> tuple[int, os.stat_result, str]:
    source_saved = _hash_fd(source_fd, size, expected_sha, deadline, mode=0o400)
    target_fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                        0o600, dir_fd=destination_parent_fd)
    try:
        offset = 0
        while offset < size:
            deadline.check(); part = os.pread(source_fd, min(65_536, size - offset), offset)
            need(bool(part)); written = os.write(target_fd, part); need(written == len(part)); offset += written
        os.fchmod(target_fd, 0o600); os.fsync(target_fd)
        target_saved = _hash_fd(target_fd, size, expected_sha, deadline, mode=0o600)
        at = os.stat(name, dir_fd=destination_parent_fd, follow_symlinks=False)
        need(identity(at) == identity(target_saved) and identity(os.fstat(source_fd)) == identity(source_saved))
        blob = hashlib.sha1(b"blob " + str(size).encode("ascii") + b"\0" +
                            os.pread(target_fd, size, 0)).hexdigest()
        return target_fd, target_saved, blob
    except BaseException:
        os.close(target_fd)
        raise


def _write_once(parent_fd: int, leaf: str, raw: bytes) -> tuple[int, os.stat_result]:
    need(type(raw) is bytes and 0 < len(raw) <= MAX_RECEIPT)
    fd = os.open(leaf, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=parent_fd)
    accepted = False
    try:
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:]); need(written > 0); offset += written
        os.fchmod(fd, 0o600); os.fsync(fd); saved = os.fstat(fd)
        need(stat.S_ISREG(saved.st_mode) and stat.S_IMODE(saved.st_mode) == 0o600
             and saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
             and saved.st_nlink == 1 and saved.st_size == len(raw)
             and os.pread(fd, len(raw) + 1, 0) == raw
             and identity(os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)) == identity(saved))
        accepted = True; return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def _rename_noreplace(parent_fd: int, source: str, destination: str) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    call = libc.renameat2
    call.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p,
                     ctypes.c_uint]
    call.restype = ctypes.c_int
    result = call(parent_fd, source.encode("ascii"), parent_fd,
                  destination.encode("ascii"), 1)
    if result != 0:
        error = ctypes.get_errno(); raise OSError(error, os.strerror(error))


def _quarantine(build_parent_fd: int, attempt_fd: int, original: os.stat_result) -> None:
    parent_saved = _directory(build_parent_fd, 0o700)
    pre = os.fstat(attempt_fd)
    at = os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd, follow_symlinks=False)
    need(anchor(pre) == anchor(original) == anchor(at) and identity(pre) == identity(at))
    try:
        os.stat(QUARANTINE_LEAF, dir_fd=build_parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        need(False)
    _rename_noreplace(build_parent_fd, ATTEMPT_LEAF, QUARANTINE_LEAF)
    reopened, path_saved = _open_dir(build_parent_fd, QUARANTINE_LEAF, 0o700)
    try:
        post = os.fstat(attempt_fd)
        need(quarantine_transition(pre, post) and identity(os.fstat(reopened)) == identity(post)
             and identity(path_saved) == identity(post))
        try:
            os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)
        os.fsync(build_parent_fd)
        need(identity(os.fstat(attempt_fd)) == identity(post)
             and identity(os.stat(QUARANTINE_LEAF, dir_fd=build_parent_fd,
                                  follow_symlinks=False)) == identity(post))
    finally:
        os.close(reopened)
    need(object_anchor(os.fstat(build_parent_fd)) == object_anchor(parent_saved))


def place_and_plan_sdk(
    manifest_raw: bytes,
    writable_source_raw: bytes,
    writable_receipt_raw: bytes,
    sdk_receipt_raw: bytes,
    extraction_receipt_raw: bytes,
    node24_runner_raw: bytes,
    base_runner_raw: bytes,
    build_parent_fd: int,
    attempt_fd: int,
    build_root_fd: int,
    writable_receipt_fd: int,
    sdk_parent_fd: int,
    sdk_root_fd: int,
    sdk_receipt_fd: int,
    sdk_file_fds: dict[str, int],
    extraction_receipt_fd: int,
    distribution_fd: int,
    node_fd: int,
    npm_fd: int,
) -> bytes:
    """Place the exact SDK package and emit a non-executing Node24 plan."""
    bound = False; attempt_initial = None; placement_fd = None
    source_held = {}; destination_held = {}
    try:
        deadline = Deadline()
        all_fds = [build_parent_fd, attempt_fd, build_root_fd, writable_receipt_fd,
                   sdk_parent_fd, sdk_root_fd, sdk_receipt_fd, extraction_receipt_fd,
                   distribution_fd, node_fd, npm_fd, *sdk_file_fds.values()]
        need(len(all_fds) == len(set(all_fds)) and set(sdk_file_fds) == set(SDK_FILES))
        build_parent_initial = _directory(build_parent_fd, 0o700)
        attempt_initial = _directory(attempt_fd, 0o700)
        build_initial = _directory(build_root_fd, 0o700)
        _directory(sdk_parent_fd, 0o700); sdk_initial = _directory(sdk_root_fd, 0o500)
        distribution_initial = _directory(distribution_fd, 0o700)
        attempt_reopened, attempt_at = _open_dir(build_parent_fd, ATTEMPT_LEAF, 0o700)
        build_reopened, build_at = _open_dir(attempt_fd, BUILD_ROOT_LEAF, 0o700)
        sdk_reopened, sdk_at = _open_dir(sdk_parent_fd, SDK_ROOT_LEAF, 0o500)
        try:
            need(identity(os.fstat(attempt_reopened)) == identity(attempt_initial) == identity(attempt_at)
                 and identity(os.fstat(build_reopened)) == identity(build_initial) == identity(build_at)
                 and identity(os.fstat(sdk_reopened)) == identity(sdk_initial) == identity(sdk_at))
        finally:
            os.close(sdk_reopened); os.close(build_reopened); os.close(attempt_reopened)
        bound = True
        _names(attempt_fd, {BUILD_ROOT_LEAF, WRITABLE_RECEIPT_LEAF}, deadline)
        writable_at = _bound_receipt(writable_receipt_fd, writable_receipt_raw,
                                     attempt_fd, WRITABLE_RECEIPT_LEAF, deadline)
        sdk_receipt_at = _bound_receipt(sdk_receipt_fd, sdk_receipt_raw,
                                        sdk_parent_fd, SDK_ROOT_RECEIPT_LEAF, deadline)
        _names(sdk_parent_fd, {SDK_ROOT_LEAF, SDK_ROOT_RECEIPT_LEAF}, deadline)
        writable_value = _writable_receipt(writable_receipt_raw, build_initial)
        sdk_value, sdk_rows = _sdk_receipt(sdk_receipt_raw, sdk_initial)

        writable = _load_source(writable_source_raw, WRITABLE_SOURCE_SHA256,
                                "captured_writable_build_root")
        need(writable.APP_MANIFEST_SHA256 == APP_MANIFEST_SHA256
             and callable(writable._manifest) and callable(writable._scan))
        rows, directories = writable._manifest(manifest_raw)
        pre_nodes, pre_digest = writable._scan(build_root_fd, rows, directories,
                                                0o700, 0o600, deadline)
        need(pre_nodes["."] == identity(build_initial)
             and pre_digest == writable_value["writable_build_identity_sha256"])
        try:
            os.stat("scripts", dir_fd=build_root_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)

        extraction_at = os.fstat(extraction_receipt_fd)
        need(stat.S_ISREG(extraction_at.st_mode) and extraction_at.st_uid == os.geteuid()
             and extraction_at.st_gid == os.getegid() and extraction_at.st_nlink == 1
             and extraction_at.st_size == len(extraction_receipt_raw)
             and _read_fd(extraction_receipt_fd, len(extraction_receipt_raw), deadline) == extraction_receipt_raw)
        extraction, node_saved, npm_saved = _extraction_receipt(
            extraction_receipt_raw, distribution_fd, distribution_initial,
            node_fd, npm_fd, deadline)
        need(hashlib.sha256(node24_runner_raw).hexdigest() == NODE24_RUNNER_SHA256
             and hashlib.sha256(base_runner_raw).hexdigest() == BASE_RUNNER_SHA256)

        sdk_scripts, scripts_saved = _open_dir(sdk_root_fd, "scripts", 0o500)
        sdk_project, sdk_project_saved = _open_dir(sdk_scripts, "project-economy", 0o500)
        try:
            for path in sorted(SDK_FILES):
                leaf = path.rsplit("/", 1)[1]; row = sdk_rows[path]
                held, source_saved = _open_relative(sdk_root_fd, path, 0o400)
                source_held[path] = held
                need(identity(os.fstat(sdk_file_fds[path])) == identity(source_saved)
                     and row["identity"] == list(sdk_identity(source_saved)))
                _hash_fd(held, row["bytes"], row["sha256"], deadline, mode=0o400)
            os.mkdir("scripts", 0o700, dir_fd=build_root_fd)
            build_scripts, build_scripts_saved = _open_dir(build_root_fd, "scripts", 0o700)
            try:
                os.mkdir("project-economy", 0o700, dir_fd=build_scripts)
                build_project, build_project_saved = _open_dir(build_scripts, "project-economy", 0o700)
                try:
                    placed_rows = []
                    combined_rows = dict(rows); combined_directories = set(directories)
                    combined_directories.update({"scripts", "scripts/project-economy"})
                    for path in sorted(SDK_FILES):
                        leaf = path.rsplit("/", 1)[1]; sha, size = SDK_FILES[path]
                        target, target_saved, blob = _copy(source_held[path], build_project,
                                                           leaf, size, sha, deadline)
                        destination_held[path] = target
                        combined_rows[path] = {"path": path, "mode": "100644",
                                               "git_blob_sha1": blob, "bytes": size}
                        placed_rows.append({"path": path, "sha256": sha, "bytes": size,
                                            "source_identity": list(identity(os.fstat(source_held[path]))),
                                            "destination_identity": list(identity(target_saved))})
                    os.fsync(build_project); os.fsync(build_scripts); os.fsync(build_root_fd)
                finally:
                    os.close(build_project)
            finally:
                os.close(build_scripts)
        finally:
            os.close(sdk_project); os.close(sdk_scripts)

        post_nodes, post_digest = writable._scan(build_root_fd, combined_rows,
                                                  combined_directories, 0o700, 0o600, deadline)
        post_root = os.fstat(build_root_fd)
        need(post_nodes["."] == identity(post_root) and pre_nodes["."] != post_nodes["."]
             and identity(os.stat(BUILD_ROOT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(post_root))
        receipt = {
            "schema": PLACEMENT_SCHEMA,
            "source_head": SOURCE_HEAD,
            "source_tree": SOURCE_TREE,
            "app_manifest_sha256": APP_MANIFEST_SHA256,
            "writable_build_receipt_sha256": hashlib.sha256(writable_receipt_raw).hexdigest(),
            "sdk_root_receipt_sha256": hashlib.sha256(sdk_receipt_raw).hexdigest(),
            "node24_extraction_receipt_sha256": hashlib.sha256(extraction_receipt_raw).hexdigest(),
            "writable_pre_root_identity": list(identity(build_initial)),
            "writable_pre_tree_identity_sha256": pre_digest,
            "writable_post_root_identity": list(identity(post_root)),
            "writable_post_tree_identity_sha256": post_digest,
            "sdk_package_sha256": SDK_PACKAGE_SHA256,
            "files": placed_rows,
            "node_version": NODE_VERSION,
            "npm_version": NPM_VERSION,
            "node_sha256": extraction["node"]["sha256"],
            "node_identity": list(identity(node_saved)),
            "npm_cli_sha256": extraction["npm_cli"]["sha256"],
            "npm_cli_identity": list(identity(npm_saved)),
            "execution_cwd_identity": list(identity(post_root)),
            "execution_purpose": "sdk-unit",
            "execution_relative_path": SDK_TEST,
            "placement_complete": True,
            "sdk_root_producer_provenance": False,
            "node_executed": False,
            "npm_ci_admitted": False,
            "sdk_unit_admitted": False,
            "app_build_admitted": False,
            "post_build_dist_verification": False,
            "runtime_admission": False,
        }
        raw = canonical(receipt)
        placement_fd, placement_saved = _write_once(attempt_fd, PLACEMENT_RECEIPT_LEAF, raw)
        os.fsync(attempt_fd); os.fsync(build_parent_fd)
        _names(attempt_fd,
               {BUILD_ROOT_LEAF, WRITABLE_RECEIPT_LEAF, PLACEMENT_RECEIPT_LEAF}, deadline)
        final_nodes, final_digest = writable._scan(build_root_fd, combined_rows,
                                                    combined_directories, 0o700, 0o600, deadline)
        need(final_nodes == post_nodes and final_digest == post_digest
             and identity(os.fstat(writable_receipt_fd)) == identity(writable_at)
             and _read_fd(writable_receipt_fd, len(writable_receipt_raw), deadline) == writable_receipt_raw
             and identity(os.stat(WRITABLE_RECEIPT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(writable_at)
             and identity(os.fstat(sdk_receipt_fd)) == identity(sdk_receipt_at)
             and _read_fd(sdk_receipt_fd, len(sdk_receipt_raw), deadline) == sdk_receipt_raw
             and identity(os.stat(SDK_ROOT_RECEIPT_LEAF, dir_fd=sdk_parent_fd,
                                  follow_symlinks=False)) == identity(sdk_receipt_at)
             and identity(os.fstat(sdk_root_fd)) == identity(sdk_initial)
             and identity(os.stat(SDK_ROOT_LEAF, dir_fd=sdk_parent_fd,
                                  follow_symlinks=False)) == identity(sdk_initial)
             and identity(os.fstat(distribution_fd)) == identity(distribution_initial)
             and identity(os.fstat(extraction_receipt_fd)) == identity(extraction_at)
             and _read_fd(extraction_receipt_fd, len(extraction_receipt_raw), deadline) ==
             extraction_receipt_raw
             and identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(npm_fd)) == identity(npm_saved)
             and identity(os.fstat(placement_fd)) == identity(placement_saved)
             and identity(os.stat(PLACEMENT_RECEIPT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(placement_saved)
             and os.pread(placement_fd, len(raw) + 1, 0) == raw
             and identity(os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd,
                                  follow_symlinks=False)) == identity(os.fstat(attempt_fd))
             and object_anchor(os.fstat(build_parent_fd)) == object_anchor(build_parent_initial))
        final_node, final_node_at = _open_distribution_leaf(
            distribution_fd, node_fd, NODE_RELATIVE, True)
        final_npm, final_npm_at = _open_distribution_leaf(
            distribution_fd, npm_fd, NPM_RELATIVE, False)
        try:
            need(identity(final_node_at) == identity(node_saved)
                 and identity(final_npm_at) == identity(npm_saved))
            _verify_distribution_link(distribution_fd, NPM_LINK_RELATIVE, NPM_LINK_TARGET)
        finally:
            os.close(final_npm); os.close(final_node)
        for path in SDK_FILES:
            reopened, reopened_saved = _open_relative(sdk_root_fd, path, 0o400)
            try:
                need(sdk_identity(os.fstat(source_held[path])) == tuple(sdk_rows[path]["identity"])
                     == sdk_identity(reopened_saved) == sdk_identity(os.fstat(reopened))
                     == sdk_identity(os.fstat(sdk_file_fds[path]))
                     and identity(os.fstat(destination_held[path])) ==
                     tuple(next(row["destination_identity"] for row in placed_rows
                                if row["path"] == path)))
            finally:
                os.close(reopened)
        return raw
    except BaseException as failure:
        if bound:
            try:
                _quarantine(build_parent_fd, attempt_fd, attempt_initial)
            except BaseException as quarantine:
                raise PlacementFailure(
                    "compatible_full_app_sdk_placement_node24_quarantine_incomplete"
                ) from quarantine
        if isinstance(failure, PlacementFailure):
            raise
        raise PlacementFailure("compatible_full_app_sdk_placement_node24_denied") from failure
    finally:
        if placement_fd is not None:
            os.close(placement_fd)
        for fd in destination_held.values():
            os.close(fd)
        for fd in source_held.values():
            os.close(fd)


def main() -> int:
    print("compatible-full-app-sdk-placement-node24 HOLD producers_npm_and_execution_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
