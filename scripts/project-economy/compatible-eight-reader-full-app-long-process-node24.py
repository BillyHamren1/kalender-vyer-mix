"""Additive exact-Node24 successor around the frozen reviewed long-process adapter.

The published v1 adapter is never edited.  A future controller must capture its
exact bytes, the distribution directory FD, tool FDs, CA FD and policy bytes.
This module remains unrouted and grants no download/install/build authority.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import PurePosixPath
import stat


BASE_ADAPTER_SHA256 = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"
BASE_ADAPTER_LIMIT = 65_536
SCHEMA = "compatible-full-app-toolchain-policy.v2-node24"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
PREPARATION_POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
ROOT = "node-v24.21.0-linux-x64"
NODE_RELATIVE = ROOT + "/bin/node"
NPM_RELATIVE = ROOT + "/lib/node_modules/npm/bin/npm-cli.js"
NPM_LINK_RELATIVE = ROOT + "/bin/npm"
NPM_LINK_TARGET = "../lib/node_modules/npm/bin/npm-cli.js"
ORIGIN_GUARD_SHA256 = "767145176eb49355611612f883b85a60babe8bff11cd41e69b4ffca33589369a"
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")


class Node24Failure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise Node24Failure("compatible_full_app_node24_adapter_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def lowercase_hash(value: str) -> str:
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


def parse_policy(raw: bytes, expected_sha256: str):
    need(type(raw) is bytes and 0 < len(raw) <= 16_384
         and hashlib.sha256(raw).hexdigest() == lowercase_hash(expected_sha256))
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(Node24Failure()))
    except (ValueError, UnicodeError):
        raise Node24Failure("compatible_full_app_node24_adapter_denied") from None
    exact(value, ("schema", "distribution", "node", "npm_cli", "npm_trust"))
    distribution = exact(value["distribution"],
                         ("archive_sha256", "preparation_policy_sha256", "root"))
    node = exact(value["node"], ("sha256", "version"))
    npm = exact(value["npm_cli"], ("sha256", "version"))
    trust = exact(value["npm_trust"],
                  ("registry_origin", "ca_sha256", "proxy_policy", "redirect_policy",
                   "cache_policy", "evidence_sha256"))
    need(value["schema"] == SCHEMA
         and distribution == {"archive_sha256": ARCHIVE_SHA256,
                              "preparation_policy_sha256": PREPARATION_POLICY_SHA256,
                              "root": ROOT}
         and node["version"] == NODE_VERSION and npm["version"] == NPM_VERSION
         and trust["registry_origin"] == "https://registry.npmjs.org/"
         and trust["proxy_policy"] == "direct-no-ambient"
         and trust["redirect_policy"] == "deny-cross-origin-and-downgrade-wrapper"
         and trust["cache_policy"] == "fresh-private-empty")
    for field in (node["sha256"], npm["sha256"], trust["ca_sha256"], trust["evidence_sha256"]):
        lowercase_hash(field)
    return value


def load_base_adapter(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= BASE_ADAPTER_LIMIT
         and hashlib.sha256(raw).hexdigest() == BASE_ADAPTER_SHA256)
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(
        "captured_compatible_full_app_long_process", loader=None))
    exec(compile(raw, "<captured-compatible-full-app-long-process>", "exec"), module.__dict__)
    need(module.OWNED_PROCESS_SHA256 ==
         "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"
         and module.SCHEMA == "compatible-full-app-toolchain-policy.v1"
         and callable(module.run_phase) and callable(module.main))
    return module


def _open_relative(root_fd: int, relative: str) -> tuple[int, os.stat_result]:
    path = PurePosixPath(relative)
    need(not path.is_absolute() and path.parts and all(part not in ("", ".", "..") for part in path.parts))
    opened = [os.dup(root_fd)]
    try:
        for part in path.parts[:-1]:
            before = os.stat(part, dir_fd=opened[-1], follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
                 and not before.st_mode & 0o022)
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=opened[-1])
            need(identity(os.fstat(child)) == identity(before))
            opened.append(child)
        before = os.stat(path.parts[-1], dir_fd=opened[-1], follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
             and before.st_nlink == 1 and not before.st_mode & 0o022)
        leaf = os.open(path.parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=opened[-1])
        need(identity(os.fstat(leaf)) == identity(before))
        return leaf, before
    finally:
        for fd in reversed(opened): os.close(fd)


def bind_distribution(distribution_fd: int, node_fd: int, npm_fd: int):
    root = os.fstat(distribution_fd)
    need(stat.S_ISDIR(root.st_mode) and root.st_uid == os.geteuid()
         and stat.S_IMODE(root.st_mode) in (0o500, 0o700))
    node_open = npm_open = None
    try:
        node_open, node_saved = _open_relative(distribution_fd, NODE_RELATIVE)
        npm_open, npm_saved = _open_relative(distribution_fd, NPM_RELATIVE)
        need(identity(os.fstat(node_fd)) == identity(node_saved)
             and identity(os.fstat(npm_fd)) == identity(npm_saved))
        link_parts = PurePosixPath(NPM_LINK_RELATIVE).parts
        link_parent = os.dup(distribution_fd)
        try:
            for part in link_parts[:-1]:
                before = os.stat(part, dir_fd=link_parent, follow_symlinks=False)
                need(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
                     and not before.st_mode & 0o022)
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=link_parent)
                need(identity(os.fstat(child)) == identity(before))
                os.close(link_parent); link_parent = child
            link = os.stat(link_parts[-1], dir_fd=link_parent, follow_symlinks=False)
            need(stat.S_ISLNK(link.st_mode)
                 and os.readlink(link_parts[-1], dir_fd=link_parent) == NPM_LINK_TARGET)
        finally:
            os.close(link_parent)
        return root, node_saved, npm_saved
    finally:
        if npm_open is not None: os.close(npm_open)
        if node_open is not None: os.close(node_open)


def verify_guard_fd(fd: int) -> os.stat_result:
    saved = os.fstat(fd)
    need(stat.S_ISREG(saved.st_mode) and saved.st_uid == os.geteuid() and saved.st_nlink == 1
         and not saved.st_mode & 0o022 and 0 < saved.st_size <= 16_384)
    digest = hashlib.sha256(); offset = 0
    while offset <= saved.st_size:
        part = os.pread(fd, min(65_536, saved.st_size + 1 - offset), offset)
        if not part: break
        offset += len(part); digest.update(part)
    need(offset == saved.st_size and digest.hexdigest() == ORIGIN_GUARD_SHA256
         and identity(os.fstat(fd)) == identity(saved))
    return saved


def environment_for(purpose: str, state_fd: int, ca_fd: int, distribution_fd: int,
                    origin_guard_fd: int,
                    policy, base) -> dict[str, str]:
    need(purpose in base.SEQUENCE)
    base.private_directory(state_fd)
    trust = policy["npm_trust"]
    result = {"PATH": "/proc/self/fd/%d/%s/bin" % (distribution_fd, ROOT),
              "HOME": "/proc/self/fd/%d/home" % state_fd,
              "CI": "true", "LC_ALL": "C", "LANG": "C",
              "NPM_CONFIG_CACHE": "/proc/self/fd/%d/npm-cache" % state_fd,
              "NPM_CONFIG_REGISTRY": trust["registry_origin"],
              "NPM_CONFIG_CAFILE": "/proc/self/fd/%d" % ca_fd,
              "NPM_CONFIG_STRICT_SSL": "true", "NPM_CONFIG_UPDATE_NOTIFIER": "false",
              "NPM_CONFIG_AUDIT": "false", "NPM_CONFIG_FUND": "false",
              "NPM_CONFIG_PROXY": "", "NPM_CONFIG_HTTPS_PROXY": "",
              "NODE_OPTIONS": "--require=/proc/self/fd/%d" % origin_guard_fd}
    if purpose == "app-build":
        result.update({key: "true" for key in base.BUILD_FLAGS})
    return result


def run_phase(base_adapter_raw: bytes, custody, purpose: str, source_fd: int,
              state_fd: int, journal_fd: int, distribution_fd: int, node_fd: int,
              npm_fd: int, ca_fd: int, origin_guard_fd: int,
              policy_raw: bytes, policy_sha256: str,
              serial: int, popen=None):
    """Delegate exact process custody while binding the Node24 distribution FD."""
    need(len({source_fd, state_fd, journal_fd, distribution_fd, node_fd, npm_fd,
              ca_fd, origin_guard_fd}) == 8)
    policy = parse_policy(policy_raw, policy_sha256)
    root_saved, node_saved, npm_saved = bind_distribution(distribution_fd, node_fd, npm_fd)
    guard_saved = verify_guard_fd(origin_guard_fd)
    base = load_base_adapter(base_adapter_raw)
    base.SCHEMA = SCHEMA
    base.parse_policy = parse_policy
    base.environment_for = lambda phase, state, ca, selected: environment_for(
        phase, state, ca, distribution_fd, origin_guard_fd, selected, base)
    actual_popen = base.subprocess.Popen if popen is None else popen
    def inherited_popen(*args, **kwargs):
        passed = tuple(kwargs.get("pass_fds", ()))
        need(distribution_fd not in passed and origin_guard_fd not in passed)
        kwargs["pass_fds"] = passed + (distribution_fd, origin_guard_fd)
        return actual_popen(*args, **kwargs)
    arguments = (custody, purpose, source_fd, state_fd, journal_fd,
                 node_fd, npm_fd, ca_fd, policy_raw, policy_sha256, serial)
    receipt = base.run_phase(*arguments, popen=inherited_popen)
    need(identity(os.fstat(distribution_fd)) == identity(root_saved)
         and identity(os.fstat(node_fd)) == identity(node_saved)
         and identity(os.fstat(npm_fd)) == identity(npm_saved)
         and identity(os.fstat(origin_guard_fd)) == identity(guard_saved))
    base_receipt = dict(receipt)
    base_receipt_raw = json.dumps(base_receipt, sort_keys=True, separators=(",", ":")).encode("ascii")
    receipt = dict(base_receipt)
    receipt.update({"schema": "compatible-full-app-long-process-node24-receipt.v1",
                    "base_adapter_sha256": BASE_ADAPTER_SHA256,
                    "base_receipt_sha256": hashlib.sha256(base_receipt_raw).hexdigest(),
                    "distribution_archive_sha256": policy["distribution"]["archive_sha256"],
                    "node_version": NODE_VERSION, "npm_version": NPM_VERSION,
                    "origin_guard_sha256": ORIGIN_GUARD_SHA256})
    supplemental_raw = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("ascii")
    base._write_once(journal_fd, "long-command-%d-%s.node24.receipt.json" % (serial, purpose),
                     supplemental_raw)
    return receipt


def main() -> int:
    print("compatible-full-app-long-process-node24 FAIL unrouted_controller_and_runtime_evidence_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
