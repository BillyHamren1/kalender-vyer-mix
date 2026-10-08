"""Source-only bounded custody evidence for a dist in a separate derived build root.

This module does not create the build root, run npm, run a build, assume an SDK,
change modes, delete artifacts, start a server, or grant runtime authority.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import PurePosixPath
import re
import stat
import time


SOURCE_COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
SOURCE_TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
MANIFEST_PROJECTION_SHA256 = "9fac867355f20d6586ffca32227ee8b861f64879cc2619c1427c1b3d97ea8cf8"
IMMUTABLE_SOURCE_SCHEMA = "compatible-full-app-read-only-tree-evidence.v2"
DERIVED_SCHEMA = "compatible-full-app-writable-build-root-evidence.v1"
OUTPUT_SCHEMA = "compatible-full-app-post-build-dist-evidence.v1"
MANIFEST_SCHEMA = "compatible-full-app-post-build-dist-manifest.v1"
STARTED_LEAF = "post-build-dist-evidence.started.json"
MANIFEST_LEAF = "post-build-dist-manifest.json"
RECEIPT_LEAF = "post-build-dist-evidence.json"
SOURCE_FILES = 2_445
SOURCE_BYTES = 20_984_073
SOURCE_DIRECTORIES = 220
MAX_SECONDS = 180
MAX_ENTRIES = 4_096
MAX_DEPTH = 16
MAX_PATH_BYTES = 1_024
MAX_FILE_BYTES = 16_777_216
MAX_TOTAL_BYTES = 67_108_864
MAX_DERIVED_RECEIPT_BYTES = 32_768
MAX_MANIFEST_BYTES = 1_048_576
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")
DERIVED_KEYS = {
    "schema", "source_commit", "source_tree", "app_manifest_sha256",
    "manifest_projection_sha256", "immutable_source_receipt_sha256",
    "immutable_source_root_identity", "immutable_source_identity_sha256",
    "writable_build_root_identity", "writable_build_identity_sha256",
    "source_files", "source_bytes", "source_directories_excluding_root",
    "source_root_purpose", "build_root_purpose", "same_root", "file_mode",
    "directory_mode", "complete_source_join", "sdk_routing", "npm_ci_admitted",
    "app_build_admitted", "post_build_dist_verification", "runtime_admission",
}
SUFFIXES = {
    ".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg",
    ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".txt",
}
LEAF = re.compile(r"^[A-Za-z0-9_@+.,=$()\[\]-]+$")


class DistEvidenceFailure(Exception):
    pass


def require(value: bool) -> None:
    if value is not True:
        raise DistEvidenceFailure("compatible_full_app_post_build_dist_evidence_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, field) for field in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            value.st_mode, value.st_nlink)


def identity_digest(value: tuple[int, ...]) -> str:
    return hashlib.sha256((",".join(str(part) for part in value) + "\n").encode("ascii")).hexdigest()


class Deadline:
    def __init__(self, seconds: float) -> None:
        require(type(seconds) in (int, float) and not isinstance(seconds, bool)
                and math.isfinite(seconds) and 0 < seconds <= MAX_SECONDS)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        require(time.monotonic() < self.end)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        require(type(key) is str and key not in result)
        result[key] = value
    return result


def _constant(_value):
    raise DistEvidenceFailure("compatible_full_app_post_build_dist_evidence_denied")


def parse_json(raw: bytes, maximum: int):
    require(type(raw) is bytes and 0 < len(raw) <= maximum)
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                          parse_constant=_constant)
    except DistEvidenceFailure:
        raise
    except BaseException as error:
        raise DistEvidenceFailure("compatible_full_app_post_build_dist_evidence_denied") from error


def canonical(document: dict) -> bytes:
    return json.dumps(document, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True).encode("ascii")


def parse_derived_receipt(raw: bytes, build_saved: os.stat_result) -> tuple[dict, str]:
    document = parse_json(raw, MAX_DERIVED_RECEIPT_BYTES)
    require(type(document) is dict and set(document) == DERIVED_KEYS
            and canonical(document) == raw
            and document["schema"] == DERIVED_SCHEMA
            and document["source_commit"] == SOURCE_COMMIT
            and document["source_tree"] == SOURCE_TREE
            and document["app_manifest_sha256"] == APP_MANIFEST_SHA256
            and document["manifest_projection_sha256"] == MANIFEST_PROJECTION_SHA256
            and type(document["immutable_source_receipt_sha256"]) is str
            and re.fullmatch(r"[0-9a-f]{64}", document["immutable_source_receipt_sha256"]) is not None
            and type(document["immutable_source_identity_sha256"]) is str
            and re.fullmatch(r"[0-9a-f]{64}", document["immutable_source_identity_sha256"]) is not None
            and type(document["writable_build_identity_sha256"]) is str
            and re.fullmatch(r"[0-9a-f]{64}", document["writable_build_identity_sha256"]) is not None
            and type(document["immutable_source_root_identity"]) is list
            and len(document["immutable_source_root_identity"]) == len(FIELDS)
            and all(type(part) is int for part in document["immutable_source_root_identity"])
            and type(document["writable_build_root_identity"]) is list
            and len(document["writable_build_root_identity"]) == len(FIELDS)
            and all(type(part) is int for part in document["writable_build_root_identity"])
            and document["source_files"] == SOURCE_FILES
            and document["source_bytes"] == SOURCE_BYTES
            and document["source_directories_excluding_root"] == SOURCE_DIRECTORIES
            and document["source_root_purpose"] == "immutable_source_snapshot_only"
            and document["build_root_purpose"] == "derived_writable_build_root"
            and document["same_root"] is False
            and document["file_mode"] == "0600"
            and document["directory_mode"] == "0700"
            and document["complete_source_join"] is True
            and document["sdk_routing"] is False
            and document["npm_ci_admitted"] is False
            and document["app_build_admitted"] is False
            and document["post_build_dist_verification"] is False
            and document["runtime_admission"] is False)
    prior = tuple(document["writable_build_root_identity"])
    current = identity(build_saved)
    # A build legitimately changes a directory's nlink/size/mtime/ctime.  Join
    # only the inode/owner/mode fields that must remain stable; all build
    # execution provenance remains explicitly outside this producer.
    require(prior[:5] == current[:5]
            and stat.S_ISDIR(prior[4]) and stat.S_ISDIR(current[4])
            and prior[2] == os.geteuid() and prior[3] == os.getegid()
            and prior[5] >= 2 and current[5] >= 2
            and current[8] >= prior[8])
    return document, hashlib.sha256(raw).hexdigest()


def read_derived_receipt(fd: int) -> tuple[bytes, os.stat_result]:
    require(type(fd) is int and fd >= 0)
    saved = os.fstat(fd)
    require(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
            and saved.st_gid == os.getegid() and saved.st_nlink == 1
            and stat.S_IMODE(saved.st_mode) & 0o022 == 0
            and 0 < saved.st_size <= MAX_DERIVED_RECEIPT_BYTES)
    result = bytearray()
    while len(result) <= saved.st_size:
        part = os.pread(fd, min(65_536, saved.st_size + 1 - len(result)), len(result))
        if not part:
            break
        result.extend(part)
    require(len(result) == saved.st_size and os.pread(fd, 1, saved.st_size) == b""
            and identity(os.fstat(fd)) == identity(saved))
    return bytes(result), saved


def _same(fd: int, saved: os.stat_result) -> None:
    require(identity(os.fstat(fd)) == identity(saved))


def _same_leaf(fd: int, parent_fd: int, leaf: str, saved: os.stat_result) -> None:
    require(identity(os.fstat(fd)) == identity(saved)
            and identity(os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)) == identity(saved))


def _stream_file(fd: int, saved: os.stat_result, deadline: Deadline) -> str:
    digest = hashlib.sha256()
    offset = 0
    while offset <= saved.st_size:
        deadline.check()
        part = os.pread(fd, min(65_536, saved.st_size + 1 - offset), offset)
        deadline.check()
        if not part:
            break
        digest.update(part)
        offset += len(part)
    require(offset == saved.st_size and os.pread(fd, 1, saved.st_size) == b"")
    return digest.hexdigest()


def _valid_leaf(name: str) -> bool:
    return (type(name) is str and 0 < len(name.encode("utf-8")) <= 255
            and not name.startswith(".") and "/" not in name and "\\" not in name
            and "\0" not in name and LEAF.fullmatch(name) is not None)


def scan_dist(build_fd: int, build_saved: os.stat_result, deadline: Deadline) -> tuple[list[dict], str, tuple[int, ...]]:
    deadline.check()
    _same(build_fd, build_saved)
    at = os.stat("dist", dir_fd=build_fd, follow_symlinks=False)
    require(stat.S_ISDIR(at.st_mode) and at.st_uid == os.geteuid()
            and at.st_gid == os.getegid() and at.st_nlink >= 2
            and stat.S_IMODE(at.st_mode) & 0o022 == 0)
    dist_fd = os.open("dist", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=build_fd)
    try:
        _same_leaf(dist_fd, build_fd, "dist", at)
        rows: list[dict] = []
        entries = 0
        total = 0

        def walk(parent_fd: int, parent_saved: os.stat_result, prefix: str, depth: int) -> None:
            nonlocal entries, total
            deadline.check()
            require(depth <= MAX_DEPTH)
            _same(parent_fd, parent_saved)
            with os.scandir(parent_fd) as children:
                for entry in children:
                    deadline.check()
                    entries += 1
                    name = entry.name
                    require(entries <= MAX_ENTRIES and _valid_leaf(name))
                    relative = name if not prefix else prefix + "/" + name
                    require(len(relative.encode("utf-8")) <= MAX_PATH_BYTES
                            and PurePosixPath(relative).as_posix() == relative)
                    saved = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                    require(saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
                            and stat.S_IMODE(saved.st_mode) & 0o022 == 0)
                    if stat.S_ISDIR(saved.st_mode):
                        child_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                           dir_fd=parent_fd)
                        try:
                            _same_leaf(child_fd, parent_fd, name, saved)
                            rows.append({"path": relative, "kind": "directory",
                                         "mode": format(stat.S_IMODE(saved.st_mode), "04o"),
                                         "identity": list(identity(saved))})
                            walk(child_fd, saved, relative, depth + 1)
                            _same_leaf(child_fd, parent_fd, name, saved)
                        finally:
                            os.close(child_fd)
                    else:
                        suffix = PurePosixPath(name).suffix.lower()
                        require(stat.S_ISREG(saved.st_mode) and saved.st_nlink == 1
                                and stat.S_IMODE(saved.st_mode) & 0o111 == 0
                                and suffix in SUFFIXES and 0 <= saved.st_size <= MAX_FILE_BYTES)
                        total += saved.st_size
                        require(total <= MAX_TOTAL_BYTES)
                        child_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                           dir_fd=parent_fd)
                        try:
                            _same_leaf(child_fd, parent_fd, name, saved)
                            body = _stream_file(child_fd, saved, deadline)
                            _same_leaf(child_fd, parent_fd, name, saved)
                            rows.append({"path": relative, "kind": "file",
                                         "mode": format(stat.S_IMODE(saved.st_mode), "04o"),
                                         "bytes": saved.st_size, "sha256": body,
                                         "identity": list(identity(saved))})
                        finally:
                            os.close(child_fd)
            _same(parent_fd, parent_saved)

        walk(dist_fd, at, "", 0)
        rows.sort(key=lambda row: row["path"])
        paths = {row["path"]: row for row in rows}
        require(entries == len(rows) and entries >= 3
                and paths.get("index.html", {}).get("kind") == "file"
                and paths.get("assets", {}).get("kind") == "directory")
        projection = canonical({"rows": rows})
        require(len(projection) <= MAX_MANIFEST_BYTES)
        _same_leaf(dist_fd, build_fd, "dist", at)
        _same(build_fd, build_saved)
        return rows, hashlib.sha256(projection).hexdigest(), identity(at)
    finally:
        os.close(dist_fd)


def _private_directory(fd: int) -> os.stat_result:
    saved = os.fstat(fd)
    require(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
            and saved.st_gid == os.getegid() and saved.st_nlink >= 2
            and stat.S_IMODE(saved.st_mode) & 0o077 == 0)
    return saved


def persist(fd: int, leaf: str, raw: bytes, parent_saved: os.stat_result) -> str:
    require(type(raw) is bytes and 0 < len(raw) <= MAX_MANIFEST_BYTES)
    out = os.open(leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                  0o600, dir_fd=fd)
    try:
        written = 0
        while written < len(raw):
            count = os.write(out, raw[written:])
            require(count > 0)
            written += count
        os.fsync(out)
        saved = os.fstat(out)
        require(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid()
                and saved.st_gid == os.getegid() and saved.st_nlink == 1
                and stat.S_IMODE(saved.st_mode) == 0o600 and saved.st_size == len(raw))
        read_fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            _same_leaf(read_fd, fd, leaf, saved)
            observed = bytearray()
            while len(observed) <= len(raw):
                part = os.read(read_fd, min(65_536, len(raw) + 1 - len(observed)))
                if not part:
                    break
                observed.extend(part)
            require(bytes(observed) == raw)
            _same_leaf(read_fd, fd, leaf, saved)
        finally:
            os.close(read_fd)
    finally:
        os.close(out)
    os.fsync(fd)
    require(anchor(os.fstat(fd)) == anchor(parent_saved))
    return hashlib.sha256(raw).hexdigest()


def _produce(build_root_fd: int, evidence_dir_fd: int, derived_receipt_fd: int,
             seconds: float = MAX_SECONDS) -> dict:
    require(type(build_root_fd) is int and build_root_fd >= 0
            and type(evidence_dir_fd) is int and evidence_dir_fd >= 0
            and type(derived_receipt_fd) is int and derived_receipt_fd >= 0
            and len({build_root_fd, evidence_dir_fd, derived_receipt_fd}) == 3)
    deadline = Deadline(seconds)
    build_saved = os.fstat(build_root_fd)
    evidence_saved = _private_directory(evidence_dir_fd)
    require(stat.S_ISDIR(build_saved.st_mode) and build_saved.st_uid == os.geteuid()
            and build_saved.st_gid == os.getegid() and build_saved.st_nlink >= 2
            and stat.S_IMODE(build_saved.st_mode) & 0o022 == 0
            and identity(build_saved) != identity(evidence_saved))
    derived_receipt_raw, derived_receipt_saved = read_derived_receipt(derived_receipt_fd)
    derived, derived_sha = parse_derived_receipt(derived_receipt_raw, build_saved)
    started = canonical({
        "schema": "compatible-full-app-post-build-dist-attempt.v1",
        "derived_build_root_receipt_sha256": derived_sha,
        "writable_build_root_identity": list(identity(build_saved)),
        "destructive_cleanup": False,
        "runtime_admission": False,
    })
    started_sha = persist(evidence_dir_fd, STARTED_LEAF, started, evidence_saved)
    deadline.check()
    rows_one, projection_one, dist_identity_one = scan_dist(build_root_fd, build_saved, deadline)
    require(all(tuple(row["identity"]) != identity(derived_receipt_saved)
                for row in rows_one))
    rows_two, projection_two, dist_identity_two = scan_dist(build_root_fd, build_saved, deadline)
    require(rows_one == rows_two and projection_one == projection_two
            and dist_identity_one == dist_identity_two)
    manifest_document = {
        "schema": MANIFEST_SCHEMA,
        "derived_build_root_receipt_sha256": derived_sha,
        "writable_build_root_identity": list(identity(build_saved)),
        "dist_root_identity": list(dist_identity_one),
        "entry_count": len(rows_one),
        "file_count": sum(row["kind"] == "file" for row in rows_one),
        "directory_count": sum(row["kind"] == "directory" for row in rows_one),
        "total_bytes": sum(row.get("bytes", 0) for row in rows_one),
        "projection_sha256": projection_one,
        "rows": rows_one,
    }
    manifest_raw = canonical(manifest_document)
    require(len(manifest_raw) <= MAX_MANIFEST_BYTES)
    manifest_sha = persist(evidence_dir_fd, MANIFEST_LEAF, manifest_raw, evidence_saved)
    rows_three, projection_three, dist_identity_three = scan_dist(build_root_fd, build_saved, deadline)
    require(rows_one == rows_three and projection_one == projection_three
            and dist_identity_one == dist_identity_three)
    receipt = {
        "schema": OUTPUT_SCHEMA,
        "source_commit": SOURCE_COMMIT,
        "source_tree": SOURCE_TREE,
        "derived_build_root_receipt_sha256": derived_sha,
        "immutable_source_receipt_sha256": derived["immutable_source_receipt_sha256"],
        "writable_build_root_identity": list(identity(build_saved)),
        "derived_writable_build_identity_sha256": derived["writable_build_identity_sha256"],
        "writable_build_root_current_identity_sha256": identity_digest(identity(build_saved)),
        "dist_root_identity": list(dist_identity_one),
        "manifest_sha256": manifest_sha,
        "manifest_projection_sha256": projection_one,
        "entry_count": len(rows_one),
        "file_count": manifest_document["file_count"],
        "directory_count": manifest_document["directory_count"],
        "total_bytes": manifest_document["total_bytes"],
        "started_sha256": started_sha,
        "bounded_stable_reread": True,
        "derived_root_same_inode_owner_mode_join": True,
        "build_execution_provenance": False,
        "sdk_routing": False,
        "dist_read_only_transition": False,
        "static_server_admission": False,
        "browser_admission": False,
        "runtime_admission": False,
        "destructive_cleanup": False,
    }
    receipt_raw = canonical(receipt)
    persist(evidence_dir_fd, RECEIPT_LEAF, receipt_raw, evidence_saved)
    deadline.check()
    _same(build_root_fd, build_saved)
    final_derived_raw, final_derived_saved = read_derived_receipt(derived_receipt_fd)
    require(final_derived_raw == derived_receipt_raw
            and identity(final_derived_saved) == identity(derived_receipt_saved))
    require(anchor(os.fstat(evidence_dir_fd)) == anchor(evidence_saved))
    return receipt


def produce(build_root_fd: int, evidence_dir_fd: int, derived_receipt_fd: int,
            seconds: float = MAX_SECONDS) -> dict:
    try:
        return _produce(build_root_fd, evidence_dir_fd, derived_receipt_fd, seconds)
    except DistEvidenceFailure:
        raise
    except OSError as error:
        raise DistEvidenceFailure("compatible_full_app_post_build_dist_evidence_denied") from error


def main() -> int:
    print("post_build_dist_evidence_source_only=true")
    print("post_build_dist_evidence_runtime_admission=false")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
