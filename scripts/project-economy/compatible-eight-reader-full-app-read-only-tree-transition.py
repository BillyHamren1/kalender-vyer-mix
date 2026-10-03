"""Unrouted exact-2445 immutable-source-root transition; no build/runtime authority."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import time


APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
MANIFEST_PROJECTION_SHA256 = "9fac867355f20d6586ffca32227ee8b861f64879cc2619c1427c1b3d97ea8cf8"
SOURCE_COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
SOURCE_TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
ROOT_LEAF = "compatible-app-809f"
MATERIALIZER_LEAF = "materializer-evidence.json"
STARTED_LEAF = "read-only-tree-transition.started.json"
RECEIPT_LEAF = "read-only-tree-evidence.json"
SOURCE_FILES = 2_445
SOURCE_BYTES = 20_984_073
SOURCE_DIRECTORIES = 220
MAX_SECONDS = 300
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class TransitionFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise TransitionFailure("compatible_full_app_read_only_transition_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def _constant(_value):
    raise TransitionFailure("compatible_full_app_read_only_transition_denied")


def parse_json(raw: bytes, maximum: int):
    need(type(raw) is bytes and 0 < len(raw) <= maximum)
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                          parse_constant=_constant)
    except TransitionFailure:
        raise
    except BaseException as error:
        raise TransitionFailure("compatible_full_app_read_only_transition_denied") from error


def parse_manifest(raw: bytes) -> tuple[dict[str, dict], set[str]]:
    need(hashlib.sha256(raw).hexdigest() == APP_MANIFEST_SHA256)
    document = parse_json(raw, 524_288)
    need(type(document) is dict
         and document.get("schema") ==
         "operations-compatible-eight-reader-full-app-compile-source.v1"
         and document.get("repository") == "BillyHamren1/kalender-vyer-mix"
         and document.get("source_commit") == SOURCE_COMMIT
         and document.get("source_tree") == SOURCE_TREE
         and document.get("tree_truncated") is False
         and document.get("runtime_admission") is False
         and type(document.get("files")) is list
         and len(document["files"]) == SOURCE_FILES)
    rows = {}
    directories: set[str] = set()
    total = 0
    projection = bytearray()
    for row in sorted(document["files"], key=lambda value: value.get("path", "")):
        need(type(row) is dict and set(row) == {"path", "mode", "git_blob_sha1", "bytes"})
        name = row["path"]
        size = row["bytes"]
        blob = row["git_blob_sha1"]
        need(type(name) is str and 0 < len(name) <= 512
             and re.fullmatch(r"[A-Za-z0-9_./$@\[\]-]+", name) is not None
             and not PurePosixPath(name).is_absolute()
             and ".." not in PurePosixPath(name).parts
             and PurePosixPath(name).as_posix() == name
             and name not in rows and row["mode"] == "100644"
             and type(size) is int and 0 <= size <= 1_048_576
             and type(blob) is str and re.fullmatch(r"[0-9a-f]{40}", blob) is not None)
        rows[name] = row
        total += size
        parts = PurePosixPath(name).parts
        for index in range(1, len(parts)):
            directories.add("/".join(parts[:index]))
        projection.extend((name + "\0" + blob + "\0" + str(size) + "\0" +
                           row["mode"] + "\n").encode("ascii"))
    need(len(rows) == SOURCE_FILES and total == SOURCE_BYTES
         and len(directories) == SOURCE_DIRECTORIES
         and hashlib.sha256(projection).hexdigest() == MANIFEST_PROJECTION_SHA256)
    return rows, directories


def _read_fd(fd: int, size: int) -> bytes:
    result = bytearray()
    while len(result) <= size:
        part = os.pread(fd, min(65_536, size + 1 - len(result)), len(result))
        if not part:
            break
        result.extend(part)
    need(len(result) == size and os.pread(fd, 1, size) == b"")
    return bytes(result)


def _git_blob(raw: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def _identity_digest(nodes: dict[str, tuple[int, ...]]) -> str:
    digest = hashlib.sha256()
    for name in sorted(nodes):
        digest.update(name.encode("utf-8") + b"\0")
        digest.update((",".join(str(value) for value in nodes[name]) + "\n").encode("ascii"))
    return digest.hexdigest()


def _same_path(fd: int, name: str, parent_fd: int, saved: os.stat_result) -> None:
    need(identity(os.fstat(fd)) == identity(saved)
         and identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) == identity(saved))


def _scan(root_fd: int, rows: dict[str, dict], directories: set[str],
          directory_mode: int, file_mode: int, deadline: float) -> tuple[dict[str, tuple[int, ...]], str]:
    nodes: dict[str, tuple[int, ...]] = {}
    seen_files: set[str] = set()
    seen_directories: set[str] = set()
    entry_count = 0

    def walk(fd: int, relative: str) -> None:
        nonlocal entry_count
        need(time.monotonic() < deadline)
        before = os.fstat(fd)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_gid == os.getegid() and before.st_nlink >= 2
             and stat.S_IMODE(before.st_mode) == directory_mode)
        nodes[relative or "."] = identity(before)
        with os.scandir(fd) as entries:
            for entry in entries:
                entry_count += 1
                leaf = entry.name
                need(time.monotonic() < deadline and type(leaf) is str
                     and entry_count <= SOURCE_FILES + SOURCE_DIRECTORIES
                     and re.fullmatch(r"[A-Za-z0-9_.$@\[\]-]+", leaf) is not None)
                child = leaf if not relative else relative + "/" + leaf
                at = os.stat(leaf, dir_fd=fd, follow_symlinks=False)
                if child in directories:
                    need(stat.S_ISDIR(at.st_mode))
                    child_fd = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                       dir_fd=fd)
                    try:
                        _same_path(child_fd, leaf, fd, at)
                        seen_directories.add(child)
                        walk(child_fd, child)
                        _same_path(child_fd, leaf, fd, at)
                    finally:
                        os.close(child_fd)
                else:
                    need(child in rows and stat.S_ISREG(at.st_mode)
                         and at.st_uid == os.geteuid() and at.st_gid == os.getegid()
                         and at.st_nlink == 1 and stat.S_IMODE(at.st_mode) == file_mode
                         and at.st_size == rows[child]["bytes"])
                    child_fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                    try:
                        _same_path(child_fd, leaf, fd, at)
                        raw = _read_fd(child_fd, rows[child]["bytes"])
                        need(_git_blob(raw) == rows[child]["git_blob_sha1"])
                        _same_path(child_fd, leaf, fd, at)
                        nodes[child] = identity(at)
                        seen_files.add(child)
                    finally:
                        os.close(child_fd)
        need(identity(os.fstat(fd)) == identity(before))

    walk(root_fd, "")
    need(seen_files == set(rows) and seen_directories == directories
         and entry_count == SOURCE_FILES + SOURCE_DIRECTORIES
         and len(nodes) == 1 + SOURCE_DIRECTORIES + SOURCE_FILES)
    return nodes, _identity_digest(nodes)


def _open_node(root_fd: int, relative: str, current: dict[str, tuple[int, ...]],
               want_directory: bool) -> tuple[int, int, str, os.stat_result]:
    parts = PurePosixPath(relative).parts
    need(parts and relative != ".")
    parent_fd = os.dup(root_fd)
    try:
        need(identity(os.fstat(parent_fd)) == current["."])
        prefix = ""
        for part in parts[:-1]:
            prefix = part if not prefix else prefix + "/" + part
            at = os.stat(part, dir_fd=parent_fd, follow_symlinks=False)
            child_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                               dir_fd=parent_fd)
            try:
                need(identity(at) == current[prefix]
                     and identity(os.fstat(child_fd)) == current[prefix])
            except BaseException:
                os.close(child_fd)
                raise
            os.close(parent_fd)
            parent_fd = child_fd
        leaf = parts[-1]
        at = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
        flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if want_directory else 0)
        target_fd = os.open(leaf, flags, dir_fd=parent_fd)
        try:
            need(identity(at) == current[relative]
                 and identity(os.fstat(target_fd)) == current[relative]
                 and (stat.S_ISDIR(at.st_mode) if want_directory else stat.S_ISREG(at.st_mode)))
        except BaseException:
            os.close(target_fd)
            raise
        return target_fd, parent_fd, leaf, at
    except BaseException:
        os.close(parent_fd)
        raise


def _authorized(before: tuple[int, ...], after: tuple[int, ...], mode: int) -> bool:
    before_map = dict(zip(FIELDS, before))
    after_map = dict(zip(FIELDS, after))
    stable = tuple(field for field in FIELDS if field not in ("st_mode", "st_ctime_ns"))
    return (all(before_map[field] == after_map[field] for field in stable)
            and stat.S_IMODE(after_map["st_mode"]) == mode
            and stat.S_IFMT(before_map["st_mode"]) == stat.S_IFMT(after_map["st_mode"])
            and after_map["st_ctime_ns"] >= before_map["st_ctime_ns"])


def _chmod_node(root_fd: int, relative: str, current: dict[str, tuple[int, ...]],
                target_mode: int, want_directory: bool, deadline: float,
                rows: dict[str, dict]) -> None:
    need(time.monotonic() < deadline)
    target_fd, parent_fd, leaf, at = _open_node(root_fd, relative, current, want_directory)
    try:
        os.fchmod(target_fd, target_mode)
        os.fsync(target_fd)
        after = os.fstat(target_fd)
        need(_authorized(identity(at), identity(after), target_mode)
             and identity(os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)) == identity(after))
        if not want_directory:
            raw = _read_fd(target_fd, rows[relative]["bytes"])
            need(_git_blob(raw) == rows[relative]["git_blob_sha1"])
        current[relative] = identity(after)
    finally:
        os.close(target_fd)
        os.close(parent_fd)
    need(time.monotonic() < deadline)


def _write_exclusive(parent_fd: int, leaf: str, raw: bytes) -> tuple[int, os.stat_result]:
    need(leaf in (STARTED_LEAF, RECEIPT_LEAF) and type(raw) is bytes and 0 < len(raw) <= 65_536)
    fd = os.open(leaf, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=parent_fd)
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
        need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
             and saved.st_gid == os.getegid() and saved.st_nlink == 1
             and stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_size == len(raw)
             and os.pread(fd, len(raw) + 1, 0) == raw
             and identity(os.stat(leaf, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(saved))
        accepted = True
        return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def _open_parent(path: Path) -> tuple[int, os.stat_result]:
    need(type(path) is type(Path(".")) and path.is_absolute() and path.resolve() == path
         and not path.is_symlink())
    saved = path.lstat()
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and stat.S_IMODE(saved.st_mode) == 0o700)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        need(identity(os.fstat(fd)) == identity(saved))
    except BaseException:
        os.close(fd)
        raise
    return fd, saved


def _open_exact_receipt(parent_fd: int, raw: bytes) -> tuple[int, os.stat_result]:
    need(type(raw) is bytes and 0 < len(raw) <= 65_536)
    at = os.stat(MATERIALIZER_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISREG(at.st_mode) and at.st_uid == os.geteuid()
         and at.st_gid == os.getegid() and at.st_nlink == 1
         and stat.S_IMODE(at.st_mode) == 0o600 and at.st_size == len(raw))
    fd = os.open(MATERIALIZER_LEAF, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        need(identity(os.fstat(fd)) == identity(at)
             and _read_fd(fd, len(raw)) == raw
             and identity(os.fstat(fd)) == identity(at)
             and identity(os.stat(MATERIALIZER_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(at))
    except BaseException:
        os.close(fd)
        raise
    return fd, at


def _require_absent(parent_fd: int, leaf: str) -> None:
    need(leaf in (STARTED_LEAF, RECEIPT_LEAF))
    try:
        os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    raise FileExistsError(leaf)


def transition_tree(manifest_raw: bytes, materializer_raw: bytes,
                    private_parent: Path) -> bytes:
    """Apply only the exact mode/ctime transition and persist bounded evidence."""
    rows, directories = parse_manifest(manifest_raw)
    materializer = parse_json(materializer_raw, 65_536)
    need(type(materializer) is dict and set(materializer) == {
        "schema", "app_manifest_sha256", "materialized_root_identity",
        "source_files", "source_bytes"
    } and materializer["schema"] == "compatible-full-app-materializer-evidence.v1"
         and materializer["app_manifest_sha256"] == APP_MANIFEST_SHA256
         and materializer["source_files"] == SOURCE_FILES
         and materializer["source_bytes"] == SOURCE_BYTES
         and type(materializer["materialized_root_identity"]) is list
         and len(materializer["materialized_root_identity"]) == len(FIELDS)
         and all(type(value) is int for value in materializer["materialized_root_identity"]))
    deadline = time.monotonic() + MAX_SECONDS
    parent_fd, parent_saved = _open_parent(private_parent)
    materializer_fd = root_fd = started_fd = receipt_fd = None
    try:
        materializer_fd, materializer_saved = _open_exact_receipt(parent_fd, materializer_raw)
        _require_absent(parent_fd, STARTED_LEAF)
        _require_absent(parent_fd, RECEIPT_LEAF)
        root_at = os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        root_fd = os.open(ROOT_LEAF, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                          dir_fd=parent_fd)
        root_saved = os.fstat(root_fd)
        need(identity(root_at) == identity(root_saved)
             and list(identity(root_saved)) == materializer["materialized_root_identity"]
             and stat.S_IMODE(root_saved.st_mode) == 0o700)
        pre_nodes, pre_digest = _scan(root_fd, rows, directories, 0o700, 0o600, deadline)
        confirm_nodes, confirm_digest = _scan(root_fd, rows, directories, 0o700, 0o600, deadline)
        need(pre_nodes == confirm_nodes and pre_digest == confirm_digest
             and pre_nodes["."] == identity(root_saved))
        started = {
            "schema": "compatible-full-app-read-only-tree-transition-started.v2",
            "app_manifest_sha256": APP_MANIFEST_SHA256,
            "manifest_projection_sha256": MANIFEST_PROJECTION_SHA256,
            "materializer_receipt_sha256": hashlib.sha256(materializer_raw).hexdigest(),
            "pre_identity_sha256": pre_digest,
            "pre_root_identity": list(identity(root_saved)),
            "source_files": SOURCE_FILES,
            "source_directories_excluding_root": SOURCE_DIRECTORIES,
            "discard_entire_private_attempt_on_any_failure": True,
            "root_purpose": "immutable_source_snapshot_only",
            "same_root_install_or_build": False,
            "derived_writable_build_root_required": True,
            "derived_writable_build_root_admission": False,
            "post_build_dist_verification": False,
            "runtime_admission": False,
        }
        started_raw = json.dumps(started, sort_keys=True, separators=(",", ":")).encode("ascii")
        started_fd, started_saved = _write_exclusive(parent_fd, STARTED_LEAF, started_raw)
        os.fsync(parent_fd)
        current = dict(pre_nodes)
        for name in sorted(rows):
            _chmod_node(root_fd, name, current, 0o400, False, deadline, rows)
        for name in sorted(directories, key=lambda value: (-value.count("/"), value)):
            _chmod_node(root_fd, name, current, 0o500, True, deadline, rows)
        before_root_mode = current["."]
        os.fchmod(root_fd, 0o500)
        os.fsync(root_fd)
        root_after = os.fstat(root_fd)
        need(_authorized(before_root_mode, identity(root_after), 0o500)
             and identity(os.stat(ROOT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(root_after))
        current["."] = identity(root_after)
        post_nodes, post_digest = _scan(root_fd, rows, directories, 0o500, 0o400, deadline)
        need(post_nodes == current)
        for name in pre_nodes:
            target = 0o400 if name in rows else 0o500
            need(_authorized(pre_nodes[name], post_nodes[name], target))
        receipt = {
            "schema": "compatible-full-app-read-only-tree-evidence.v2",
            "source_commit": SOURCE_COMMIT,
            "source_tree": SOURCE_TREE,
            "app_manifest_sha256": APP_MANIFEST_SHA256,
            "manifest_projection_sha256": MANIFEST_PROJECTION_SHA256,
            "materializer_receipt_sha256": hashlib.sha256(materializer_raw).hexdigest(),
            "started_receipt_sha256": hashlib.sha256(started_raw).hexdigest(),
            "source_files": SOURCE_FILES,
            "source_bytes": SOURCE_BYTES,
            "source_directories_excluding_root": SOURCE_DIRECTORIES,
            "pre_root_identity": list(pre_nodes["."]),
            "post_root_identity": list(post_nodes["."]),
            "pre_identity_sha256": pre_digest,
            "post_identity_sha256": post_digest,
            "authorized_identity_changes": ["mode", "ctime_ns"],
            "file_mode": "0400",
            "directory_mode": "0500",
            "full_tree_read_only": True,
            "immutable_filesystem": False,
            "root_purpose": "immutable_source_snapshot_only",
            "same_root_install_or_build": False,
            "derived_writable_build_root_required": True,
            "derived_writable_build_root_admission": False,
            "post_build_dist_verification": False,
            "runtime_admission": False,
        }
        raw = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii")
        receipt_fd, receipt_saved = _write_exclusive(parent_fd, RECEIPT_LEAF, raw)
        os.fsync(parent_fd)
        final_nodes, final_digest = _scan(root_fd, rows, directories, 0o500, 0o400, deadline)
        need(final_nodes == post_nodes and final_digest == post_digest
             and identity(os.fstat(root_fd)) == post_nodes["."]
             and identity(os.stat(ROOT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == post_nodes["."]
             and identity(os.fstat(materializer_fd)) == identity(materializer_saved)
             and identity(os.stat(MATERIALIZER_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(materializer_saved)
             and _read_fd(materializer_fd, len(materializer_raw)) == materializer_raw
             and identity(os.fstat(started_fd)) == identity(started_saved)
             and identity(os.stat(STARTED_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(started_saved)
             and os.pread(started_fd, len(started_raw) + 1, 0) == started_raw
             and identity(os.fstat(receipt_fd)) == identity(receipt_saved)
             and identity(os.stat(RECEIPT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(receipt_saved)
             and os.pread(receipt_fd, len(raw) + 1, 0) == raw
             and anchor(os.fstat(parent_fd)) == anchor(parent_saved)
             and anchor(private_parent.lstat()) == anchor(parent_saved)
             and time.monotonic() < deadline)
        return raw
    finally:
        for fd in (receipt_fd, started_fd, root_fd, materializer_fd, parent_fd):
            if fd is not None:
                os.close(fd)


def main() -> int:
    print("compatible-full-app-read-only-tree-transition FAIL unrouted_exact_tree_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
