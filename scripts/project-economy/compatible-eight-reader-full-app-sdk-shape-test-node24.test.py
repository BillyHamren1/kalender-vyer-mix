from __future__ import annotations

import hashlib
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-sdk-shape-test-node24.mjs"
PREDECESSOR = HERE / "compatible-eight-reader-full-app-sdk-shape-test.mjs"
if not PREDECESSOR.is_file():
    PREDECESSOR = (HERE.parent / "operations-economy" / "scripts" / "project-economy" /
                   "compatible-eight-reader-full-app-sdk-shape-test.mjs")
PREDECESSOR_SHA256 = "03a96740aed709db4bb13a0dda8a7f49d4ba25ce7a641a5eb4c4f645c6880d23"
SDK_SOURCE = PREDECESSOR.with_name("compatible-eight-reader-full-app-sdk-source.mjs")


class Node24SdkShapeSourceTests(unittest.TestCase):
    def test_successor_is_exact_four_replacement_delta(self):
        predecessor = PREDECESSOR.read_bytes()
        self.assertEqual(hashlib.sha256(predecessor).hexdigest(), PREDECESSOR_SHA256)
        expected = predecessor.replace(
            b"// NEW source-unit boundary: real locked SDK + unchanged source service builders.",
            b"// NEW Node24 source-unit boundary: real locked SDK + unchanged source service builders.",
        ).replace(
            b"Number(process.versions.node.split('.')[0]) !== 22",
            b"process.version !== 'v24.21.0'",
        ).replace(
            b"compatible-full-app-sdk-shape FAIL fixed_refusal",
            b"compatible-full-app-sdk-shape-node24 FAIL fixed_refusal",
        ).replace(
            b"compatible-full-app-sdk-shape PASS sdk=2.116.0",
            b"compatible-full-app-sdk-shape-node24 PASS node=v24.21.0 sdk=2.116.0",
        )
        self.assertEqual(SOURCE.read_bytes(), expected)

    def test_exact_node_version_not_major_range_is_required(self):
        source = SOURCE.read_text("utf-8")
        self.assertIn("process.version !== 'v24.21.0'", source)
        self.assertNotIn("versions.node.split", source)
        self.assertNotIn("!== 22", source)

    def test_sdk_source_manifest_lock_and_denials_are_unchanged(self):
        source = SOURCE.read_text("utf-8")
        for literal in (
            "4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434",
            "56cbf67ce03fd29258acc38ad723e13fa0ab7d6e",
            "source_files=2445", "services=9", "forwarded=9",
            "auth=false native=false app=false",
            "sdk_shape_unit_refusal", "status: 403",
        ):
            self.assertIn(literal, source)
        for forbidden in ("signInWithPassword", "signUp(", "deploy", "publish",
                          "invoice", "payment"):
            self.assertNotIn(forbidden, source)

    def test_non_exact_ambient_node_fails_before_positive_import(self):
        runtime = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")
        self.assertTrue(runtime and Path(runtime).is_file())
        version = subprocess.run([runtime, "--version"], check=True, text=True,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 timeout=5).stdout.strip()
        self.assertNotEqual(version, "v24.21.0")
        environment = {"CI": "true", "PATH": ""}
        with tempfile.TemporaryDirectory(prefix="sdk-node24-negative-") as temporary:
            isolated = Path(temporary)
            target = isolated / SOURCE.name
            shutil.copyfile(SOURCE, target)
            shutil.copyfile(SDK_SOURCE, isolated / SDK_SOURCE.name)
            result = subprocess.run([runtime, str(target)], text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    env=environment, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout,
                         "compatible-full-app-sdk-shape-node24 FAIL fixed_refusal\n")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main()
