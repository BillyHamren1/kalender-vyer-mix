"""Derive a distinct writable build root from the exact immutable App snapshot.

This source copies and verifies bytes only.  It has no process, network, npm,
build, SDK, browser, provider, workflow or release authority.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import stat
import time


SOURCE_COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
SOURCE_TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
MANIFEST_PROJECTION_SHA256 = "9fac867355f20d6586ffca32227ee8b861f64879cc2619c1427c1b3d97ea8cf8"
SOURCE_FILES = 2_445
SOURCE_BYTES = 20_984_073
SOURCE_DIRECTORIES = 220
SOURCE_ROOT_LEAF = "compatible-app-809f"
READ_ONLY_RECEIPT_LEAF = "read-only-tree-evidence.json"
ATTEMPT_LEAF = "compatible-full-app-build-derivation-attempt"
QUARANTINE_LEAF = ATTEMPT_LEAF + ".discarded"
BUILD_ROOT_LEAF = "writable-build-root"
OUTPUT_LEAF = "writable-build-root-evidence.json"
MAX_SECONDS = 300
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class DerivationFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise DerivationFailure("compatible_full_app_writable_build_root_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def object_anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid)


def quarantine_transition(before: os.stat_result, after: os.stat_result) -> bool:
    before_values = dict(zip(FIELDS, identity(before)))
    after_values = dict(zip(FIELDS, identity(after)))
    stable = tuple(field for field in FIELDS if field != "st_ctime_ns")
    return (all(before_values[field] == after_values[field] for field in stable)
            and after_values["st_ctime_ns"] >= before_values["st_ctime_ns"])


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def decode(raw: bytes, maximum: int, require_canonical: bool = True):
    need(type(raw) is bytes and 0 < len(raw) <= maximum)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(DerivationFailure()))
    except (UnicodeError, ValueError):
        raise DerivationFailure("compatible_full_app_writable_build_root_denied") from None
    need(require_canonical is False or canonical(value) == raw)
    return value


def lower_hash(value) -> str:
    need(type(value) is str and len(value) == 64
         and all(character in "0123456789abcdef" for character in value))
    return value


class Deadline:
    def __init__(self, seconds: float = MAX_SECONDS) -> None:
        need(type(seconds) in (int, float) and 0 < seconds <= MAX_SECONDS)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        need(time.monotonic() < self.end)


def _directory(fd: int, mode: int | None = None) -> os.stat_result:
    need(type(fd) is int and fd >= 0)
    saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and not saved.st_mode & 0o022
         and (mode is None or stat.S_IMODE(saved.st_mode) == mode))
    return saved


def _open_directory(parent_fd: int, leaf: str, mode: int):
    need(type(leaf) is str and leaf not in ("", ".", "..") and "/" not in leaf)
    before = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_gid == os.getegid() and stat.S_IMODE(before.st_mode) == mode)
    fd = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 dir_fd=parent_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
        return fd, before
    except BaseException:
        os.close(fd)
        raise


def _exact_names(fd: int, deadline: Deadline, expected: set[str]) -> None:
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


def _manifest(raw: bytes):
    need(hashlib.sha256(raw).hexdigest() == APP_MANIFEST_SHA256)
    value = decode(raw, 524_288, False)
    need(type(value) is dict
         and value.get("schema") ==
         "operations-compatible-eight-reader-full-app-compile-source.v1"
         and value.get("repository") == "BillyHamren1/kalender-vyer-mix"
         and value.get("source_commit") == SOURCE_COMMIT
         and value.get("source_tree") == SOURCE_TREE
         and value.get("tree_truncated") is False
         and value.get("runtime_admission") is False
         and type(value.get("files")) is list and len(value["files"]) == SOURCE_FILES)
    rows = {}
    directories = set()
    total = 0
    projection = bytearray()
    for row in sorted(value["files"], key=lambda item: item.get("path", "")):
        need(type(row) is dict and set(row) == {"path", "mode", "git_blob_sha1", "bytes"})
        name, size, blob = row["path"], row["bytes"], row["git_blob_sha1"]
        path = PurePosixPath(name) if type(name) is str else PurePosixPath("/")
        need(type(name) is str and 0 < len(name) <= 512
             and re.fullmatch(r"[A-Za-z0-9_./$@\[\]-]+", name) is not None
             and not path.is_absolute() and ".." not in path.parts
             and path.as_posix() == name and name not in rows
             and row["mode"] == "100644" and type(size) is int
             and 0 <= size <= 1_048_576 and type(blob) is str
             and re.fullmatch(r"[0-9a-f]{40}", blob) is not None)
        rows[name] = row
        total += size
        need(total <= SOURCE_BYTES)
        for index in range(1, len(path.parts)):
            directories.add("/".join(path.parts[:index]))
        projection.extend((name + "\0" + blob + "\0" + str(size) + "\0" +
                           row["mode"] + "\n").encode("ascii"))
    need(len(rows) == SOURCE_FILES and total == SOURCE_BYTES
         and len(directories) == SOURCE_DIRECTORIES
         and hashlib.sha256(projection).hexdigest() == MANIFEST_PROJECTION_SHA256)
    return rows, directories


READ_ONLY_KEYS = {
    "schema", "source_commit", "source_tree", "app_manifest_sha256",
    "manifest_projection_sha256", "materializer_receipt_sha256",
    "started_receipt_sha256", "source_files", "source_bytes",
    "source_directories_excluding_root", "pre_root_identity", "post_root_identity",
    "pre_identity_sha256", "post_identity_sha256", "authorized_identity_changes",
    "file_mode", "directory_mode", "full_tree_read_only", "immutable_filesystem",
    "root_purpose", "same_root_install_or_build", "derived_writable_build_root_required",
    "derived_writable_build_root_admission", "post_build_dist_verification",
    "runtime_admission",
}


def _read_only_receipt(raw: bytes, source_saved: os.stat_result):
    value = decode(raw, 65_536)
    need(type(value) is dict and set(value) == READ_ONLY_KEYS
         and value["schema"] == "compatible-full-app-read-only-tree-evidence.v2"
         and value["source_commit"] == SOURCE_COMMIT and value["source_tree"] == SOURCE_TREE
         and value["app_manifest_sha256"] == APP_MANIFEST_SHA256
         and value["manifest_projection_sha256"] == MANIFEST_PROJECTION_SHA256
         and value["source_files"] == SOURCE_FILES and value["source_bytes"] == SOURCE_BYTES
         and value["source_directories_excluding_root"] == SOURCE_DIRECTORIES
         and value["post_root_identity"] == list(identity(source_saved))
         and type(value["pre_root_identity"]) is list
         and len(value["pre_root_identity"]) == len(FIELDS)
         and all(type(item) is int for item in value["pre_root_identity"])
         and value["authorized_identity_changes"] == ["mode", "ctime_ns"]
         and value["file_mode"] == "0400" and value["directory_mode"] == "0500"
         and value["full_tree_read_only"] is True
         and value["immutable_filesystem"] is False
         and value["root_purpose"] == "immutable_source_snapshot_only"
         and value["same_root_install_or_build"] is False
         and value["derived_writable_build_root_required"] is True
         and value["derived_writable_build_root_admission"] is False
         and value["post_build_dist_verification"] is False
         and value["runtime_admission"] is False)
    for key in ("materializer_receipt_sha256", "started_receipt_sha256",
                "pre_identity_sha256", "post_identity_sha256"):
        lower_hash(value[key])
    return value


def _read_fd(fd: int, size: int, deadline: Deadline) -> bytes:
    result = bytearray()
    while len(result) <= size:
        deadline.check()
        part = os.pread(fd, min(65_536, size + 1 - len(result)), len(result))
        if not part:
            break
        result.extend(part)
    need(len(result) == size and os.pread(fd, 1, size) == b"")
    return bytes(result)


def _blob(raw: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def _identity_digest(nodes: dict[str, tuple[int, ...]]) -> str:
    digest = hashlib.sha256()
    for name in sorted(nodes):
        digest.update(name.encode("utf-8") + b"\0")
        digest.update((",".join(str(item) for item in nodes[name]) + "\n").encode("ascii"))
    return digest.hexdigest()


def _open_relative(root_fd: int, relative: str, directory: bool, mode: int):
    parts = PurePosixPath(relative).parts
    need(parts and all(part not in ("", ".", "..") for part in parts))
    parents = [os.dup(root_fd)]
    try:
        for part in parts[:-1]:
            child, _ = _open_directory(parents[-1], part, 0o500 if mode == 0o400 else 0o700)
            parents.append(child)
        before = os.stat(parts[-1], dir_fd=parents[-1], follow_symlinks=False)
        need((stat.S_ISDIR(before.st_mode) if directory else stat.S_ISREG(before.st_mode))
             and before.st_uid == os.geteuid() and before.st_gid == os.getegid()
             and stat.S_IMODE(before.st_mode) == mode
             and (directory or before.st_nlink == 1))
        flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if directory else 0)
        fd = os.open(parts[-1], flags, dir_fd=parents[-1])
        try:
            need(identity(os.fstat(fd)) == identity(before))
            return fd, before
        except BaseException:
            os.close(fd)
            raise
    finally:
        for parent in reversed(parents):
            os.close(parent)


def _scan(root_fd: int, rows: dict, directories: set[str], directory_mode: int,
          file_mode: int, deadline: Deadline):
    nodes = {}
    seen_files = set()
    seen_directories = set()
    count = 0

    def walk(fd: int, relative: str) -> None:
        nonlocal count
        deadline.check()
        before = os.fstat(fd)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_gid == os.getegid()
             and stat.S_IMODE(before.st_mode) == directory_mode)
        nodes[relative or "."] = identity(before)
        with os.scandir(fd) as entries:
            for entry in entries:
                deadline.check()
                count += 1
                leaf = entry.name
                need(count <= SOURCE_FILES + SOURCE_DIRECTORIES
                     and type(leaf) is str
                     and re.fullmatch(r"[A-Za-z0-9_.$@\[\]-]+", leaf) is not None)
                child = leaf if not relative else relative + "/" + leaf
                at = os.stat(leaf, dir_fd=fd, follow_symlinks=False)
                if child in directories:
                    need(stat.S_ISDIR(at.st_mode))
                    child_fd = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                       dir_fd=fd)
                    try:
                        need(identity(os.fstat(child_fd)) == identity(at))
                        seen_directories.add(child)
                        walk(child_fd, child)
                        need(identity(os.fstat(child_fd)) == identity(at)
                             and identity(os.stat(leaf, dir_fd=fd,
                                                  follow_symlinks=False)) == identity(at))
                    finally:
                        os.close(child_fd)
                else:
                    need(child in rows and stat.S_ISREG(at.st_mode)
                         and at.st_uid == os.geteuid() and at.st_gid == os.getegid()
                         and at.st_nlink == 1 and stat.S_IMODE(at.st_mode) == file_mode
                         and at.st_size == rows[child]["bytes"])
                    child_fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                    try:
                        need(identity(os.fstat(child_fd)) == identity(at))
                        raw = _read_fd(child_fd, rows[child]["bytes"], deadline)
                        need(_blob(raw) == rows[child]["git_blob_sha1"]
                             and identity(os.fstat(child_fd)) == identity(at)
                             and identity(os.stat(leaf, dir_fd=fd,
                                                  follow_symlinks=False)) == identity(at))
                        nodes[child] = identity(at)
                        seen_files.add(child)
                    finally:
                        os.close(child_fd)
        need(identity(os.fstat(fd)) == identity(before))

    walk(root_fd, "")
    need(seen_files == set(rows) and seen_directories == directories
         and count == SOURCE_FILES + SOURCE_DIRECTORIES)
    return nodes, _identity_digest(nodes)


def _make_directory(root_fd: int, relative: str) -> None:
    parts = PurePosixPath(relative).parts
    parent = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            child, _ = _open_directory(parent, part, 0o700)
            os.close(parent)
            parent = child
        os.mkdir(parts[-1], mode=0o700, dir_fd=parent)
        child, saved = _open_directory(parent, parts[-1], 0o700)
        os.close(child)
        need(identity(os.stat(parts[-1], dir_fd=parent,
                              follow_symlinks=False)) == identity(saved))
    finally:
        os.close(parent)


def _copy_file(source_root_fd: int, build_root_fd: int, name: str, row: dict,
               deadline: Deadline) -> None:
    source_fd, source_saved = _open_relative(source_root_fd, name, False, 0o400)
    parent = os.dup(build_root_fd)
    destination_fd = None
    try:
        raw = _read_fd(source_fd, row["bytes"], deadline)
        need(_blob(raw) == row["git_blob_sha1"]
             and identity(os.fstat(source_fd)) == identity(source_saved))
        parts = PurePosixPath(name).parts
        for part in parts[:-1]:
            child, _ = _open_directory(parent, part, 0o700)
            os.close(parent)
            parent = child
        destination_fd = os.open(parts[-1], os.O_CREAT | os.O_EXCL | os.O_RDWR |
                                 os.O_NOFOLLOW, 0o600, dir_fd=parent)
        os.fchmod(destination_fd, 0o600)
        cursor = 0
        while cursor < len(raw):
            deadline.check()
            written = os.write(destination_fd, raw[cursor:])
            need(written > 0)
            cursor += written
        os.fsync(destination_fd)
        saved = os.fstat(destination_fd)
        need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
             and saved.st_gid == os.getegid() and saved.st_nlink == 1
             and stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_size == len(raw)
             and os.pread(destination_fd, len(raw) + 1, 0) == raw
             and identity(os.stat(parts[-1], dir_fd=parent,
                                  follow_symlinks=False)) == identity(saved)
             and identity(os.fstat(source_fd)) == identity(source_saved))
    finally:
        if destination_fd is not None:
            os.close(destination_fd)
        os.close(parent)
        os.close(source_fd)


def _write_once(attempt_fd: int, raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536)
    fd = os.open(OUTPUT_LEAF, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                 0o600, dir_fd=attempt_fd)
    accepted = False
    try:
        os.fchmod(fd, 0o600)
        cursor = 0
        while cursor < len(raw):
            written = os.write(fd, raw[cursor:])
            need(written > 0)
            cursor += written
        os.fsync(fd)
        saved = os.fstat(fd)
        need(stat.S_ISREG(saved.st_mode) and saved.st_nlink == 1
             and saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
             and stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_size == len(raw)
             and os.pread(fd, len(raw) + 1, 0) == raw
             and identity(os.stat(OUTPUT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(saved))
        accepted = True
        return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def _rename_noreplace(parent_fd: int, source: str, destination: str) -> None:
    need(source == ATTEMPT_LEAF and destination == QUARANTINE_LEAF)
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


def _quarantine(parent_fd: int, attempt_fd: int, saved: os.stat_result) -> None:
    parent_saved = _directory(parent_fd, 0o700)
    pre_rename = os.fstat(attempt_fd)
    at_path = os.stat(ATTEMPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    need(anchor(pre_rename) == anchor(saved) == anchor(at_path)
         and identity(at_path) == identity(pre_rename))
    try:
        os.stat(QUARANTINE_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        need(False)
    _rename_noreplace(parent_fd, ATTEMPT_LEAF, QUARANTINE_LEAF)
    reopened, at = _open_directory(parent_fd, QUARANTINE_LEAF, 0o700)
    try:
        post_saved = os.fstat(attempt_fd)
        need(quarantine_transition(pre_rename, post_saved)
             and identity(os.fstat(reopened)) == identity(post_saved)
             and identity(at) == identity(post_saved))
        try:
            os.stat(ATTEMPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)
        os.fsync(parent_fd)
        need(identity(os.fstat(attempt_fd)) == identity(post_saved)
             and identity(os.stat(QUARANTINE_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(post_saved))
    finally:
        os.close(reopened)
    need(object_anchor(os.fstat(parent_fd)) == object_anchor(parent_saved)
         and stat.S_IMODE(os.fstat(parent_fd).st_mode) == 0o700)


def derive_writable_build_root(manifest_raw: bytes, read_only_raw: bytes,
                               source_parent_fd: int, source_root_fd: int,
                               read_only_receipt_fd: int, build_parent_fd: int,
                               attempt_fd: int, build_root_fd: int) -> bytes:
    """Copy the exact immutable source into a distinct writable root; never execute."""
    bound = False
    attempt_saved = None
    output_fd = None
    try:
        deadline = Deadline()
        need(len({source_parent_fd, source_root_fd, read_only_receipt_fd,
                  build_parent_fd, attempt_fd, build_root_fd}) == 6)
        source_parent_saved = _directory(source_parent_fd, 0o700)
        source_saved = _directory(source_root_fd, 0o500)
        build_parent_saved = _directory(build_parent_fd, 0o700)
        attempt_saved = _directory(attempt_fd, 0o700)
        build_saved = _directory(build_root_fd, 0o700)
        need((source_parent_saved.st_dev, source_parent_saved.st_ino) !=
             (build_parent_saved.st_dev, build_parent_saved.st_ino))
        attempt_reopened, attempt_at = _open_directory(build_parent_fd, ATTEMPT_LEAF, 0o700)
        try:
            need(identity(os.fstat(attempt_reopened)) == identity(attempt_saved)
                 == identity(attempt_at))
        finally:
            os.close(attempt_reopened)
        bound = True
        source_reopened, source_at = _open_directory(source_parent_fd,
                                                      SOURCE_ROOT_LEAF, 0o500)
        build_reopened, build_at = _open_directory(attempt_fd, BUILD_ROOT_LEAF, 0o700)
        try:
            need(identity(os.fstat(source_reopened)) == identity(source_saved)
                 == identity(source_at)
                 and identity(os.fstat(build_reopened)) == identity(build_saved)
                 == identity(build_at)
                 and (source_saved.st_dev, source_saved.st_ino) !=
                 (build_saved.st_dev, build_saved.st_ino))
        finally:
            os.close(build_reopened)
            os.close(source_reopened)
        _exact_names(attempt_fd, deadline, {BUILD_ROOT_LEAF})
        _exact_names(build_root_fd, deadline, set())
        rows, directories = _manifest(manifest_raw)
        receipt_at = os.stat(READ_ONLY_RECEIPT_LEAF, dir_fd=source_parent_fd,
                             follow_symlinks=False)
        need(stat.S_ISREG(receipt_at.st_mode) and receipt_at.st_uid == os.geteuid()
             and receipt_at.st_gid == os.getegid() and receipt_at.st_nlink == 1
             and stat.S_IMODE(receipt_at.st_mode) == 0o600
             and receipt_at.st_size == len(read_only_raw)
             and identity(os.fstat(read_only_receipt_fd)) == identity(receipt_at)
             and _read_fd(read_only_receipt_fd, len(read_only_raw), deadline) == read_only_raw)
        read_only = _read_only_receipt(read_only_raw, source_saved)
        source_nodes, source_digest = _scan(source_root_fd, rows, directories,
                                            0o500, 0o400, deadline)
        need(source_digest == read_only["post_identity_sha256"]
             and source_nodes["."] == identity(source_saved))
        for directory in sorted(directories, key=lambda value: (value.count("/"), value)):
            deadline.check()
            _make_directory(build_root_fd, directory)
        for name in sorted(rows):
            deadline.check()
            _copy_file(source_root_fd, build_root_fd, name, rows[name], deadline)
        destination_nodes, destination_digest = _scan(build_root_fd, rows, directories,
                                                       0o700, 0o600, deadline)
        final_source_nodes, final_source_digest = _scan(source_root_fd, rows, directories,
                                                        0o500, 0o400, deadline)
        need(final_source_nodes == source_nodes and final_source_digest == source_digest
             and (destination_nodes["."][0], destination_nodes["."][1]) !=
             (source_nodes["."][0], source_nodes["."][1]))
        receipt = {
            "schema": "compatible-full-app-writable-build-root-evidence.v1",
            "source_commit": SOURCE_COMMIT,
            "source_tree": SOURCE_TREE,
            "app_manifest_sha256": APP_MANIFEST_SHA256,
            "manifest_projection_sha256": MANIFEST_PROJECTION_SHA256,
            "immutable_source_receipt_sha256": hashlib.sha256(read_only_raw).hexdigest(),
            "immutable_source_root_identity": list(source_nodes["."]),
            "immutable_source_identity_sha256": source_digest,
            "writable_build_root_identity": list(destination_nodes["."]),
            "writable_build_identity_sha256": destination_digest,
            "source_files": SOURCE_FILES,
            "source_bytes": SOURCE_BYTES,
            "source_directories_excluding_root": SOURCE_DIRECTORIES,
            "source_root_purpose": "immutable_source_snapshot_only",
            "build_root_purpose": "derived_writable_build_root",
            "same_root": False,
            "file_mode": "0600",
            "directory_mode": "0700",
            "complete_source_join": True,
            "sdk_routing": False,
            "npm_ci_admitted": False,
            "app_build_admitted": False,
            "post_build_dist_verification": False,
            "runtime_admission": False,
        }
        raw = canonical(receipt)
        output_fd, output_saved = _write_once(attempt_fd, raw)
        os.fsync(attempt_fd)
        os.fsync(build_parent_fd)
        _exact_names(attempt_fd, deadline, {BUILD_ROOT_LEAF, OUTPUT_LEAF})
        final_destination_nodes, final_destination_digest = _scan(
            build_root_fd, rows, directories, 0o700, 0o600, deadline)
        need(final_destination_nodes == destination_nodes
             and final_destination_digest == destination_digest
             and identity(os.fstat(source_root_fd)) == identity(source_saved)
             and identity(os.stat(SOURCE_ROOT_LEAF, dir_fd=source_parent_fd,
                                  follow_symlinks=False)) == identity(source_saved)
             and identity(os.fstat(read_only_receipt_fd)) == identity(receipt_at)
             and os.pread(read_only_receipt_fd, len(read_only_raw) + 1, 0) == read_only_raw
             and identity(os.stat(READ_ONLY_RECEIPT_LEAF, dir_fd=source_parent_fd,
                                  follow_symlinks=False)) == identity(receipt_at)
             and identity(os.fstat(build_root_fd)) == destination_nodes["."]
             and identity(os.stat(BUILD_ROOT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == destination_nodes["."]
             and identity(os.fstat(output_fd)) == identity(output_saved)
             and os.pread(output_fd, len(raw) + 1, 0) == raw
             and identity(os.stat(OUTPUT_LEAF, dir_fd=attempt_fd,
                                  follow_symlinks=False)) == identity(output_saved)
             and anchor(os.fstat(attempt_fd)) == anchor(attempt_saved)
             and identity(os.stat(ATTEMPT_LEAF, dir_fd=build_parent_fd,
                                  follow_symlinks=False)) == identity(os.fstat(attempt_fd)))
        return raw
    except BaseException as failure:
        if bound:
            try:
                _quarantine(build_parent_fd, attempt_fd, attempt_saved)
            except BaseException as cleanup:
                raise DerivationFailure(
                    "compatible_full_app_writable_build_root_quarantine_incomplete"
                ) from cleanup
        if isinstance(failure, DerivationFailure):
            raise
        raise DerivationFailure("compatible_full_app_writable_build_root_denied") from failure
    finally:
        if output_fd is not None:
            os.close(output_fd)


def main() -> int:
    print("compatible-full-app-writable-build-root HOLD immutable_source_route_and_runner_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
