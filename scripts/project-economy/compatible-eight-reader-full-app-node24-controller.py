"""Unrouted integration controller primitives for exact Node24 full-App evidence.

No phase is executed here.  This source supplies the destructive-on-failure
private-root rule, exact external-gate parsing, and no-skip durable receipt
verification needed by a future native workflow.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import time


PREPARATION_SHA256 = "e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42"
SUCCESSOR_SHA256 = "7a3028e0650e1ba5f3751a893fe15cb8213e05ba90381b241eed3beb087245c8"
CA_SOURCE_CAPTURE_SHA256 = "16a0644858cd8f1090a61f0b6ac96fd17d0811bcecab15a5f362a5310f7a602f"
CA_EXPORT_SOURCE_SHA256 = "dad7e0cd6b352f899da2dc2a9a50069a478f1a866db7402207355a6699e8008b"
CA_SCRIPT_SHA256 = "eabddb520af9e19ab8970752e9c21db7e5b15385abe2cad298635fc100aed646"
BASE_ADAPTER_SHA256 = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"
APP_MANIFEST_SHA256 = "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"
ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
ORIGIN_GUARD_SHA256 = "767145176eb49355611612f883b85a60babe8bff11cd41e69b4ffca33589369a"
SDK_PACKAGE_SHA256 = "859cb4fbf12ddc4192e7ad21a29c25368accd7bee3111394c484d36714d08220"
SDK_FILES = {
    "scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts":
        ("b6bde1facf9ed7c886f715069924e2c049808d2da9e16b72a35debb46013e764", 7394),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs":
        ("3f758f1ef6a711fe36edba17408f547954ed10ea2b1e8e588640bcf97dd3d931", 8961),
    "scripts/project-economy/compatible-eight-reader-full-app-sdk-source.mjs":
        ("51b68fc0b98ce5d54943d627fc2ee5bc3668f7cb471625ebe7ed97b2ea2b7292", 6822),
}
NODE_VERSION = "v24.21.0"
NPM_VERSION = "11.19.0"
POLICY_SCHEMA = "compatible-full-app-toolchain-policy.v2-node24"
PREPARATION_POLICY_SHA256 = "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"
ARCHIVE_ROOT = "node-v24.21.0-linux-x64"
ROOT_LEAF = "compatible-app-809f"
SEQUENCE = ("node-version", "npm-version", "npm-ci", "sdk-unit", "app-build")
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink",
          "st_size", "st_mtime_ns", "st_ctime_ns")
ENTRY_CAP = 100_000
RECEIPT_CAP = 65_536
OUTPUT_CAPS = {"node-version": 65_536, "npm-version": 65_536,
               "npm-ci": 8_388_608, "sdk-unit": 1_048_576,
               "app-build": 8_388_608}
CLEANUP_RESERVE = 15


class ControllerFailure(Exception):
    pass


def need(value) -> None:
    if value is not True:
        raise ControllerFailure("compatible_full_app_node24_controller_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


def anchor(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid, value.st_mode)


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


def decode(raw: bytes):
    need(type(raw) is bytes and 0 < len(raw) <= RECEIPT_CAP)
    try:
        return json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(ControllerFailure()))
    except (ValueError, UnicodeError):
        raise ControllerFailure("compatible_full_app_node24_controller_denied") from None


def exact(value, keys):
    need(type(value) is dict and set(value) == set(keys))
    return value


def load_exact(raw: bytes, expected_sha256: str, name: str):
    need(type(raw) is bytes and 0 < len(raw) <= 65_536
         and hashlib.sha256(raw).hexdigest() == lowercase_hash(expected_sha256)
         and type(name) is str and name.isidentifier())
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader=None))
    exec(compile(raw, "<captured-" + name + ">", "exec"), module.__dict__)
    return module


def _private_directory(fd: int) -> os.stat_result:
    saved = os.fstat(fd)
    need(stat.S_ISDIR(saved.st_mode) and saved.st_uid == os.geteuid()
         and saved.st_gid == os.getegid() and stat.S_IMODE(saved.st_mode) == 0o700)
    return saved


def _discard_contents(directory_fd: int, deadline: float, counter: list[int]) -> None:
    need(time.monotonic() < deadline)
    names = []
    with os.scandir(directory_fd) as entries:
        for entry in entries:
            counter[0] += 1
            need(counter[0] <= ENTRY_CAP and entry.name not in ("", ".", "..")
                 and "/" not in entry.name and time.monotonic() < deadline)
            names.append(entry.name)
    for name in names:
        need(time.monotonic() < deadline)
        current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        need(current.st_uid == os.geteuid())
        if stat.S_ISDIR(current.st_mode):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=directory_fd)
            try:
                need(identity(os.fstat(child)) == identity(current))
                _discard_contents(child, deadline, counter)
                need(identity(os.fstat(child)) == identity(current)
                     or (os.fstat(child).st_dev == current.st_dev
                         and os.fstat(child).st_ino == current.st_ino))
            finally: os.close(child)
            os.rmdir(name, dir_fd=directory_fd)
        else:
            os.unlink(name, dir_fd=directory_fd)


def discard_materialized_root(parent_fd: int, root_fd: int, root_saved: os.stat_result,
                              deadline: float) -> None:
    """Irreversibly discard only the exact private materializer child."""
    parent_saved = _private_directory(parent_fd)
    need(type(root_saved) is os.stat_result and time.monotonic() < deadline)
    at_path = os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    need(identity(at_path) == identity(root_saved) == identity(os.fstat(root_fd))
         and stat.S_ISDIR(root_saved.st_mode) and root_saved.st_uid == os.geteuid()
         and stat.S_IMODE(root_saved.st_mode) == 0o700)
    _discard_contents(root_fd, deadline, [0])
    with os.scandir(root_fd) as entries:
        need(next(entries, None) is None)
    os.rmdir(ROOT_LEAF, dir_fd=parent_fd)
    try:
        os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise ControllerFailure("compatible_full_app_node24_controller_denied")
    after = os.fstat(parent_fd)
    need(anchor(after) == anchor(parent_saved) and time.monotonic() < deadline)


def place_sdk_or_discard(preparation, parent_fd: int, root_fd: int,
                         sdk_fds: dict[str, int], evidence_raw: bytes,
                         evidence_sha256: str, deadline) -> dict:
    """Never permit retry/reuse of a root after any partial package failure."""
    root_saved = os.fstat(root_fd)
    try:
        receipt = preparation.place_sdk_package(root_fd, sdk_fds, evidence_raw,
                                                evidence_sha256, deadline)
        at_path = os.stat(ROOT_LEAF, dir_fd=parent_fd, follow_symlinks=False)
        current = os.fstat(root_fd)
        need(anchor(at_path) == anchor(root_saved) == anchor(current))
        return receipt
    except BaseException:
        discard_materialized_root(parent_fd, root_fd, root_saved,
                                  time.monotonic() + CLEANUP_RESERVE)
        raise


def validate_external_gates(materializer_raw: bytes, materializer_sha256: str,
                            sdk_raw: bytes, sdk_sha256: str,
                            filesystem_raw: bytes, filesystem_sha256: str,
                            egress_raw: bytes, egress_sha256: str,
                            ca_raw: bytes, ca_sha256: str) -> dict:
    """Validate source-pinned receipts; does not itself approve their producers."""
    values = []
    for raw, expected in ((materializer_raw, materializer_sha256), (sdk_raw, sdk_sha256),
                          (filesystem_raw, filesystem_sha256),
                          (egress_raw, egress_sha256), (ca_raw, ca_sha256)):
        need(hashlib.sha256(raw).hexdigest() == lowercase_hash(expected))
        values.append(decode(raw))
    materializer, sdk, filesystem, egress, ca = values
    exact(materializer, ("schema", "app_manifest_sha256", "materialized_root_identity",
                         "source_files", "source_bytes"))
    need(materializer["schema"] == "compatible-full-app-materializer-evidence.v1"
         and materializer["app_manifest_sha256"] == APP_MANIFEST_SHA256
         and materializer["source_files"] == 2_445 and materializer["source_bytes"] == 20_984_073
         and type(materializer["materialized_root_identity"]) is list
         and len(materializer["materialized_root_identity"]) == len(FIELDS)
         and all(type(item) is int and item >= 0
                 for item in materializer["materialized_root_identity"]))
    exact(sdk, ("schema", "exact_app_manifest_sha256", "sdk_sha256", "sdk_bytes",
                "sdk_package_sha256", "files", "materialized_root_identity"))
    need(sdk["schema"] == "compatible-full-app-sdk-placement-receipt.v1"
         and sdk["exact_app_manifest_sha256"] == APP_MANIFEST_SHA256
         and sdk["sdk_package_sha256"] == SDK_PACKAGE_SHA256
         and sdk["materialized_root_identity"] == materializer["materialized_root_identity"]
         and type(sdk["files"]) is list and len(sdk["files"]) == len(SDK_FILES))
    rows = {}
    for row in sdk["files"]:
        exact(row, ("path", "sha256", "bytes", "identity"))
        need(type(row["path"]) is str and row["path"] not in rows
             and type(row["identity"]) is list and len(row["identity"]) == len(FIELDS)
             and all(type(item) is int and item >= 0 for item in row["identity"]))
        rows[row["path"]] = (row["sha256"], row["bytes"])
    need(rows == SDK_FILES
         and sdk["sdk_sha256"] == SDK_FILES[
             "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs"][0]
         and sdk["sdk_bytes"] == SDK_FILES[
             "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs"][1])
    exact(filesystem, ("schema", "app_manifest_sha256", "sdk_package_sha256",
                       "root_identity", "tree_manifest_sha256", "read_only", "producer_sha256"))
    need(filesystem["schema"] == "compatible-full-app-read-only-tree-receipt.v1"
         and filesystem["app_manifest_sha256"] == APP_MANIFEST_SHA256
         and filesystem["sdk_package_sha256"] == sdk["sdk_package_sha256"]
         and filesystem["root_identity"] == materializer["materialized_root_identity"]
         and filesystem["read_only"] is True)
    exact(egress, ("schema", "archive_sha256", "registry_origin", "tcp_destination",
                   "dns_policy_sha256", "raw_socket_denied", "producer_sha256"))
    need(egress["schema"] == "compatible-full-app-kernel-egress-receipt.v1"
         and egress["archive_sha256"] == ARCHIVE_SHA256
         and egress["registry_origin"] == "https://registry.npmjs.org/"
         and egress["tcp_destination"] == "registry.npmjs.org:443"
         and egress["raw_socket_denied"] is True)
    exact(ca, ("schema", "archive_sha256", "node_version", "node_sha256",
               "script_sha256", "ca_sha256", "ca_bytes", "certificates", "cleanup_complete"))
    need(ca["schema"] == "compatible-full-app-node24-ca-export-receipt.v1"
         and ca["archive_sha256"] == ARCHIVE_SHA256 and ca["node_version"] == NODE_VERSION
         and ca["script_sha256"] == CA_SCRIPT_SHA256
         and ca["cleanup_complete"] is True and type(ca["ca_bytes"]) is int and ca["ca_bytes"] > 0
         and type(ca["certificates"]) is int and ca["certificates"] > 0)
    for value in (filesystem["sdk_package_sha256"], filesystem["tree_manifest_sha256"],
                  filesystem["producer_sha256"], egress["dns_policy_sha256"],
                  egress["producer_sha256"], ca["node_sha256"], ca["script_sha256"],
                  ca["ca_sha256"]):
        lowercase_hash(value)
    return {"materializer": materializer, "sdk": sdk, "filesystem": filesystem,
            "egress": egress, "ca": ca}


def parse_toolchain_policy(raw: bytes, expected_sha256: str) -> dict:
    need(type(raw) is bytes and 0 < len(raw) <= 16_384
         and hashlib.sha256(raw).hexdigest() == lowercase_hash(expected_sha256))
    value = decode(raw)
    exact(value, ("schema", "distribution", "node", "npm_cli", "npm_trust"))
    distribution = exact(value["distribution"],
                         ("archive_sha256", "preparation_policy_sha256", "root"))
    node = exact(value["node"], ("sha256", "version"))
    npm = exact(value["npm_cli"], ("sha256", "version"))
    trust = exact(value["npm_trust"],
                  ("registry_origin", "ca_sha256", "proxy_policy", "redirect_policy",
                   "cache_policy", "evidence_sha256"))
    need(value["schema"] == POLICY_SCHEMA
         and distribution == {"archive_sha256": ARCHIVE_SHA256,
                              "preparation_policy_sha256": PREPARATION_POLICY_SHA256,
                              "root": ARCHIVE_ROOT}
         and node["version"] == NODE_VERSION and npm["version"] == NPM_VERSION
         and trust["registry_origin"] == "https://registry.npmjs.org/"
         and trust["proxy_policy"] == "direct-no-ambient"
         and trust["redirect_policy"] == "deny-cross-origin-and-downgrade-wrapper"
         and trust["cache_policy"] == "fresh-private-empty")
    for digest in (node["sha256"], npm["sha256"], trust["ca_sha256"],
                   trust["evidence_sha256"]):
        lowercase_hash(digest)
    return value


def _read_file(journal_fd: int, name: str, cap: int, allow_empty: bool) -> bytes:
    need(type(name) is str and "/" not in name and name not in ("", ".", ".."))
    need(type(cap) is int and 0 < cap <= 8_388_608 and type(allow_empty) is bool)
    before = os.stat(name, dir_fd=journal_fd, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid() and before.st_nlink == 1
         and stat.S_IMODE(before.st_mode) == 0o600 and 0 <= before.st_size <= cap
         and (allow_empty or before.st_size > 0))
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=journal_fd)
    try:
        need(identity(os.fstat(fd)) == identity(before))
        raw = os.read(fd, before.st_size + 1)
        need(len(raw) == before.st_size and not os.read(fd, 1)
             and identity(os.fstat(fd)) == identity(before)
             and identity(os.stat(name, dir_fd=journal_fd, follow_symlinks=False)) == identity(before))
        return raw
    finally: os.close(fd)


def _read_receipt(journal_fd: int, name: str) -> bytes:
    return _read_file(journal_fd, name, RECEIPT_CAP, False)


def verify_five_receipts(journal_fd: int, policy_sha256: str) -> tuple[dict, ...]:
    """Require exactly five ordered durable supplemental receipts, no skips."""
    journal_saved = _private_directory(journal_fd); policy_sha256 = lowercase_hash(policy_sha256)
    expected_names = {"long-command-%d-%s.node24.receipt.json" % (index, purpose)
                      for index, purpose in enumerate(SEQUENCE, 1)}
    with os.scandir(journal_fd) as entries:
        names = {entry.name for entry in entries if entry.name.endswith(".node24.receipt.json")}
    need(names == expected_names)
    receipts = []
    for serial, purpose in enumerate(SEQUENCE, 1):
        value = decode(_read_receipt(journal_fd,
            "long-command-%d-%s.node24.receipt.json" % (serial, purpose)))
        required = {"schema", "purpose", "serial", "pid", "starttime", "policy_sha256",
                    "node_sha256", "npm_cli_sha256", "npm_trust_evidence_sha256",
                    "stdout_bytes", "stdout_sha256", "stderr_bytes", "stderr_sha256",
                    "cleanup_complete", "base_adapter_sha256", "base_receipt_sha256",
                    "distribution_archive_sha256", "node_version", "npm_version",
                    "origin_guard_sha256"}
        exact(value, required)
        need(value["schema"] == "compatible-full-app-long-process-node24-receipt.v1"
             and value["purpose"] == purpose and value["serial"] == serial
             and all(type(value[key]) is int and value[key] > 0
                     for key in ("pid", "starttime"))
             and all(type(value[key]) is int and value[key] >= 0
                     for key in ("stdout_bytes", "stderr_bytes"))
             and value["policy_sha256"] == policy_sha256 and value["cleanup_complete"] is True
             and value["base_adapter_sha256"] == BASE_ADAPTER_SHA256
             and value["distribution_archive_sha256"] == ARCHIVE_SHA256
             and value["node_version"] == NODE_VERSION and value["npm_version"] == NPM_VERSION
             and value["origin_guard_sha256"] == ORIGIN_GUARD_SHA256)
        for key in ("node_sha256", "npm_cli_sha256", "npm_trust_evidence_sha256",
                    "stdout_sha256", "stderr_sha256", "base_adapter_sha256", "base_receipt_sha256"):
            lowercase_hash(value[key])
        base_name = "long-command-%d-%s.receipt.json" % (serial, purpose)
        base_raw = _read_receipt(journal_fd, base_name)
        need(hashlib.sha256(base_raw).hexdigest() == value["base_receipt_sha256"])
        base = decode(base_raw)
        base_required = required - {"base_adapter_sha256", "base_receipt_sha256",
                                    "distribution_archive_sha256", "node_version",
                                    "npm_version", "origin_guard_sha256"}
        exact(base, base_required)
        need(base["schema"] == "compatible-full-app-long-process-receipt.v1"
             and all(base[key] == value[key] for key in base_required - {"schema"}))
        prefix = "long-command-%d-%s" % (serial, purpose)
        stdout = _read_file(journal_fd, prefix + ".out", OUTPUT_CAPS[purpose], True)
        stderr = _read_file(journal_fd, prefix + ".err", OUTPUT_CAPS[purpose], True)
        need(len(stdout) < OUTPUT_CAPS[purpose] and len(stderr) < OUTPUT_CAPS[purpose]
             and len(stdout) == value["stdout_bytes"]
             and hashlib.sha256(stdout).hexdigest() == value["stdout_sha256"]
             and len(stderr) == value["stderr_bytes"]
             and hashlib.sha256(stderr).hexdigest() == value["stderr_sha256"])
        owner = decode(_read_receipt(journal_fd, prefix + ".owner.json"))
        closed = decode(_read_receipt(journal_fd, prefix + ".closed.json"))
        exact(owner, ("schema", "pid", "starttime", "pgid", "sid"))
        exact(closed, ("schema", "pid", "starttime", "pgid", "sid"))
        need(owner["schema"] == "auth-chain-command-owner.v1"
             and closed["schema"] == "auth-chain-command-closed.v1"
             and all(type(owner[key]) is int and owner[key] > 0
                     for key in ("pid", "starttime", "pgid", "sid"))
             and all(owner[key] == closed[key] for key in ("pid", "starttime", "pgid", "sid"))
             and owner["pid"] == value["pid"] and owner["starttime"] == value["starttime"])
        receipts.append(value)
    need(identity(os.fstat(journal_fd)) == identity(journal_saved))
    return tuple(receipts)


def validate_controller_evidence(journal_fd: int, policy_raw: bytes, policy_sha256: str,
                                 materializer_raw: bytes, materializer_sha256: str,
                                 sdk_raw: bytes, sdk_sha256: str,
                                 filesystem_raw: bytes, filesystem_sha256: str,
                                 egress_raw: bytes, egress_sha256: str,
                                 ca_raw: bytes, ca_sha256: str) -> dict:
    """Join all five ordered native phases to all four source/result gates.

    Success means internally coherent evidence only.  Producer source review,
    actual Node execution and workflow routing remain separate release gates.
    """
    policy = parse_toolchain_policy(policy_raw, policy_sha256)
    gates = validate_external_gates(materializer_raw, materializer_sha256,
                                    sdk_raw, sdk_sha256, filesystem_raw, filesystem_sha256,
                                    egress_raw, egress_sha256, ca_raw, ca_sha256)
    receipts = verify_five_receipts(journal_fd, policy_sha256)
    node = policy["node"]; npm = policy["npm_cli"]; trust = policy["npm_trust"]
    need(trust["evidence_sha256"] == egress_sha256
         and trust["ca_sha256"] == gates["ca"]["ca_sha256"]
         and gates["ca"]["node_sha256"] == node["sha256"]
         and all(receipt["node_sha256"] == node["sha256"]
                 and receipt["npm_cli_sha256"] == npm["sha256"]
                 and receipt["npm_trust_evidence_sha256"] == trust["evidence_sha256"]
                 for receipt in receipts))
    return {"schema": "compatible-full-app-node24-controller-evidence.v1",
            "policy_sha256": policy_sha256,
            "materializer_sha256": materializer_sha256,
            "sdk_placement_sha256": sdk_sha256,
            "read_only_tree_sha256": filesystem_sha256,
            "kernel_egress_sha256": egress_sha256,
            "ca_result_sha256": ca_sha256,
            "native_phase_purposes": list(SEQUENCE),
            "native_phase_count": len(receipts),
            "internal_evidence_coherent": True,
            "runtime_admission": False,
            "release_admission": False}


def main() -> int:
    print("compatible-full-app-node24-controller FAIL external_gates_and_native_route_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
