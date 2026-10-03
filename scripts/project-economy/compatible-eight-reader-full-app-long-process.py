"""Source-only long-process custody for exact full-App install/unit/build purposes.

No CLI route is enabled here. A future root workflow must source-pin an exact
toolchain/trust policy before calling this library. This module never grants
network, provider, browser, database or product authority.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import resource
import stat
import subprocess
import time


OWNED_PROCESS_SHA256 = "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"
SCHEMA = "compatible-full-app-toolchain-policy.v1"
SEQUENCE = ("node-version", "npm-version", "npm-ci", "sdk-unit", "app-build")
SECONDS = {"node-version": 10, "npm-version": 10, "npm-ci": 600, "sdk-unit": 60, "app-build": 300}
CAPS = {"node-version": 65_536, "npm-version": 65_536, "npm-ci": 8_388_608,
        "sdk-unit": 1_048_576, "app-build": 8_388_608}
CLEANUP_RESERVE = 15
SDK = "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs"
BUILD_FLAGS = ("VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED",
               "VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED",
               "VITE_OPERATIONS_SCOPE_INVOICE_CAPTURE_ENABLED")
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")
TOOL_CAPS = {"node": 268_435_456, "npm_cli": 16_777_216, "ca": 16_777_216}


class LongProcessFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise LongProcessFailure("compatible_full_app_long_process_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def exact(value, keys):
    need(type(value) is dict and set(value) == set(keys))
    return value


def lowercase_hash(value) -> str:
    need(type(value) is str and len(value) == 64 and all(c in "0123456789abcdef" for c in value))
    return value


def parse_policy(raw: bytes, expected_sha256: str):
    """Validate caller-reviewed bytes. This does not approve their trust policy."""
    need(type(raw) is bytes and 0 < len(raw) <= 16_384
         and hashlib.sha256(raw).hexdigest() == lowercase_hash(expected_sha256))
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(LongProcessFailure()))
    except (ValueError, UnicodeError):
        raise LongProcessFailure("compatible_full_app_long_process_denied") from None
    exact(value, ("schema", "node", "npm_cli", "npm_trust"))
    need(value["schema"] == SCHEMA)
    node = exact(value["node"], ("sha256", "version"))
    npm = exact(value["npm_cli"], ("sha256", "version"))
    trust = exact(value["npm_trust"], ("registry_origin", "ca_sha256", "proxy_policy",
                                       "redirect_policy", "cache_policy", "evidence_sha256"))
    lowercase_hash(node["sha256"]); lowercase_hash(npm["sha256"])
    lowercase_hash(trust["ca_sha256"]); lowercase_hash(trust["evidence_sha256"])
    need(type(node["version"]) is str
         and __import__("re").fullmatch(r"v22\.[0-9]+\.[0-9]+", node["version"]) is not None)
    need(type(npm["version"]) is str
         and __import__("re").fullmatch(r"[1-9][0-9]*\.[0-9]+\.[0-9]+", npm["version"]) is not None)
    need(type(trust["registry_origin"]) is str
         and __import__("re").fullmatch(r"https://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?/",
                                        trust["registry_origin"]) is not None)
    # These are declarations requiring separate source review, never inferred defaults.
    need(trust["proxy_policy"] in ("caller-reviewed-direct", "caller-reviewed-wrapper")
         and trust["redirect_policy"] in ("caller-reviewed-npm", "caller-reviewed-wrapper")
         and trust["cache_policy"] in ("fresh-private", "reviewed-readonly-plus-private"))
    return value


def private_directory(fd: int) -> os.stat_result:
    need(type(fd) is int and fd >= 0)
    saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid() and saved.st_gid == os.getegid()
         and stat.S_IMODE(saved.st_mode) == 0o700)
    return saved


def open_tool(path: Path, expected_sha256: str, maximum: int, deadline: float) -> tuple[int, os.stat_result]:
    need(type(path) is type(Path()) and path.is_absolute() and path.resolve(strict=True) == path
         and type(maximum) is int and 0 < maximum <= 268_435_456 and time.monotonic() < deadline)
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid() and before.st_nlink == 1
         and not before.st_mode & 0o022 and 0 < before.st_size <= maximum)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd); need(identity(opened) == identity(before))
        digest = hashlib.sha256(); total = 0
        while total <= opened.st_size:
            need(time.monotonic() < deadline)
            part = os.read(fd, min(65_536, opened.st_size + 1 - total))
            if not part: break
            total += len(part); need(total <= maximum); digest.update(part)
        need(total == opened.st_size and digest.hexdigest() == lowercase_hash(expected_sha256)
             and identity(os.fstat(fd)) == identity(opened) and identity(path.lstat()) == identity(opened))
        return fd, opened
    except BaseException:
        os.close(fd); raise


def verify_tool_fd(fd: int, expected_sha256: str, maximum: int, executable: bool,
                   deadline: float) -> os.stat_result:
    """Bind an already captured FD to exact immutable-looking bytes before exec."""
    need(type(fd) is int and fd >= 0 and type(maximum) is int and 0 < maximum <= 268_435_456
         and type(executable) is bool and time.monotonic() < deadline)
    opened = os.fstat(fd)
    need(stat.S_ISREG(opened.st_mode) and opened.st_uid == os.geteuid() and opened.st_nlink == 1
         and not opened.st_mode & 0o022 and 0 < opened.st_size <= maximum
         and (not executable or bool(opened.st_mode & 0o111)))
    digest = hashlib.sha256(); offset = 0
    while offset <= opened.st_size:
        need(time.monotonic() < deadline)
        part = os.pread(fd, min(65_536, opened.st_size + 1 - offset), offset)
        if not part:
            break
        offset += len(part); need(offset <= maximum); digest.update(part)
    need(offset == opened.st_size and digest.hexdigest() == lowercase_hash(expected_sha256)
         and identity(os.fstat(fd)) == identity(opened))
    return opened


def command_for(purpose: str, node_fd: int, npm_fd: int) -> tuple[str, ...]:
    need(purpose in SEQUENCE and type(node_fd) is int and node_fd >= 0 and type(npm_fd) is int and npm_fd >= 0)
    node = "/proc/self/fd/" + str(node_fd); npm = "/proc/self/fd/" + str(npm_fd)
    return {"node-version": (node, "--version"),
            "npm-version": (node, npm, "--version"),
            "npm-ci": (node, npm, "ci"),
            "sdk-unit": (node, SDK),
            "app-build": (node, npm, "run", "build")}[purpose]


def environment_for(purpose: str, state_fd: int, ca_fd: int, policy) -> dict[str, str]:
    need(purpose in SEQUENCE); private_directory(state_fd)
    trust = policy["npm_trust"]
    result = {"PATH": "/usr/bin:/bin", "HOME": "/proc/self/fd/%d/home" % state_fd,
              "CI": "true", "LC_ALL": "C", "LANG": "C",
              "NPM_CONFIG_CACHE": "/proc/self/fd/%d/npm-cache" % state_fd,
              "NPM_CONFIG_REGISTRY": trust["registry_origin"],
              "NPM_CONFIG_CAFILE": "/proc/self/fd/%d" % ca_fd,
              "NPM_CONFIG_STRICT_SSL": "true", "NPM_CONFIG_UPDATE_NOTIFIER": "false"}
    if purpose == "app-build":
        result.update({key: "true" for key in BUILD_FLAGS})
    return result


def _write_once(directory_fd: int, name: str, value: bytes) -> None:
    need(type(value) is bytes and len(value) <= 65_536 and "/" not in name and name not in ("", ".", ".."))
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
    try:
        os.fchmod(fd, 0o600); offset = 0
        while offset < len(value):
            written = os.write(fd, value[offset:]); need(written > 0); offset += written
        os.fsync(fd)
    finally: os.close(fd)


def run_phase(custody, purpose: str, source_fd: int, state_fd: int, journal_fd: int,
              node_fd: int, npm_fd: int, ca_fd: int, policy_raw: bytes,
              policy_sha256: str, serial: int,
              popen=subprocess.Popen):
    """Run one fixed purpose. Native Linux evidence remains mandatory."""
    need(purpose in SEQUENCE and serial == SEQUENCE.index(purpose) + 1
         and not custody.UNCERTAIN_CHILDREN
         and all(row["complete"] for row in custody.REAPING_CHILDREN.values())
         and custody.proc_identity_valid()
         and len({source_fd, state_fd, journal_fd, node_fd, npm_fd, ca_fd}) == 6)
    started = time.monotonic(); execution_end = started + SECONDS[purpose]
    cleanup_end = execution_end + CLEANUP_RESERVE
    policy = parse_policy(policy_raw, policy_sha256)
    source_saved = private_directory(source_fd); private_directory(state_fd); private_directory(journal_fd)
    node_saved = verify_tool_fd(node_fd, policy["node"]["sha256"], TOOL_CAPS["node"], True,
                                execution_end)
    npm_saved = verify_tool_fd(npm_fd, policy["npm_cli"]["sha256"], TOOL_CAPS["npm_cli"], False,
                               execution_end)
    ca_saved = verify_tool_fd(ca_fd, policy["npm_trust"]["ca_sha256"], TOOL_CAPS["ca"], False,
                              execution_end)
    command = command_for(purpose, node_fd, npm_fd); environment = environment_for(purpose, state_fd, ca_fd, policy)
    cap = CAPS[purpose]
    token = "compatible-full-app-long-%d-%s" % (serial, purpose)
    prefix = "long-command-%d-%s" % (serial, purpose)
    journal = Path("/proc/self/fd/%d" % journal_fd)
    paths = [journal / (prefix + suffix) for suffix in (".out", ".err", ".owner.json")]
    handles = []; child = None; saved = None
    try:
        for path in paths:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600); handles.append(os.fdopen(fd, "r+b", buffering=0))
        owner_fd = handles[2].fileno()
        def acquire():
            resource.setrlimit(resource.RLIMIT_FSIZE, (cap, cap))
            acquired = custody.identity(os.getpid())
            packet = json.dumps({"schema": "auth-chain-command-owner.v1", "pid": acquired[0],
                                 "starttime": acquired[1], "pgid": acquired[2], "sid": acquired[3]},
                                separators=(",", ":")).encode("ascii")
            offset = 0
            while offset < len(packet):
                written = os.write(owner_fd, packet[offset:]); need(written > 0); offset += written
            os.fsync(owner_fd); os.close(owner_fd)
        def captured():
            need(time.monotonic() < cleanup_end)
            value = json.loads(os.pread(owner_fd, 4097, 0).decode("ascii"))
            exact(value, ("schema", "pid", "starttime", "pgid", "sid"))
            need(value["schema"] == "auth-chain-command-owner.v1"
                 and all(type(value[k]) is int and value[k] > 0 for k in ("pid", "starttime", "pgid", "sid"))
                 and value["pid"] == child.pid and value["pgid"] == child.pid and value["sid"] == child.pid)
            return (value["pid"], value["starttime"], value["pgid"], value["sid"], "?")
        child = popen(command, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1],
                      cwd="/proc/self/fd/%d" % source_fd, start_new_session=True, preexec_fn=acquire,
                      pass_fds=(source_fd, state_fd, journal_fd, node_fd, npm_fd, ca_fd, owner_fd),
                      close_fds=True, env=environment)
        custody.UNCERTAIN_CHILDREN[token] = (child, paths[2]); saved = captured()
        custody.leader_current(saved, cleanup_end)
        while True:
            status = custody.exited_unreaped(child, saved, cleanup_end)
            if status is not None:
                need(status.si_code == os.CLD_EXITED and status.si_status == 0); break
            need(time.monotonic() < execution_end); time.sleep(.01)
        need(time.monotonic() < execution_end)
        for handle in handles: handle.flush()
        need(all(path.stat().st_size < cap for path in paths)
             and identity(os.fstat(source_fd)) == identity(source_saved)
             and identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(npm_fd)) == identity(npm_saved)
             and identity(os.fstat(ca_fd)) == identity(ca_saved))
        stdout = paths[0].read_bytes(); stderr = paths[1].read_bytes()
        if purpose == "node-version": need(stdout == (policy["node"]["version"] + "\n").encode("ascii"))
        if purpose == "npm-version": need(stdout == (policy["npm_cli"]["version"] + "\n").encode("ascii"))
    finally:
        try:
            if child is not None and saved is None: saved = captured()
            custody.stop_owned(child, saved, cleanup_end)
            if child is not None:
                row = custody.REAPING_CHILDREN.get(id(child))
                need(type(row) is dict and row.get("child") is child and row.get("complete") is True)
                closed = json.dumps({"schema": "auth-chain-command-closed.v1", "pid": saved[0],
                                     "starttime": saved[1], "pgid": saved[2], "sid": saved[3]},
                                    separators=(",", ":")).encode("ascii")
                _write_once(journal_fd, prefix + ".closed.json", closed)
                custody.UNCERTAIN_CHILDREN.pop(token, None)
        finally:
            for handle in handles: handle.close()
    need(time.monotonic() < cleanup_end and not custody.UNCERTAIN_CHILDREN
         and all(row["complete"] for row in custody.REAPING_CHILDREN.values()))
    receipt = {"schema": "compatible-full-app-long-process-receipt.v1", "purpose": purpose,
               "serial": serial, "pid": saved[0], "starttime": saved[1],
               "policy_sha256": policy_sha256, "node_sha256": policy["node"]["sha256"],
               "npm_cli_sha256": policy["npm_cli"]["sha256"],
               "npm_trust_evidence_sha256": policy["npm_trust"]["evidence_sha256"],
               "stdout_bytes": len(stdout), "stdout_sha256": hashlib.sha256(stdout).hexdigest(),
               "stderr_bytes": len(stderr), "stderr_sha256": hashlib.sha256(stderr).hexdigest(),
               "cleanup_complete": True}
    _write_once(journal_fd, prefix + ".receipt.json",
                json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii"))
    return receipt


def main() -> int:
    print("compatible-full-app-long-process FAIL unrouted_policy_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
