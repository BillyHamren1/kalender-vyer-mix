"""NEW exact809f Git archive acquisition; no build, provider or App admission."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import resource
import stat
import subprocess
import sys
import time


COMMIT = "809f64e0fd98322c53d9c4e9697df5b515303812"
TREE = "3d96301591652f9d86ccbbdf8ff26efcb7180ce9"
MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
PATHS_SHA256 = "371cdd68e6bc51ac3ccb271e4614c9fa0b495333f48904f26c8aed932c77fab4"
OWNED_PROCESS_SHA256 = "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"
PREFIX = "compatible-app-809f/"
ARCHIVE_NAME = "primary-source.tar"
ARCHIVE_LIMIT = 33_554_432
SOURCE_FILES = 2_445
SOURCE_BYTES = 20_984_073
GIT = "/usr/bin/git"
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_nlink", "st_mode", "st_size", "st_mtime_ns", "st_ctime_ns")


class AcquisitionFailure(Exception):
    pass


def require(value: bool) -> None:
    if value is not True:
        raise AcquisitionFailure("compatible_full_app_source_acquisition_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid, value.st_mode)


class Deadline:
    def __init__(self, seconds: float = 60) -> None:
        require(type(seconds) in (int, float) and math.isfinite(seconds) and 0 < seconds <= 60)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        require(time.monotonic() < self.end)


def private_directory(path: Path, *, empty: bool) -> tuple[int, os.stat_result]:
    require(type(path) is type(Path()) and path.is_absolute() and path.resolve() == path)
    before = path.lstat()
    require(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid() and before.st_gid == os.getegid()
            and stat.S_IMODE(before.st_mode) == 0o700)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        require(identity(os.fstat(fd)) == identity(before))
        if empty:
            with os.scandir(fd) as entries:
                require(next(entries, None) is None)
        require(identity(path.lstat()) == identity(before))
        return fd, before
    except BaseException:
        os.close(fd)
        raise


def stable_regular(root: int, relative: str, maximum: int, deadline: Deadline) -> bytes:
    require(type(relative) is str and 0 < len(relative) <= 512 and relative[0] != "/" and "\\" not in relative)
    parts = relative.split("/")
    require(all(part not in ("", ".", "..") for part in parts))
    opened = [os.dup(root)]
    slots: list[tuple[int, str, os.stat_result, int]] = []
    try:
        for part in parts[:-1]:
            deadline.check()
            before = os.stat(part, dir_fd=opened[-1], follow_symlinks=False)
            require(stat.S_ISDIR(before.st_mode))
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=opened[-1])
            opened.append(child)
            require(identity(os.fstat(child)) == identity(before))
            slots.append((opened[-2], part, before, child))
        deadline.check()
        before = os.stat(parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid() and before.st_nlink == 1
                and 0 <= before.st_size <= maximum)
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=opened[-1])
        opened.append(leaf)
        require(identity(os.fstat(leaf)) == identity(before))
        for parent, part, saved, child in slots:
            require(identity(os.fstat(child)) == identity(saved)
                    and identity(os.stat(part, dir_fd=parent, follow_symlinks=False)) == identity(saved))
        require(identity(os.stat(parts[-1], dir_fd=opened[-2], follow_symlinks=False)) == identity(before))
        pieces: list[bytes] = []
        count = 0
        while count <= before.st_size:
            deadline.check()
            data = os.read(leaf, min(65_536, before.st_size + 1 - count))
            deadline.check()
            if not data:
                break
            pieces.append(data)
            count += len(data)
        require(count == before.st_size and identity(os.fstat(leaf)) == identity(before)
                and identity(os.stat(parts[-1], dir_fd=opened[-2], follow_symlinks=False)) == identity(before))
        for parent, part, saved, child in slots:
            require(identity(os.fstat(child)) == identity(saved)
                    and identity(os.stat(part, dir_fd=parent, follow_symlinks=False)) == identity(saved))
        deadline.check()
        return b"".join(pieces)
    finally:
        for fd in reversed(opened):
            os.close(fd)


def manifest_paths(raw: bytes) -> tuple[str, ...]:
    require(type(raw) is bytes and hashlib.sha256(raw).hexdigest() == MANIFEST_SHA256)
    document = json.loads(raw)
    require(type(document) is dict and document.get("source_commit") == COMMIT
            and document.get("source_tree") == TREE and document.get("tree_truncated") is False
            and document.get("runtime_admission") is False)
    rows = document.get("files")
    require(type(rows) is list and len(rows) == SOURCE_FILES)
    paths: list[str] = []
    seen: set[str] = set()
    total = 0
    for row in rows:
        require(type(row) is dict and type(row.get("path")) is str and type(row.get("bytes")) is int
                and type(row.get("git_blob_sha1")) is str)
        path = row["path"]
        require(0 < len(path) <= 512 and not path.startswith("/") and "\\" not in path and "\0" not in path
                and all(part not in ("", ".", "..") for part in path.split("/"))
                and path not in seen and 0 <= row["bytes"] <= 1_048_576
                and len(row["git_blob_sha1"]) == 40
                and all(c in "0123456789abcdef" for c in row["git_blob_sha1"]))
        seen.add(path)
        paths.append(path)
        total += row["bytes"]
        require(total <= SOURCE_BYTES)
    require(total == SOURCE_BYTES and len(paths) == SOURCE_FILES)
    return tuple(paths)


def archive_command(archive_fd: int, paths: tuple[str, ...]) -> tuple[str, ...]:
    require(type(archive_fd) is int and archive_fd >= 0 and type(paths) is tuple and len(paths) == SOURCE_FILES)
    require(len(set(paths)) == SOURCE_FILES
            and hashlib.sha256(b"\0".join(path.encode("utf-8") for path in paths)).hexdigest() == PATHS_SHA256)
    return (GIT, "--no-replace-objects", "--literal-pathspecs", "-c", "tar.umask=0022",
            "archive", "--format=tar", "--prefix=" + PREFIX,
            "--output=/proc/self/fd/" + str(archive_fd), COMMIT, "--", *paths)


def probe_command(kind: str) -> tuple[str, ...]:
    if kind == "head":
        return (GIT, "--no-replace-objects", "rev-parse", "--verify", "HEAD")
    if kind == "tree":
        return (GIT, "--no-replace-objects", "rev-parse", "--verify", "HEAD^{tree}")
    if kind == "clean":
        return (GIT, "--no-replace-objects", "status", "--porcelain=v1", "--untracked-files=no")
    raise AcquisitionFailure("compatible_full_app_source_acquisition_denied")


def _closed_record(journal: Path, custody, child, saved: tuple[int, ...], serial: int) -> None:
    packet = json.dumps({"schema": "compatible-full-app-command-closed.v1", "serial": serial,
                         "pid": saved[0], "starttime": saved[1], "pgid": saved[2], "sid": saved[3]},
                        separators=(",", ":")).encode("ascii")
    path = journal / ("source-command-" + str(serial) + ".closed.json")
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        cursor = 0
        while cursor < len(packet):
            size = os.write(fd, packet[cursor:])
            require(size > 0)
            cursor += size
        os.fsync(fd)
    finally:
        os.close(fd)


def run_bound(custody, argv: tuple[str, ...], source_fd: int, journal_fd: int, serial: int,
              deadline: Deadline, extra_fds: tuple[int, ...] = ()) -> bytes:
    """Run one already-built Git command under frozen b901 WNOWAIT custody."""
    require(type(argv) is tuple and argv and argv[0] == GIT and type(serial) is int and serial >= 0)
    require(type(source_fd) is int and source_fd >= 0 and type(journal_fd) is int and journal_fd >= 0)
    require(type(extra_fds) is tuple and all(type(fd) is int and fd >= 0 for fd in extra_fds))
    require((not extra_fds and serial in (1, 5) and argv == probe_command("head"))
            or (not extra_fds and serial in (2, 6) and argv == probe_command("tree"))
            or (not extra_fds and serial in (3, 7) and argv == probe_command("clean"))
            or (serial == 4 and len(extra_fds) == 1
                and argv == archive_command(extra_fds[0], tuple(argv[11:]))))
    require(not custody.UNCERTAIN_CHILDREN and all(record["complete"] for record in custody.REAPING_CHILDREN.values())
            and custody.proc_identity_valid())
    deadline.check()
    journal = Path("/proc/self/fd/" + str(journal_fd))
    out_path = journal / ("source-command-" + str(serial) + ".out")
    err_path = journal / ("source-command-" + str(serial) + ".err")
    owner_path = journal / ("source-command-" + str(serial) + ".owner.json")
    handles = []
    child = None
    saved = None
    token = "compatible-full-app-source-" + str(serial)
    owner_fd = None
    try:
        for path in (out_path, err_path, owner_path):
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600)
            handles.append(os.fdopen(fd, "r+b", buffering=0))
        owner_fd = handles[2].fileno()

        def acquire() -> None:
            resource.setrlimit(resource.RLIMIT_FSIZE, (ARCHIVE_LIMIT, ARCHIVE_LIMIT))
            exact = custody.identity(os.getpid())
            packet = json.dumps({"schema": "auth-chain-command-owner.v1", "pid": exact[0],
                                 "starttime": exact[1], "pgid": exact[2], "sid": exact[3]},
                                separators=(",", ":")).encode("ascii")
            cursor = 0
            while cursor < len(packet):
                size = os.write(owner_fd, packet[cursor:])
                require(size > 0)
                cursor += size
            os.fsync(owner_fd)
            os.close(owner_fd)

        def captured() -> tuple[int, ...]:
            deadline.check()
            value = json.loads(os.pread(owner_fd, 4_097, 0).decode("ascii"))
            require(type(value) is dict and set(value) == {"schema", "pid", "starttime", "pgid", "sid"}
                    and value["schema"] == "auth-chain-command-owner.v1")
            require(all(type(value[key]) is int and value[key] > 0 for key in ("pid", "starttime", "pgid", "sid"))
                    and value["pid"] == child.pid and value["pgid"] == child.pid and value["sid"] == child.pid)
            return (value["pid"], value["starttime"], value["pgid"], value["sid"], "?")

        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1],
                                 cwd="/proc/self/fd/" + str(source_fd), start_new_session=True,
                                 preexec_fn=acquire, pass_fds=(source_fd, owner_fd, *extra_fds),
                                 close_fds=True, env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"})
        custody.UNCERTAIN_CHILDREN[token] = (child, owner_path)
        saved = captured()
        custody.leader_current(saved, deadline.end)
        while True:
            exited = custody.exited_unreaped(child, saved, deadline.end)
            if exited is not None:
                require(exited.si_code == os.CLD_EXITED and exited.si_status == 0)
                break
            deadline.check()
            time.sleep(0.005)
        for handle in handles:
            handle.flush()
        require(out_path.stat().st_size < 65_536 and err_path.stat().st_size < 65_536)
        require(err_path.read_bytes() == b"")
        output = out_path.read_bytes()
        deadline.check()
    finally:
        try:
            if child is not None and saved is None:
                saved = captured()
            custody.stop_owned(child, saved, deadline.end)
            if child is not None:
                _closed_record(journal, custody, child, saved, serial)
                custody.UNCERTAIN_CHILDREN.pop(token, None)
        finally:
            for handle in handles:
                handle.close()
    deadline.check()
    return output


def load_custody(repo_fd: int, deadline: Deadline):
    raw = stable_regular(repo_fd, "scripts/project-economy/auth-chain-cleanup-owned-process.py", 65_536, deadline)
    require(hashlib.sha256(raw).hexdigest() == OWNED_PROCESS_SHA256)
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader("frozen_owned_process", loader=None))
    exec(compile(raw, "<frozen_owned_process>", "exec"), module.__dict__)
    return module


def acquire(source_root: Path, archive_parent: Path, journal: Path, custody=None, runner=run_bound) -> None:
    deadline = Deadline(60)
    repo = Path(__file__).absolute().parents[2]
    require(repo.resolve() == repo and source_root != repo and archive_parent != journal and archive_parent != source_root)
    repo_before = repo.lstat()
    require(stat.S_ISDIR(repo_before.st_mode))
    repo_fd = os.open(repo, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    source_fd = archive_fd = archive_parent_fd = journal_fd = None
    try:
        require(identity(os.fstat(repo_fd)) == identity(repo_before))
        manifest = stable_regular(repo_fd, "scripts/project-economy/compatible-eight-reader-full-app-compilemanifest.json", 524_288, deadline)
        paths = manifest_paths(manifest)
        if custody is None:
            custody = load_custody(repo_fd, deadline)
        source_before = source_root.lstat()
        require(stat.S_ISDIR(source_before.st_mode) and source_root.is_absolute() and source_root.resolve() == source_root)
        source_fd = os.open(source_root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        require(identity(os.fstat(source_fd)) == identity(source_before))
        archive_parent_fd, archive_parent_before = private_directory(archive_parent, empty=True)
        journal_fd, journal_before = private_directory(journal, empty=True)
        archive_fd = os.open(ARCHIVE_NAME, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=archive_parent_fd)
        os.fchmod(archive_fd, 0o600)
        created = os.fstat(archive_fd)
        require(stat.S_ISREG(created.st_mode) and stat.S_IMODE(created.st_mode) == 0o600
                and created.st_uid == os.geteuid() and created.st_gid == os.getegid()
                and created.st_nlink == 1 and created.st_size == 0)
        archive_path_before = os.stat(ARCHIVE_NAME, dir_fd=archive_parent_fd, follow_symlinks=False)
        require(identity(created) == identity(archive_path_before))

        head = runner(custody, probe_command("head"), source_fd, journal_fd, 1, deadline).decode("ascii").strip()
        tree = runner(custody, probe_command("tree"), source_fd, journal_fd, 2, deadline).decode("ascii").strip()
        clean = runner(custody, probe_command("clean"), source_fd, journal_fd, 3, deadline)
        require(head == COMMIT and tree == TREE and clean == b"")
        require(runner(custody, archive_command(archive_fd, paths), source_fd, journal_fd, 4,
                       deadline, (archive_fd,)) == b"")
        os.fsync(archive_fd)
        head_after = runner(custody, probe_command("head"), source_fd, journal_fd, 5, deadline).decode("ascii").strip()
        tree_after = runner(custody, probe_command("tree"), source_fd, journal_fd, 6, deadline).decode("ascii").strip()
        clean_after = runner(custody, probe_command("clean"), source_fd, journal_fd, 7, deadline)
        final = os.fstat(archive_fd)
        at_path = os.stat(ARCHIVE_NAME, dir_fd=archive_parent_fd, follow_symlinks=False)
        require(stat.S_ISREG(final.st_mode) and stat.S_IMODE(final.st_mode) == 0o600 and final.st_nlink == 1
                and 0 < final.st_size <= ARCHIVE_LIMIT and identity(final) == identity(at_path)
                and anchor(os.fstat(archive_parent_fd)) == anchor(archive_parent_before)
                and anchor(archive_parent.lstat()) == anchor(archive_parent_before)
                and identity(os.fstat(source_fd)) == identity(source_before)
                and identity(source_root.lstat()) == identity(source_before)
                and anchor(os.fstat(journal_fd)) == anchor(journal_before)
                and anchor(journal.lstat()) == anchor(journal_before)
                and head_after == COMMIT and tree_after == TREE and clean_after == b""
                and identity(os.fstat(repo_fd)) == identity(repo_before)
                and identity(repo.lstat()) == identity(repo_before))
        require(set(os.listdir(archive_parent)) == {ARCHIVE_NAME})
        expected_journal = {"source-command-" + str(serial) + suffix
                            for serial in range(1, 8)
                            for suffix in (".out", ".err", ".owner.json", ".closed.json")}
        require(set(os.listdir(journal_fd)) == expected_journal)
        for name in expected_journal:
            info = os.stat(name, dir_fd=journal_fd, follow_symlinks=False)
            require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600
                    and info.st_uid == os.geteuid() and info.st_gid == os.getegid() and info.st_nlink == 1
                    and 0 <= info.st_size < 65_536)
        deadline.check()
    finally:
        for fd in (archive_fd, journal_fd, archive_parent_fd, source_fd, repo_fd):
            if fd is not None:
                os.close(fd)


def main() -> int:
    try:
        require(os.environ.get("CI") == "true" and len(sys.argv) == 4)
        acquire(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
        print("compatible-full-app-source-acquisition PASS commit=809f64e source_files=2445 source_bytes=20984073 native_app=false")
        return 0
    except BaseException:
        print("compatible-full-app-source-acquisition FAIL fixed_refusal")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
