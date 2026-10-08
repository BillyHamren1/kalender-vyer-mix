"""Pure metadata repin guard for reviewed full-App native source closures."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
PLAN = HERE / "compatible-eight-reader-full-app-native-integration-four.json"
EXPECTED = {
    "node_static_server": (HERE / "compatible-eight-reader-full-app-node-static-server.mjs",
        "9a73fddf2d2a8e0de1692274ef2b9ef2e031466705948ff038e43c98ae7da93a"),
    "node_static_owner": (HERE / "compatible-eight-reader-full-app-static-owner-node24.py",
        "19f25cdfa6e41f5af525897981f84483d790ecc1c15222c324ad1aa5fadca986"),
    "browser_network": (HERE / "compatible-eight-reader-full-app-browser-network.mjs",
        "3b88a4acea11f9305f0049e04b37e6fb6359616311060698decdf9a80af23511"),
    "browser_receipt_network": (HERE / "compatible-eight-reader-full-app-browser-receipt-network.mjs",
        "33b77650d3d04dcd98b7e1285e8571b40cebcf81ce251c9c0b1ab77661d2b80e"),
    "playwright_inputs": (HERE / "compatible-eight-reader-full-app-playwright-native-inputs-three.json",
        "de440fcd25272eef547729651e77e0f2ffef487a145d90f4e82c9bab468dc93a"),
    "playwright_snapshot": (HERE / "compatible-eight-reader-full-app-playwright-browsers-1.55.0-three.json",
        "6a346d802543e845c5e79715b99d58fc2bbf58f2a509dccc00f08b634dcb7894"),
}
PREDECESSOR_EXPECTED = {
    "integration_plan": (HERE / "compatible-eight-reader-full-app-native-integration-three.json",
        "e859495e584ee7b0d3f5760134aa8a6ab334477c0046fca4e4d06a935e0f113c"),
    "integration_guard": (HERE / "compatible-eight-reader-full-app-native-integration-three.py",
        "0d0c4296c690e7642a977fce6bfec18d9e8f65d92a9bb1d9c3569c83d0a33b2f"),
    "playwright_guard": (HERE / "compatible-eight-reader-full-app-playwright-native-inputs-guard-three.py",
        "58e794da738e3d01cfaa8490a1571c5a72e966e09ff8b7ba4fd6abf4f5185441"),
}
SEQUENCE = ["refetch-base", "acquire-exact-app", "materialize-with-root-receipt",
    "sdk-placement-and-readonly-transition", "extract-exact-node24", "cold-install-unit-build",
    "bind-readonly-dist-receipt", "start-owned-static-server", "import-exact-playwright-browser",
    "run-receipt-bound-native-actor", "close-browser-and-static-server",
    "prove-owned-resource-absence"]
BLOCKERS = ["node24_extraction_and_executable_evidence_not_reviewed",
    "materialized_root_and_readonly_dist_receipts_not_reviewed",
    "node24_cold_build_controller_not_published_and_reviewed",
    "playwright_browser_archive_sha256_and_import_not_sourced",
    "native_actor_adapter_assertions_and_browser_cleanup_not_reviewed",
    "workflow_source_not_staged", "real_linux_end_to_end_chain_not_run"]


class IntegrationFailure(Exception):
    pass


def need(value):
    if value is not True: raise IntegrationFailure("compatible_full_app_native_integration_denied")


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result); result[key] = value
    return result


def digest(path):
    need(path.is_file() and not path.is_symlink()); raw = path.read_bytes()
    need(0 < len(raw) <= 1_048_576); return hashlib.sha256(raw).hexdigest()


def load(raw=None):
    canonical = PLAN.read_bytes(); raw = canonical if raw is None else raw
    need(type(raw) is bytes and raw == canonical and 0 < len(raw) <= 32_768)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(IntegrationFailure()))
    except (ValueError, UnicodeError):
        raise IntegrationFailure("compatible_full_app_native_integration_denied") from None
    need(set(value) == {"schema", "status", "canonical", "reviewed_predecessors", "reviewed_sources", "node24",
         "playwright", "required_sequence", "workflow", "admission"}
         and value["schema"] == "compatible-full-app-native-integration.v4"
         and value["status"] == "source-locked-admission-blocked")
    need(value["canonical"] == {"base_commit": "b3e1b36a30e9af5359f7863386263e278aa6202a",
        "base_tree": "783a7a20ab77032889d62d6515de1f4c5f8324f4",
        "exact_app_commit": "809f64e0fd98322c53d9c4e9697df5b515303812",
        "exact_app_tree": "3d96301591652f9d86ccbbdf8ff26efcb7180ce9",
        "exact_app_manifest_sha256": "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434"})
    need(value["reviewed_predecessors"] == {
        "integration_three": {
            "capture_sha256": "3bb850fd925ceaf35b1061eeb7a81fa62678dabac7437a2b9f8ef4e7335e73ef",
            "verdict": "SOURCE_ACK_ROUTE_HOLD"},
        "playwright_inputs_three": {
            "capture_sha256": "cdb6ebf87623bf8f741ab94a2c513653035d7fcb567c4fc91859c58d551f5ebd",
            "verdict": "SOURCE_ACK_ROUTE_HOLD",
            "canonical_at_base": True,
            "outer_refetch_required": True}})
    expected_sources = {name: expected for name, (_, expected) in EXPECTED.items()}
    expected_sources["owned_process"] = {
        "path": "scripts/project-economy/auth-chain-cleanup-owned-process.py",
        "sha256": "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a",
        "git_blob_sha1": "11c764813b6ad04337d07ff89886602b98d1bea8",
        "bytes": 11439,
        "present_at_base": True,
    }
    need(value["reviewed_sources"] == expected_sources)
    need(value["node24"] == {"policy_sha256": "978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd",
        "archive_sha256": "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6",
        "version": "v24.21.0", "executable_sha256": None, "extraction_evidence_sha256": None})
    need(value["playwright"] == {"version": "1.55.0", "chromium_revision": "1187",
        "chromium_version": "140.0.7339.16", "archive_sha256": None}
         and value["required_sequence"] == SEQUENCE)
    need(value["workflow"] == {"path": None, "source_sha256": None, "runner": "ubuntu-24.04",
        "checkout_action": "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "persist_credentials": False, "admitted": False})
    need(value["admission"] == {"allowed": False, "blockers": BLOCKERS})
    for path, expected in (*EXPECTED.values(), *PREDECESSOR_EXPECTED.values()):
        need(digest(path) == expected)
    return value


def verify_terminal(receipts):
    need(type(receipts) is list and len(receipts) == len(SEQUENCE))
    for index, (purpose, receipt) in enumerate(zip(SEQUENCE, receipts), 1):
        need(type(receipt) is dict and set(receipt) == {"purpose", "serial", "complete"}
             and receipt == {"purpose": purpose, "serial": index, "complete": True})
    return {"schema": "compatible-full-app-native-integration-terminal.v1",
            "steps": len(SEQUENCE), "native_acceptance": False}


def main():
    try: load()
    except BaseException:
        print("FULL_APP_NATIVE_INTEGRATION_FOUR HOLD invalid_source_closure"); return 78
    print("FULL_APP_NATIVE_INTEGRATION_FOUR HOLD external_gates_required"); return 78


if __name__ == "__main__": raise SystemExit(main())
