"""Validate exact Node24/npm trust and SDK placement preparation; never fetch or place."""
import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent
NODE = ROOT / "compatible-eight-reader-full-app-node24-input-policy.json"
SDK = ROOT / "compatible-eight-reader-full-app-sdk-placement.json"
ADAPTER = ROOT.parent / "operations-economy/scripts/project-economy/compatible-eight-reader-full-app-long-process.py"
ADAPTER_SHA = "96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c"


def need(value):
    if value is not True:
        raise ValueError("compatible_full_app_input_policy_denied")


def pairs(items):
    value = {}
    for key, item in items:
        need(type(key) is str and key not in value)
        value[key] = item
    return value


def load(path):
    raw = path.read_bytes()
    need(0 < len(raw) <= 32768)
    return raw, json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))


def validate():
    node_raw, node = load(NODE); sdk_raw, sdk = load(SDK)
    need(set(node) == {"schema", "status", "platform", "distribution", "import_policy",
                       "npm_trust_policy", "adapter", "admission"})
    need(node["schema"] == "compatible-full-app-node-distribution-preparation.v1"
         and node["status"] == "source-locked-admission-blocked")
    distribution = node["distribution"]
    need(distribution["node_version"] == "v24.21.0" and distribution["npm_version"] == "11.19.0"
         and distribution["archive_name"] == "node-v24.21.0-linux-x64.tar.xz"
         and distribution["archive_url"] == "https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz"
         and distribution["archive_sha256"] == "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
         and distribution["release_manifest_url"].startswith("https://nodejs.org/dist/v24.21.0/"))
    need(node["platform"] == {"os": "linux", "architecture": "x64", "libc": "glibc"})
    trust = node["npm_trust_policy"]
    need(trust["registry_origin"] == "https://registry.npmjs.org/"
         and trust["proxy"] == "direct-only-all-proxy-environment-removed"
         and trust["redirect"] == "wrapper-must-deny-cross-origin-and-downgrade"
         and trust["cache"] == "fresh-private-empty-no-seed-no-restore"
         and trust["strict_ssl"] is True and trust["secrets"] == "none")
    adapter_raw = ADAPTER.read_bytes()
    need(hashlib.sha256(adapter_raw).hexdigest() == ADAPTER_SHA
         and re.search(rb'r"v22\\\.', adapter_raw) is not None
         and node["adapter"] == {"source_sha256": ADAPTER_SHA, "accepted_node_major": 22,
                                  "requested_node_major": 24, "compatible": False})
    need(node["admission"] == {"download": False, "extract": False, "npm_network": False,
                                "npm_ci": False, "sdk_test": False, "build": False,
                                "reason": "canonical_long_process_adapter_rejects_node24_and_reviewed_fetch_extract_wrapper_is_absent"})
    need(set(sdk) == {"schema", "status", "exact_app", "source", "destination", "receipt", "admission"})
    need(sdk["source"]["sha256"] == "03a96740aed709db4bb13a0dda8a7f49d4ba25ce7a641a5eb4c4f645c6880d23"
         and sdk["source"]["bytes"] == 8976
         and sdk["destination"]["relative_path"] == sdk["source"]["repository_path"]
         and sdk["destination"]["operation"] == "exclusive-create-from-captured-source-fd"
         and sdk["receipt"]["must_precede_long_process_source_fd_snapshot"] is True
         and sdk["admission"]["placement"] is False)
    return hashlib.sha256(node_raw).hexdigest(), hashlib.sha256(sdk_raw).hexdigest()


def main():
    try:
        node, sdk = validate()
        print("FULL_APP_INPUT_POLICY PASS source_only=true node_policy_sha256=" + node
              + " sdk_placement_sha256=" + sdk + " admission=false")
        return 0
    except BaseException:
        print("FULL_APP_INPUT_POLICY FAIL fixed_refusal", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
