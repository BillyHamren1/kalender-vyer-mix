#!/usr/bin/env python3
"""Verify a closed, separate full-App SDK root and emit a non-admitting receipt."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import time
from typing import Mapping


SCHEMA = "compatible-full-app-sdk-root-evidence.v1"
SOURCE_COMMIT = "8e83f41965fd6153b665a12d95791e592c00b16a"
SOURCE_TREE = "15dfbe62f89ecedf3638e22af7e6a3f54c0dba4d"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
ROOT_LEAF = "compatible-full-app-sdk-root"
RECEIPT_LEAF = "compatible-full-app-sdk-root-evidence.json"
NODE_VERSION = "v24.21.0"
SDK_PACKAGE_SHA256 = "540f52028b7f0adad9cb62853f1f396668cd6fee260995b75a09b4750f2d3e09"
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_RECEIPT_BYTES = 16 * 1024
DEFAULT_SECONDS = 30.0

FILES = {
    "scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts": {
        "sha256": "b6bde1facf9ed7c886f715069924e2c049808d2da9e16b72a35debb46013e764",
        "bytes": 7394,
    },
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs": {
        "sha256": "67725d5ecb583a44969a660b7a803de58d268ba14623489d8111f7aeafb1772a",
        "bytes": 8991,
    },
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-source.mjs": {
        "sha256": "51b68fc0b98ce5d54943d627fc2ee5bc3668f7cb471625ebe7ed97b2ea2b7292",
        "bytes": 6822,
    },
}


class CustodyDenied(RuntimeError):
    pass


class Deadline:
    def __init__(self, end: float):
        self.end = end

    @classmethod
    def after(cls, seconds: float) -> "Deadline":
        if not isinstance(seconds, (int, float)) or seconds <= 0 or seconds > DEFAULT_SECONDS:
            raise CustodyDenied("deadline")
        return cls(time.monotonic() + float(seconds))

    def check(self) -> None:
        if time.monotonic() > self.end:
            raise CustodyDenied("deadline")


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")


def identity(st: os.stat_result) -> list[int]:
    return [
        st.st_dev,
        st.st_ino,
        st.st_mode,
        st.st_uid,
        st.st_gid,
        st.st_size,
        st.st_nlink,
        st.st_mtime_ns,
        st.st_ctime_ns,
    ]


def same(a: os.stat_result, b: os.stat_result) -> bool:
    return identity(a) == identity(b)


def require_dir(st: os.stat_result, mode: int) -> None:
    if not stat.S_ISDIR(st.st_mode) or stat.S_IMODE(st.st_mode) != mode:
        raise CustodyDenied("directory")
    if st.st_uid != os.geteuid() or st.st_gid != os.getegid() or st.st_nlink < 2:
        raise CustodyDenied("directory")


def require_file(st: os.stat_result, expected_bytes: int) -> None:
    if not stat.S_ISREG(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o400:
        raise CustodyDenied("file")
    if st.st_uid != os.geteuid() or st.st_gid != os.getegid() or st.st_nlink != 1:
        raise CustodyDenied("file")
    if st.st_size != expected_bytes or st.st_size > MAX_FILE_BYTES:
        raise CustodyDenied("file")


def names(fd: int, expected: set[str], deadline: Deadline) -> None:
    observed: set[str] = set()
    with os.scandir(fd) as entries:
        for entry in entries:
            deadline.check()
            if len(observed) >= len(expected):
                raise CustodyDenied("layout")
            name = entry.name
            if name in observed or name not in expected or name in {".", ".."}:
                raise CustodyDenied("layout")
            observed.add(name)
    if observed != expected:
        raise CustodyDenied("layout")


def open_dir(parent_fd: int, leaf: str) -> int:
    return os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)


def hash_fd(fd: int, expected_bytes: int, deadline: Deadline) -> str:
    digest = hashlib.sha256()
    offset = 0
    while offset < expected_bytes:
        deadline.check()
        chunk = os.pread(fd, min(65536, expected_bytes - offset), offset)
        if not chunk:
            raise CustodyDenied("short read")
        digest.update(chunk)
        offset += len(chunk)
    if os.pread(fd, 1, offset):
        raise CustodyDenied("long read")
    return digest.hexdigest()


def package_sha(rows: list[dict[str, object]]) -> str:
    projection = [{"path": row["path"], "sha256": row["sha256"], "bytes": row["bytes"]} for row in rows]
    return hashlib.sha256(canonical(projection)).hexdigest()


def verify_sdk_root(
    parent_fd: int,
    root_fd: int,
    file_fds: Mapping[str, int],
    *,
    seconds: float = DEFAULT_SECONDS,
) -> dict[str, object]:
    deadline = Deadline.after(seconds)
    if set(file_fds) != set(FILES):
        raise CustodyDenied("file fd set")

    parent_before = os.fstat(parent_fd)
    root_before = os.fstat(root_fd)
    require_dir(parent_before, 0o700)
    require_dir(root_before, 0o500)
    root_path_before = os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    if not same(root_before, root_path_before):
        raise CustodyDenied("root binding")

    names(parent_fd, {ROOT_LEAF}, deadline)
    names(root_fd, {"scripts"}, deadline)
    scripts_fd = open_dir(root_fd, "scripts")
    project_fd = -1
    held_files: dict[str, int] = {}
    receipt_fd = -1
    result_receipt_fd = -1
    receipt_saved: os.stat_result | None = None
    try:
        scripts_before = os.fstat(scripts_fd)
        require_dir(scripts_before, 0o500)
        if not same(scripts_before, os.stat("scripts", dir_fd=root_fd, follow_symlinks=False)):
            raise CustodyDenied("directory binding")
        names(scripts_fd, {"project-economy"}, deadline)
        project_fd = open_dir(scripts_fd, "project-economy")
        project_before = os.fstat(project_fd)
        require_dir(project_before, 0o500)
        if not same(project_before, os.stat("project-economy", dir_fd=scripts_fd, follow_symlinks=False)):
            raise CustodyDenied("directory binding")
        expected_leaves = {path.rsplit("/", 1)[1] for path in FILES}
        names(project_fd, expected_leaves, deadline)

        rows: list[dict[str, object]] = []
        file_saved: dict[str, os.stat_result] = {}
        for path in sorted(FILES):
            deadline.check()
            leaf = path.rsplit("/", 1)[1]
            spec = FILES[path]
            held = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=project_fd)
            held_files[path] = held
            held_st = os.fstat(held)
            supplied_st = os.fstat(file_fds[path])
            path_st = os.stat(leaf, dir_fd=project_fd, follow_symlinks=False)
            require_file(held_st, int(spec["bytes"]))
            if not same(held_st, supplied_st) or not same(held_st, path_st):
                raise CustodyDenied("file binding")
            actual_sha = hash_fd(held, int(spec["bytes"]), deadline)
            if actual_sha != spec["sha256"]:
                raise CustodyDenied("file hash")
            file_saved[path] = held_st
            rows.append({
                "path": path,
                "sha256": actual_sha,
                "bytes": int(spec["bytes"]),
                "identity": identity(held_st),
            })

        receipt: dict[str, object] = {
            "schema": SCHEMA,
            "source_commit": SOURCE_COMMIT,
            "source_tree": SOURCE_TREE,
            "exact_app_manifest_sha256": APP_MANIFEST_SHA256,
            "node_version": NODE_VERSION,
            "sdk_root_leaf": ROOT_LEAF,
            "sdk_root_identity": identity(root_before),
            "sdk_package_sha256": package_sha(rows),
            "files": rows,
            "placement_to_writable_build_root": False,
            "sdk_unit_admitted": False,
            "npm_install_admitted": False,
            "app_build_admitted": False,
            "runtime_admission": False,
        }
        raw = canonical(receipt)
        if receipt["sdk_package_sha256"] != SDK_PACKAGE_SHA256:
            raise CustodyDenied("package hash")
        if len(raw) > MAX_RECEIPT_BYTES:
            raise CustodyDenied("receipt size")
        receipt_fd = os.open(
            RECEIPT_LEAF,
            os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
            dir_fd=parent_fd,
        )
        offset = 0
        while offset < len(raw):
            deadline.check()
            wrote = os.write(receipt_fd, raw[offset:])
            if wrote <= 0:
                raise CustodyDenied("receipt write")
            offset += wrote
        os.fsync(receipt_fd)
        receipt_saved = os.fstat(receipt_fd)
        if not stat.S_ISREG(receipt_saved.st_mode) or stat.S_IMODE(receipt_saved.st_mode) != 0o600:
            raise CustodyDenied("receipt")
        if receipt_saved.st_uid != os.geteuid() or receipt_saved.st_gid != os.getegid() or receipt_saved.st_nlink != 1:
            raise CustodyDenied("receipt")
        if receipt_saved.st_size != len(raw):
            raise CustodyDenied("receipt")
        os.fsync(parent_fd)

        deadline.check()
        names(parent_fd, {ROOT_LEAF, RECEIPT_LEAF}, deadline)
        if not same(root_before, os.fstat(root_fd)) or not same(root_before, os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)):
            raise CustodyDenied("root changed")
        if not same(scripts_before, os.fstat(scripts_fd)):
            raise CustodyDenied("directory changed")
        if not same(scripts_before, os.stat("scripts", dir_fd=root_fd, follow_symlinks=False)):
            raise CustodyDenied("directory changed")
        if not same(project_before, os.fstat(project_fd)):
            raise CustodyDenied("directory changed")
        if not same(project_before, os.stat("project-economy", dir_fd=scripts_fd, follow_symlinks=False)):
            raise CustodyDenied("directory changed")
        for path, saved in file_saved.items():
            leaf = path.rsplit("/", 1)[1]
            if not same(saved, os.fstat(held_files[path])):
                raise CustodyDenied("file changed")
            if not same(saved, os.fstat(file_fds[path])):
                raise CustodyDenied("file changed")
            if not same(saved, os.stat(leaf, dir_fd=project_fd, follow_symlinks=False)):
                raise CustodyDenied("file changed")
        receipt_path = os.stat(RECEIPT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        if not same(receipt_saved, os.fstat(receipt_fd)) or not same(receipt_saved, receipt_path):
            raise CustodyDenied("receipt changed")
        if hash_fd(receipt_fd, len(raw), deadline) != hashlib.sha256(raw).hexdigest():
            raise CustodyDenied("receipt changed")
        parent_after = os.fstat(parent_fd)
        require_dir(parent_after, 0o700)
        result_receipt_fd = os.dup(receipt_fd)
        os.set_inheritable(result_receipt_fd, False)
        return {
            "receipt": receipt,
            "receipt_bytes": raw,
            "receipt_identity": identity(receipt_saved),
            "receipt_fd": result_receipt_fd,
        }
    except BaseException:
        if result_receipt_fd >= 0:
            os.close(result_receipt_fd)
        raise
    finally:
        if receipt_fd >= 0:
            os.close(receipt_fd)
        for fd in held_files.values():
            os.close(fd)
        if project_fd >= 0:
            os.close(project_fd)
        os.close(scripts_fd)


def main() -> int:
    print("compatible-full-app-sdk-root-custody HOLD source-only fd-caller-required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
