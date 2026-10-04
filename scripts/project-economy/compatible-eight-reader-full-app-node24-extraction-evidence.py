"""Unrouted exact Node24 extraction/executable evidence; never executes Node."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import time


PREPARATION_SHA256 = "e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42"
POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
ARCHIVE_ROOT = "node-v24.21.0-linux-x64"
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
NODE_PATH = "bin/node"
NPM_PATH = "lib/node_modules/npm/bin/npm-cli.js"
NPM_LINK = "bin/npm"
NPM_LINK_TARGET = "../lib/node_modules/npm/bin/npm-cli.js"
EXTRACTION_LEAF = "node24-distribution"
RECEIPT_LEAF = "node24-extraction-evidence.json"
ARCHIVE_LIMIT = 67_108_864
FILE_LIMIT = 134_217_728
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class ExtractionEvidenceFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise ExtractionEvidenceFailure("compatible_full_app_node24_extraction_evidence_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


class Deadline:
    def __init__(self, seconds: float = 300) -> None:
        need(type(seconds) in (int, float) and 0 < seconds <= 300)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        need(time.monotonic() < self.end)


def load_preparation(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536
         and hashlib.sha256(raw).hexdigest() == PREPARATION_SHA256)
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(
        "captured_compatible_full_app_node24_preparation", loader=None))
    exec(compile(raw, "<captured-compatible-full-app-node24-preparation>", "exec"),
         module.__dict__)
    need(module.SOURCE_POLICY_SHA256 == POLICY_SHA256
         and module.ARCHIVE_SHA256 == ARCHIVE_SHA256
         and module.ARCHIVE_ROOT == ARCHIVE_ROOT
         and module.NODE_VERSION == NODE_VERSION and module.NPM_VERSION == NPM_VERSION
         and module.NODE_PATH == ARCHIVE_ROOT + "/" + NODE_PATH
         and module.NPM_PATH == ARCHIVE_ROOT + "/" + NPM_PATH
         and module.NPM_LINK == ARCHIVE_ROOT + "/" + NPM_LINK
         and module.NPM_LINK_TARGET == NPM_LINK_TARGET
         and callable(module.parse_source_policy) and callable(module.extract_archive))
    return module


def _open_private_empty(path: Path) -> tuple[int, os.stat_result]:
    need(type(path) is type(Path(".")) and path.is_absolute() and path.resolve() == path
         and not path.is_symlink())
    saved = path.lstat()
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and stat.S_IMODE(saved.st_mode) == 0o700)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        need(identity(os.fstat(fd)) == identity(saved))
        with os.scandir(fd) as entries:
            need(next(entries, None) is None)
    except BaseException:
        os.close(fd)
        raise
    return fd, saved


def _hash_fd(fd: int, maximum: int, deadline: Deadline,
             expected_sha256: str | None = None) -> tuple[str, os.stat_result]:
    need(type(fd) is int and fd >= 0 and type(maximum) is int and 0 < maximum <= FILE_LIMIT)
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and saved.st_nlink == 1
         and not saved.st_mode & 0o222 and 0 < saved.st_size <= maximum)
    digest = hashlib.sha256()
    offset = 0
    while offset <= saved.st_size:
        deadline.check()
        part = os.pread(fd, min(65_536, saved.st_size + 1 - offset), offset)
        if not part:
            break
        offset += len(part)
        need(offset <= saved.st_size)
        digest.update(part)
    value = digest.hexdigest()
    need(offset == saved.st_size and identity(os.fstat(fd)) == identity(saved)
         and (expected_sha256 is None or value == expected_sha256))
    return value, saved


def _open_directory_at(parent_fd: int, name: str) -> tuple[int, os.stat_result]:
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
         and before.st_gid == os.getegid() and stat.S_IMODE(before.st_mode) == 0o700)
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
    except BaseException:
        os.close(fd)
        raise
    return fd, before


def _read_leaf(root_fd: int, relative: str, maximum: int,
               executable: bool | None, deadline: Deadline) -> dict:
    parts = tuple(relative.split("/"))
    need(parts and all(part and part not in (".", "..") for part in parts))
    opened = [os.dup(root_fd)]
    slots = []
    try:
        for part in parts[:-1]:
            deadline.check()
            child, saved = _open_directory_at(opened[-1], part)
            slots.append((opened[-1], part, saved))
            opened.append(child)
        before = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_gid == os.getegid() and before.st_nlink == 1
             and not before.st_mode & 0o022 and 0 < before.st_size <= maximum
             and (executable is None
                  or bool(stat.S_IMODE(before.st_mode) & 0o111) is executable))
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=opened[-1])
        try:
            need(identity(os.fstat(leaf)) == identity(before))
            digest, saved = _hash_fd(leaf, maximum, deadline)
            need(identity(saved) == identity(before)
                 and identity(os.stat(parts[-1], dir_fd=opened[-1],
                                      follow_symlinks=False)) == identity(before))
        finally:
            os.close(leaf)
        for parent_fd, name, saved_dir in slots:
            deadline.check()
            need(identity(os.stat(name, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(saved_dir))
        need(identity(os.fstat(opened[0])) == identity(os.fstat(root_fd)))
        return {"relative_path": relative, "sha256": digest,
                "bytes": before.st_size, "identity": list(identity(before))}
    finally:
        for fd in reversed(opened):
            os.close(fd)


def _read_link(root_fd: int, relative: str, deadline: Deadline) -> dict:
    parts = tuple(relative.split("/"))
    need(parts and all(part and part not in (".", "..") for part in parts))
    opened = [os.dup(root_fd)]
    slots = []
    try:
        for part in parts[:-1]:
            deadline.check()
            child, saved = _open_directory_at(opened[-1], part)
            slots.append((opened[-1], part, saved))
            opened.append(child)
        before = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISLNK(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_gid == os.getegid())
        target = os.readlink(parts[-1], dir_fd=opened[-1])
        need(target == NPM_LINK_TARGET
             and identity(os.stat(parts[-1], dir_fd=opened[-1],
                                  follow_symlinks=False)) == identity(before))
        for parent_fd, name, saved_dir in slots:
            need(identity(os.stat(name, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(saved_dir))
        return {"relative_path": relative, "target": target,
                "identity": list(identity(before))}
    finally:
        for fd in reversed(opened):
            os.close(fd)


def _write_receipt(parent_fd: int, raw: bytes) -> tuple[int, os.stat_result]:
    need(type(raw) is bytes and 0 < len(raw) <= 65_536)
    fd = os.open(RECEIPT_LEAF, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=parent_fd)
    accepted = False
    try:
        os.fchmod(fd, 0o600)
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            need(written > 0)
            offset += written
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


def extract_evidence(preparation_raw: bytes, policy_raw: bytes, archive_fd: int,
                     private_parent: Path) -> bytes:
    """Extract exact archive and snapshot derived Node/npm bytes without execution."""
    preparation = load_preparation(preparation_raw)
    need(type(policy_raw) is bytes and 0 < len(policy_raw) <= 16_384
         and hashlib.sha256(policy_raw).hexdigest() == POLICY_SHA256)
    policy = preparation.parse_source_policy(policy_raw)
    need(type(policy) is dict and policy["distribution"]["archive_sha256"] == ARCHIVE_SHA256
         and policy["distribution"]["node_version"] == NODE_VERSION
         and policy["distribution"]["npm_version"] == NPM_VERSION)
    deadline = Deadline()
    archive_digest, archive_saved = _hash_fd(
        archive_fd, ARCHIVE_LIMIT, deadline, ARCHIVE_SHA256)
    parent_fd, parent_saved = _open_private_empty(private_parent)
    extraction_fd = distribution_fd = receipt_fd = None
    try:
        os.mkdir(EXTRACTION_LEAF, 0o700, dir_fd=parent_fd)
        parent_created = os.fstat(parent_fd)
        need((parent_created.st_dev, parent_created.st_ino, parent_created.st_uid,
              parent_created.st_gid, parent_created.st_mode) ==
             (parent_saved.st_dev, parent_saved.st_ino, parent_saved.st_uid,
              parent_saved.st_gid, parent_saved.st_mode)
             and parent_created.st_nlink == parent_saved.st_nlink + 1)
        extraction_fd, _ = _open_directory_at(parent_fd, EXTRACTION_LEAF)
        extract_result = preparation.extract_archive(archive_fd, extraction_fd, deadline)
        need(type(extract_result) is dict
             and set(extract_result) == {"schema", "archive_sha256", "members",
                                         "expanded_bytes", "root", "node_version",
                                         "npm_version"}
             and extract_result["schema"] ==
             "compatible-full-app-node-distribution-extract-receipt.v1"
             and extract_result["archive_sha256"] == ARCHIVE_SHA256
             and extract_result["root"] == ARCHIVE_ROOT
             and extract_result["node_version"] == NODE_VERSION
             and extract_result["npm_version"] == NPM_VERSION
             and type(extract_result["members"]) is int
             and 0 < extract_result["members"] <= 65_536
             and type(extract_result["expanded_bytes"]) is int
             and 0 < extract_result["expanded_bytes"] <= 402_653_184)
        with os.scandir(extraction_fd) as entries:
            names = {entry.name for entry in entries}
        need(names == {ARCHIVE_ROOT})
        extraction_saved = os.fstat(extraction_fd)
        need(identity(os.stat(EXTRACTION_LEAF, dir_fd=parent_fd,
                              follow_symlinks=False)) == identity(extraction_saved))
        distribution_fd, distribution_saved = _open_directory_at(
            extraction_fd, ARCHIVE_ROOT)
        node = _read_leaf(distribution_fd, NODE_PATH, FILE_LIMIT, True, deadline)
        npm = _read_leaf(distribution_fd, NPM_PATH, FILE_LIMIT, None, deadline)
        npm_link = _read_link(distribution_fd, NPM_LINK, deadline)
        post_digest, post_archive = _hash_fd(
            archive_fd, ARCHIVE_LIMIT, deadline, ARCHIVE_SHA256)
        need(post_digest == archive_digest and identity(post_archive) == identity(archive_saved)
             and identity(os.fstat(distribution_fd)) == identity(distribution_saved)
             and identity(os.stat(ARCHIVE_ROOT, dir_fd=extraction_fd,
                                  follow_symlinks=False)) == identity(distribution_saved))
        receipt = {
            "schema": "compatible-full-app-node24-extraction-evidence.v1",
            "preparation_sha256": PREPARATION_SHA256,
            "policy_sha256": POLICY_SHA256,
            "archive_sha256": ARCHIVE_SHA256,
            "archive_identity": list(identity(archive_saved)),
            "archive_root": ARCHIVE_ROOT,
            "distribution_root_identity": list(identity(distribution_saved)),
            "node_version": NODE_VERSION,
            "npm_version": NPM_VERSION,
            "members": extract_result["members"],
            "expanded_bytes": extract_result["expanded_bytes"],
            "node": node,
            "npm_cli": npm,
            "npm_link": npm_link,
            "node_executed": False,
            "runtime_admission": False,
        }
        raw = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii")
        receipt_fd, receipt_saved = _write_receipt(parent_fd, raw)
        os.fsync(distribution_fd)
        os.fsync(extraction_fd)
        os.fsync(parent_fd)
        final_archive_digest, final_archive = _hash_fd(
            archive_fd, ARCHIVE_LIMIT, deadline, ARCHIVE_SHA256)
        final_node = _read_leaf(distribution_fd, NODE_PATH, FILE_LIMIT, True, deadline)
        final_npm = _read_leaf(distribution_fd, NPM_PATH, FILE_LIMIT, None, deadline)
        final_link = _read_link(distribution_fd, NPM_LINK, deadline)
        with os.scandir(parent_fd) as entries:
            final_names = {entry.name for entry in entries}
        need(final_names == {EXTRACTION_LEAF, RECEIPT_LEAF}
             and final_archive_digest == archive_digest
             and identity(final_archive) == identity(archive_saved)
             and final_node == node and final_npm == npm and final_link == npm_link
             and anchor(os.fstat(parent_fd)) == anchor(parent_created)
             and anchor(private_parent.lstat()) == anchor(parent_created)
             and identity(os.fstat(archive_fd)) == identity(archive_saved)
             and identity(os.fstat(extraction_fd)) == identity(extraction_saved)
             and identity(os.stat(EXTRACTION_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(extraction_saved)
             and identity(os.fstat(distribution_fd)) == identity(distribution_saved)
             and identity(os.stat(ARCHIVE_ROOT, dir_fd=extraction_fd,
                                  follow_symlinks=False)) == identity(distribution_saved)
             and identity(os.fstat(receipt_fd)) == identity(receipt_saved)
             and identity(os.stat(RECEIPT_LEAF, dir_fd=parent_fd,
                                  follow_symlinks=False)) == identity(receipt_saved)
             and os.pread(receipt_fd, len(raw) + 1, 0) == raw)
        return raw
    finally:
        if receipt_fd is not None:
            os.close(receipt_fd)
        if distribution_fd is not None:
            os.close(distribution_fd)
        if extraction_fd is not None:
            os.close(extraction_fd)
        os.close(parent_fd)


def main() -> int:
    print("compatible-full-app-node24-extraction-evidence FAIL exact_archive_and_route_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
