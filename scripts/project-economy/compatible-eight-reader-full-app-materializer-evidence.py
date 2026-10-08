"""Unrouted exact809f held-FD materializer evidence; no child/network authority."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat


VERIFIER_SHA256 = "5115410dc3cec00451f4e39aff0c72e8032d034cff2ac4cfb763471bfa952c9d"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
SOURCE_COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
SOURCE_TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
ROOT_LEAF = "compatible-app-809f"
RECEIPT_LEAF = "materializer-evidence.json"
SOURCE_FILES = 2_445
SOURCE_BYTES = 20_984_073
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class EvidenceFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise EvidenceFailure("compatible_full_app_materializer_evidence_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def load_verifier(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536
         and hashlib.sha256(raw).hexdigest() == VERIFIER_SHA256)
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(
        "captured_compatible_full_app_source_verifier", loader=None))
    exec(compile(raw, "<captured-compatible-full-app-source-verifier>", "exec"),
         module.__dict__)
    need(module.MANIFEST == APP_MANIFEST_SHA256
         and module.COMMIT == SOURCE_COMMIT and module.TREE == SOURCE_TREE
         and callable(module.leaf) and callable(module.inventory)
         and callable(module.identity) and callable(module.selected)
         and callable(module.Deadline) and callable(module.require))
    return module


def _verify_rows(verifier, root_fd: int, root_saved: os.stat_result,
                 document: dict, expected_files: int,
                 expected_bytes: int) -> dict:
    """Traverse only through root_fd using the exact captured verifier primitives."""
    need(type(root_fd) is int and root_fd >= 0
         and type(expected_files) is int and 0 < expected_files <= SOURCE_FILES
         and type(expected_bytes) is int and 0 <= expected_bytes <= SOURCE_BYTES
         and type(document) is dict and type(document.get("files")) is list
         and len(document["files"]) == expected_files
         and verifier.identity(os.fstat(root_fd)) == verifier.identity(root_saved))
    deadline = verifier.Deadline()
    seen: set[str] = set()
    total = 0
    for row in document["files"]:
        deadline.check()
        need(type(row) is dict)
        name = row.get("path")
        size = row.get("bytes")
        need(type(name) is str and len(name) <= 512
             and re.fullmatch(r"[A-Za-z0-9_./$@\[\]-]+", name) is not None
             and not Path(name).is_absolute() and ".." not in Path(name).parts
             and Path(name).as_posix() == name and verifier.selected(name)
             and name not in seen and row.get("mode") == "100644"
             and type(size) is int and 0 <= size <= 1_048_576)
        data = verifier.leaf(root_fd, name, 1_048_576, deadline)
        need(type(data) is bytes)
        digest = hashlib.sha1(
            b"blob " + str(len(data)).encode("ascii") + b"\0" + data
        ).hexdigest()
        need(len(data) == size and digest == row.get("git_blob_sha1"))
        total += len(data)
        need(total <= expected_bytes)
        seen.add(name)
    observed = verifier.inventory(root_fd, deadline)
    need(seen == observed and total == expected_bytes
         and verifier.identity(os.fstat(root_fd)) == verifier.identity(root_saved))
    deadline.check()
    return {
        "schema": "compatible-full-app-source-body-verified.v1",
        "commit": SOURCE_COMMIT,
        "tree": SOURCE_TREE,
        "files": expected_files,
        "bytes": total,
        "cold_compile": False,
        "native_app": False,
    }


def verify_held(verifier, root_fd: int, root_saved: os.stat_result,
                manifest_raw: bytes) -> dict:
    """Verify the exact manifest against the already-open root directory FD."""
    need(type(manifest_raw) is bytes and 0 < len(manifest_raw) <= 524_288
         and hashlib.sha256(manifest_raw).hexdigest() == APP_MANIFEST_SHA256)
    document = json.loads(manifest_raw)
    need(type(document) is dict
         and document.get("schema") ==
         "operations-compatible-eight-reader-full-app-compile-source.v1"
         and document.get("repository") == "BillyHamren1/kalender-vyer-mix"
         and document.get("source_commit") == SOURCE_COMMIT
         and document.get("source_tree") == SOURCE_TREE
         and document.get("tree_truncated") is False)
    return _verify_rows(verifier, root_fd, root_saved, document,
                        SOURCE_FILES, SOURCE_BYTES)


def _open_private(path: Path) -> tuple[int, os.stat_result]:
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


def _write_bound_receipt(parent_fd: int, raw: bytes) -> tuple[int, os.stat_result]:
    need(type(raw) is bytes and 0 < len(raw) <= 65_536)
    fd = os.open(RECEIPT_LEAF,
                 os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
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
             and identity(os.fstat(fd)) == identity(saved)
             and identity(os.stat(RECEIPT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(saved))
        accepted = True
        return fd, saved
    finally:
        if not accepted:
            os.close(fd)


def emit_evidence(verifier_raw: bytes, manifest_raw: bytes,
                  private_parent: Path) -> bytes:
    """Verify exact source through the held root FD and persist bound evidence."""
    need(type(manifest_raw) is bytes and 0 < len(manifest_raw) <= 524_288
         and hashlib.sha256(manifest_raw).hexdigest() == APP_MANIFEST_SHA256)
    verifier = load_verifier(verifier_raw)
    parent_fd, parent_saved = _open_private(private_parent)
    root_fd = None
    receipt_fd = None
    try:
        root_path = private_parent / ROOT_LEAF
        root_at = os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        need(stat.S_ISDIR(root_at.st_mode) and root_at.st_uid == os.geteuid()
             and root_at.st_gid == os.getegid() and stat.S_IMODE(root_at.st_mode) == 0o700)
        root_fd = os.open(ROOT_LEAF, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                          dir_fd=parent_fd)
        root_saved = os.fstat(root_fd)
        need(identity(root_saved) == identity(root_at)
             and identity(root_path.lstat()) == identity(root_saved))
        result = verify_held(verifier, root_fd, root_saved, manifest_raw)
        need(type(result) is dict and result == {
            "schema": "compatible-full-app-source-body-verified.v1",
            "commit": SOURCE_COMMIT, "tree": SOURCE_TREE,
            "files": SOURCE_FILES, "bytes": SOURCE_BYTES,
            "cold_compile": False, "native_app": False,
        })
        need(identity(os.fstat(root_fd)) == identity(root_saved)
             and identity(os.stat(ROOT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(root_saved)
             and identity(root_path.lstat()) == identity(root_saved)
             and identity(os.fstat(parent_fd)) == identity(parent_saved)
             and identity(private_parent.lstat()) == identity(parent_saved))
        receipt = {
            "schema": "compatible-full-app-materializer-evidence.v1",
            "app_manifest_sha256": APP_MANIFEST_SHA256,
            "materialized_root_identity": list(identity(root_saved)),
            "source_files": SOURCE_FILES,
            "source_bytes": SOURCE_BYTES,
        }
        raw = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii")
        receipt_fd, receipt_saved = _write_bound_receipt(parent_fd, raw)
        os.fsync(parent_fd)
        need(anchor(os.fstat(parent_fd)) == anchor(parent_saved)
             and anchor(private_parent.lstat()) == anchor(parent_saved)
             and identity(os.fstat(root_fd)) == identity(root_saved)
             and identity(os.stat(ROOT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(root_saved)
             and identity(root_path.lstat()) == identity(root_saved)
             and identity(os.fstat(receipt_fd)) == identity(receipt_saved)
             and identity(os.stat(RECEIPT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(receipt_saved)
             and os.pread(receipt_fd, len(raw) + 1, 0) == raw)
        return raw
    finally:
        if receipt_fd is not None:
            os.close(receipt_fd)
        if root_fd is not None:
            os.close(root_fd)
        os.close(parent_fd)


def main() -> int:
    print("compatible-full-app-materializer-evidence FAIL unrouted_exact_tree_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
