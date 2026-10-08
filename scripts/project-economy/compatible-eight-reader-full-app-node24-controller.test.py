from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time


HERE = Path(__file__).absolute().parent
SOURCE = HERE / "compatible-eight-reader-full-app-node24-controller.py"
PREPARATION = HERE.parent / "operations-node24-successor-stage" / "compatible-eight-reader-full-app-node24-preparation.py"
SUCCESSOR = HERE.parent / "operations-node24-successor-stage-three" / "compatible-eight-reader-full-app-long-process-node24.py"
ORIGIN_GUARD = HERE.parent / "operations-node24-successor-stage-three" / "compatible-eight-reader-full-app-npm-origin-guard.cjs"
CA_EXPORT = HERE.parent / "operations-node24-ca-stage-six" / "compatible-eight-reader-full-app-node24-ca-export.py"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


controller = load(SOURCE, "node24_controller_under_test")


def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def write_private(directory: Path, name: str, raw: bytes) -> None:
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        assert os.write(fd, raw) == len(raw)
        os.fsync(fd)
    finally:
        os.close(fd)


def denied(callable_) -> None:
    try:
        callable_()
    except controller.ControllerFailure:
        return
    raise AssertionError("operation was not denied")


def test_exact_source_pins() -> None:
    assert hashlib.sha256(PREPARATION.read_bytes()).hexdigest() == controller.PREPARATION_SHA256
    assert hashlib.sha256(SUCCESSOR.read_bytes()).hexdigest() == controller.SUCCESSOR_SHA256
    successor = load(SUCCESSOR, "successor_pin_test")
    assert successor.ORIGIN_GUARD_SHA256 == controller.ORIGIN_GUARD_SHA256
    assert hashlib.sha256(ORIGIN_GUARD.read_bytes()).hexdigest() == controller.ORIGIN_GUARD_SHA256
    assert hashlib.sha256(CA_EXPORT.read_bytes()).hexdigest() == controller.CA_EXPORT_SOURCE_SHA256
    ca = load(CA_EXPORT, "ca_export_pin_test")
    assert ca.SCRIPT_SHA256 == controller.CA_SCRIPT_SHA256


