"""Source-only native-chain admission controller. It performs no mutation while blocked."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
PLAN = HERE / "compatible-eight-reader-full-app-native-chain-plan-two.json"
EXPECTED = {
    "long_process": (HERE / "compatible-eight-reader-full-app-long-process.py",
                     "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"),
    "node_input_policy": (HERE / "compatible-eight-reader-full-app-node24-input-policy.json",
                          "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd"),
    "sdk_placement_descriptor": (HERE / "compatible-eight-reader-full-app-sdk-placement.json",
                                 "92fa31abe6cb52454a203b841b2a4bc90cdce5b541dac87c1a668fa83b36396d"),
    "static_server": (HERE / "compatible-eight-reader-full-app-static-server.py",
                      "73ac24417f4de80c1020afb7a4ad1a12c3d0c610ca797b1dc32bca001d71b578"),
    "browser_network": (HERE / "compatible-eight-reader-full-app-browser-network.mjs",
                        "3b88a4acea11f9305f0049e04b37e6fb6359616311060698decdf9a80af23511"),
    "browser_receipt_network": (HERE / "compatible-eight-reader-full-app-browser-receipt-network.mjs",
                                "33b77650d3d04dcd98b7e1285e8571b40cebcf81ce251c9c0b1ab77661d2b80e"),
}
SEQUENCE = ("source-acquisition", "materialization", "sdk-placement", "node-version",
            "npm-version", "npm-ci", "sdk-unit", "app-build", "static-server",
            "native-browser", "owned-cleanup")


class NativeChainHold(Exception):
    pass


def need(value):
    if value is not True:
        raise NativeChainHold("compatible_full_app_native_chain_refused")


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result)
        result[key] = value
    return result


def sha(path):
    value = path.read_bytes()
    need(0 < len(value) <= 1_048_576)
    return hashlib.sha256(value).hexdigest()


def load_plan(raw=None):
    canonical = PLAN.read_bytes()
    raw = canonical if raw is None else raw
    need(type(raw) is bytes and 0 < len(raw) <= 32_768)
    need(raw == canonical)
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(NativeChainHold()))
    except (ValueError, UnicodeError):
        raise NativeChainHold("compatible_full_app_native_chain_refused") from None
    need(set(value) == {"schema", "status", "canonical", "runner", "sources",
                        "node_distribution", "playwright_distribution", "sdk_placement",
                        "sequence", "admission"})
    need(value["schema"] == "compatible-full-app-native-chain-plan.v2"
         and value["status"] == "source-locked-admission-blocked"
         and value["canonical"] == {
             "ancestor": "5758a3f73be43d0d171a3e0b8dce0ff67f787f60",
             "predecessor_head": "e58d32c7e7ac6b450b28cbee5ce0b22490442e0e",
             "current_head": "e6dc82249e64ab1d037ab592ce29a2358ec526a1",
             "exact_app_commit": "809f64e0fd98322c53d9c4e9697df5b515303812",
             "exact_app_tree": "3d96301591652f9d86ccbbdf8ff26efcb7180ce9",
             "exact_app_manifest_sha256":
                 "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"}
         and value["runner"] == {"label": "ubuntu-24.04",
                                  "checkout_action": "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
                                  "persist_credentials": False}
         and tuple(value["sequence"]) == SEQUENCE)
    need(value["sources"] == {name: digest for name, (_path, digest) in EXPECTED.items()} |
         {"owned_process": "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a"})
    for name, (path, digest) in EXPECTED.items():
        need(path.is_file() and not path.is_symlink() and sha(path) == digest)
    node = value["node_distribution"]
    need(node == {
        "descriptor_sha256": "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd",
        "version": "v24.21.0", "npm_version": "11.19.0",
        "archive": "node-v24.21.0-linux-x64.tar.xz",
        "archive_sha256": "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6",
        "long_process_compatible": False})
    browser = value["playwright_distribution"]
    need(browser == {
        "version": "1.55.0",
        "test_integrity": "sha512-04IXzPwHrW69XusN/SIdDdKZBzMfOT9UNT/YiJit/xpy2VuAoB8NHc8Aplb96zsWDddLnbkPL3TsmrS04ZU2xQ==",
        "playwright_integrity": "sha512-sdCWStblvV1YU909Xqx0DhOjPZE4/5lJsIS84IfN9dAZfcl/CIZ5O8l3o0j7hPMjDvqoTF8ZUcc+i/GL5erstA==",
        "core_integrity": "sha512-GvZs4vU3U5ro2nZpeiwyb0zuFaqb9sUiAJuyrWpcGouD8y9/HLgGbNRjIph7zU9D3hnPaisMl9zG9CgFi/biIg==",
        "chromium_revision": "1187", "chromium_version": "140.0.7339.16",
        "browser_archive_sha256": None})
    need(value["sdk_placement"] == {
             "descriptor_sha256": "92fa31abe6cb52454a203b841b2a4bc90cdce5b541dac87c1a668fa83b36396d",
             "admitted": False}
         and value["admission"] == {"allowed": False, "blockers": [
             "node24_long_process_successor_not_reviewed",
             "sdk_shape_requires_node22_but_distribution_is_node24",
             "sdk_fd_placement_implementation_not_reviewed",
             "playwright_chromium_archive_sha256_not_sourced",
             "static_server_and_browser_owned_process_controller_not_reviewed",
             "native_actor_adapter_and_cleanup_chain_not_run"]})
    return value


def completed_sequence(receipts):
    """Future terminal verifier; it never executes a phase or accepts a partial prefix."""
    need(type(receipts) is list and len(receipts) == len(SEQUENCE))
    for index, (name, row) in enumerate(zip(SEQUENCE, receipts), 1):
        need(type(row) is dict and set(row) == {"schema", "serial", "phase", "complete"}
             and row["schema"] == "compatible-full-app-native-chain-phase.v1"
             and row["serial"] == index and row["phase"] == name and row["complete"] is True)
    return {"schema": "compatible-full-app-native-chain-complete.v1",
            "phases": len(SEQUENCE), "native_acceptance": False}


def main():
    try:
        plan = load_plan()
        need(plan["admission"]["allowed"] is True)
    except BaseException:
        print("FULL_APP_NATIVE_CHAIN HOLD exact_distribution_sdk_browser_and_owned_controller_required")
        return 78
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