def test_partial_sdk_failure_discards_entire_root() -> None:
    class Deadline:
        # Placement may consume its entire deadline; cleanup has its own reserve.
        end = time.monotonic() - 1

    class Partial:
        @staticmethod
        def place_sdk_package(root_fd, _sdk_fds, _raw, _sha, _deadline):
            scripts = os.open("scripts/project-economy", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=root_fd)
            try:
                fd = os.open("partial-sdk.mjs", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=scripts)
                os.write(fd, b"partial")
                os.close(fd)
            finally:
                os.close(scripts)
            raise RuntimeError("synthetic mid-package failure")

    with tempfile.TemporaryDirectory() as temporary:
        parent_path = Path(temporary) / "private"
        parent_path.mkdir(mode=0o700)
        root_path = parent_path / controller.ROOT_LEAF
        (root_path / "scripts" / "project-economy").mkdir(parents=True, mode=0o700)
        (root_path / "existing").write_bytes(b"keep only until discard")
        os.chmod(root_path, 0o700)
        parent_fd = os.open(parent_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        root_fd = os.open(root_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        old_inode = os.fstat(root_fd).st_ino
        try:
            try:
                controller.place_sdk_or_discard(Partial, parent_fd, root_fd, {}, b"x", "0" * 64,
                                                Deadline())
            except RuntimeError:
                pass
            else:
                raise AssertionError("partial failure did not propagate")
            assert not root_path.exists()
            assert os.fstat(root_fd).st_nlink == 0
            root_path.mkdir(mode=0o700)
            assert root_path.stat().st_ino != old_inode
        finally:
            os.close(root_fd)
            os.close(parent_fd)


def test_success_does_not_discard() -> None:
    class Deadline:
        end = time.monotonic() + 30

    class Success:
        @staticmethod
        def place_sdk_package(*_args):
            return {"schema": "synthetic-success"}

    with tempfile.TemporaryDirectory() as temporary:
        parent_path = Path(temporary) / "private"; parent_path.mkdir(mode=0o700)
        root_path = parent_path / controller.ROOT_LEAF; root_path.mkdir(mode=0o700)
        parent_fd = os.open(parent_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        root_fd = os.open(root_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            assert controller.place_sdk_or_discard(Success, parent_fd, root_fd, {}, b"x",
                                                   "0" * 64, Deadline())["schema"] == "synthetic-success"
            assert root_path.is_dir()
        finally:
            os.close(root_fd); os.close(parent_fd)


def gate_packets():
    root_identity = [1, 2, os.geteuid(), os.getegid(), stat.S_IFDIR | 0o700, 2, 4096, 3, 4]
    materializer = {"schema": "compatible-full-app-materializer-evidence.v1",
                    "app_manifest_sha256": controller.APP_MANIFEST_SHA256,
                    "materialized_root_identity": root_identity,
                    "source_files": 2445, "source_bytes": 20984073}
    rows = [{"path": path, "sha256": digest, "bytes": size,
             "identity": [10 + index, 20 + index, os.geteuid(), os.getegid(),
                          stat.S_IFREG | 0o600, 1, size, 30, 40]}
            for index, (path, (digest, size)) in enumerate(sorted(controller.SDK_FILES.items()))]
    sdk_path = "scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test.mjs"
    sdk = {"schema": "compatible-full-app-sdk-placement-receipt.v1",
           "exact_app_manifest_sha256": controller.APP_MANIFEST_SHA256,
           "sdk_sha256": controller.SDK_FILES[sdk_path][0],
           "sdk_bytes": controller.SDK_FILES[sdk_path][1],
           "sdk_package_sha256": controller.SDK_PACKAGE_SHA256,
           "files": rows, "materialized_root_identity": root_identity}
    filesystem = {"schema": "compatible-full-app-read-only-tree-receipt.v1",
                  "app_manifest_sha256": controller.APP_MANIFEST_SHA256,
                  "sdk_package_sha256": controller.SDK_PACKAGE_SHA256,
                  "root_identity": root_identity, "tree_manifest_sha256": "1" * 64,
                  "read_only": True, "producer_sha256": "2" * 64}
    egress = {"schema": "compatible-full-app-kernel-egress-receipt.v1",
              "archive_sha256": controller.ARCHIVE_SHA256,
              "registry_origin": "https://registry.npmjs.org/",
              "tcp_destination": "registry.npmjs.org:443",
              "dns_policy_sha256": "3" * 64, "raw_socket_denied": True,
              "producer_sha256": "4" * 64}
    ca = {"schema": "compatible-full-app-node24-ca-export-receipt.v1",
          "archive_sha256": controller.ARCHIVE_SHA256, "node_version": controller.NODE_VERSION,
          "node_sha256": "5" * 64, "script_sha256": controller.CA_SCRIPT_SHA256,
          "ca_sha256": "6" * 64, "ca_bytes": 100, "certificates": 1,
          "cleanup_complete": True}
    return [canonical(value) for value in (materializer, sdk, filesystem, egress, ca)]


def validate(packets):
    arguments = []
    for raw in packets:
        arguments.extend((raw, hashlib.sha256(raw).hexdigest()))
    return controller.validate_external_gates(*arguments)


def test_external_gate_join_and_fail_closed_mismatches() -> None:
    packets = gate_packets()
    value = validate(packets)
    assert set(value) == {"materializer", "sdk", "filesystem", "egress", "ca"}
    for index, key, changed in ((1, "sdk_package_sha256", "7" * 64),
                                (2, "root_identity", [9] * 9),
                                (3, "tcp_destination", "example.invalid:443"),
                                (4, "script_sha256", "8" * 64)):
        altered = list(packets); packet = json.loads(altered[index]); packet[key] = changed
        altered[index] = canonical(packet)
        denied(lambda altered=altered: validate(altered))


def toolchain_policy(egress_sha256: str, ca_sha256: str) -> bytes:
    return canonical({
        "schema": controller.POLICY_SCHEMA,
        "distribution": {"archive_sha256": controller.ARCHIVE_SHA256,
                         "preparation_policy_sha256": controller.PREPARATION_POLICY_SHA256,
                         "root": controller.ARCHIVE_ROOT},
        "node": {"sha256": "5" * 64, "version": controller.NODE_VERSION},
        "npm_cli": {"sha256": "b" * 64, "version": controller.NPM_VERSION},
        "npm_trust": {"registry_origin": "https://registry.npmjs.org/",
                      "ca_sha256": ca_sha256,
                      "proxy_policy": "direct-no-ambient",
                      "redirect_policy": "deny-cross-origin-and-downgrade-wrapper",
                      "cache_policy": "fresh-private-empty",
                      "evidence_sha256": egress_sha256},
    })


def receipt_pair(serial: int, purpose: str, policy: str):
    stdout = b"x"; stderr = b""
    base = {"schema": "compatible-full-app-long-process-receipt.v1", "purpose": purpose,
            "serial": serial, "pid": 100 + serial, "starttime": 200 + serial,
            "policy_sha256": policy, "node_sha256": "a" * 64,
            "npm_cli_sha256": "b" * 64, "npm_trust_evidence_sha256": "c" * 64,
            "stdout_bytes": len(stdout), "stdout_sha256": hashlib.sha256(stdout).hexdigest(),
            "stderr_bytes": len(stderr), "stderr_sha256": hashlib.sha256(stderr).hexdigest(),
            "cleanup_complete": True}
    base_raw = canonical(base)
    successor = dict(base)
    successor.update({"schema": "compatible-full-app-long-process-node24-receipt.v1",
                      "base_adapter_sha256": controller.BASE_ADAPTER_SHA256,
                      "base_receipt_sha256": hashlib.sha256(base_raw).hexdigest(),
                      "distribution_archive_sha256": controller.ARCHIVE_SHA256,
                      "node_version": controller.NODE_VERSION, "npm_version": controller.NPM_VERSION,
                      "origin_guard_sha256": controller.ORIGIN_GUARD_SHA256})
    return base_raw, canonical(successor)


def create_journal(path: Path, policy: str) -> None:
    path.mkdir(mode=0o700)
    for serial, purpose in enumerate(controller.SEQUENCE, 1):
        base, successor = receipt_pair(serial, purpose, policy)
        pid = 100 + serial; starttime = 200 + serial
        owner = canonical({"schema": "auth-chain-command-owner.v1", "pid": pid,
                           "starttime": starttime, "pgid": pid, "sid": pid})
        closed = canonical({"schema": "auth-chain-command-closed.v1", "pid": pid,
                            "starttime": starttime, "pgid": pid, "sid": pid})
        write_private(path, f"long-command-{serial}-{purpose}.out", b"x")
        write_private(path, f"long-command-{serial}-{purpose}.err", b"")
        write_private(path, f"long-command-{serial}-{purpose}.owner.json", owner)
        write_private(path, f"long-command-{serial}-{purpose}.closed.json", closed)
        write_private(path, f"long-command-{serial}-{purpose}.receipt.json", base)
        write_private(path, f"long-command-{serial}-{purpose}.node24.receipt.json", successor)


def create_joined_journal(path: Path, policy: str, egress_sha256: str) -> None:
    create_journal(path, policy)
    for serial, purpose in enumerate(controller.SEQUENCE, 1):
        base_path = path / f"long-command-{serial}-{purpose}.receipt.json"
        node_path = path / f"long-command-{serial}-{purpose}.node24.receipt.json"
        base = json.loads(base_path.read_bytes())
        base["node_sha256"] = "5" * 64
        base["npm_cli_sha256"] = "b" * 64
        base["npm_trust_evidence_sha256"] = egress_sha256
        base_raw = canonical(base)
        successor = json.loads(node_path.read_bytes())
        successor.update(base)
        successor["schema"] = "compatible-full-app-long-process-node24-receipt.v1"
        successor["base_receipt_sha256"] = hashlib.sha256(base_raw).hexdigest()
        base_path.write_bytes(base_raw); node_path.write_bytes(canonical(successor))


def test_five_receipts_bind_durable_base_and_have_no_skips() -> None:
    policy = "f" * 64
    with tempfile.TemporaryDirectory() as temporary:
        journal = Path(temporary) / "journal"; create_journal(journal, policy)
        fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            values = controller.verify_five_receipts(fd, policy)
            assert tuple(value["purpose"] for value in values) == controller.SEQUENCE
        finally:
            os.close(fd)
        output_path = journal / "long-command-3-npm-ci.out"
        os.chmod(output_path, 0o600); output_path.write_bytes(b"changed")
        fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            denied(lambda: controller.verify_five_receipts(fd, policy))
        finally:
            os.close(fd)
    with tempfile.TemporaryDirectory() as temporary:
        journal = Path(temporary) / "journal"; create_journal(journal, policy)
        base_path = journal / "long-command-3-npm-ci.receipt.json"
        base_path.write_bytes(base_path.read_bytes() + b" ")
        fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            denied(lambda: controller.verify_five_receipts(fd, policy))
        finally:
            os.close(fd)


def test_controller_joins_five_native_phases_to_all_gates_without_admission() -> None:
    packets = gate_packets()
    hashes = [hashlib.sha256(raw).hexdigest() for raw in packets]
    ca_value = json.loads(packets[4])
    policy_raw = toolchain_policy(hashes[3], ca_value["ca_sha256"])
    policy_sha = hashlib.sha256(policy_raw).hexdigest()
    with tempfile.TemporaryDirectory() as temporary:
        journal = Path(temporary) / "journal"
        create_joined_journal(journal, policy_sha, hashes[3])
        fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            arguments = []
            for raw, digest in zip(packets, hashes):
                arguments.extend((raw, digest))
            evidence = controller.validate_controller_evidence(
                fd, policy_raw, policy_sha, *arguments)
            assert evidence["native_phase_purposes"] == list(controller.SEQUENCE)
            assert evidence["native_phase_count"] == 5
            assert evidence["internal_evidence_coherent"] is True
            assert evidence["runtime_admission"] is False
            assert evidence["release_admission"] is False
            changed = json.loads(policy_raw)
            changed["node"]["sha256"] = "9" * 64
            changed_raw = canonical(changed)
            denied(lambda: controller.validate_controller_evidence(
                fd, changed_raw, hashlib.sha256(changed_raw).hexdigest(), *arguments))
        finally:
            os.close(fd)


def test_source_has_no_execution_or_network_capability_and_main_refuses() -> None:
    raw = SOURCE.read_text("utf-8")
    for forbidden in ("subprocess.Popen", "socket.", "urllib", "requests.", "os.exec", "os.system"):
        assert forbidden not in raw
    run = subprocess.run([os.environ.get("PYTHON", "python"), str(SOURCE)], check=False,
                         capture_output=True, text=True, timeout=10)
    assert run.returncode == 78
    assert run.stdout == "compatible-full-app-node24-controller FAIL external_gates_and_native_route_required\n"


def main() -> int:
    tests = [value for key, value in sorted(globals().items()) if key.startswith("test_")]
    for test in tests:
        test()
    print(f"compatible-full-app-node24-controller-tests PASS tests={len(tests)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
