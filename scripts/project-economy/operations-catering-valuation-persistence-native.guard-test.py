#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "scripts/project-economy/operations-catering-valuation-persistence-native.sh"
ADMISSION = ROOT / "scripts/project-economy/operations-catering-valuation-persistence-image-admission.json"
WORKFLOW = ROOT / ".github/workflows/operations-catering-valuation-census-persistence-native.yml"
CENSUS = ROOT / "supabase/functions/_shared/catering-valuation-source-census.ts"
CATERING_EVIDENCE = ROOT / "supabase/functions/_shared/catering-project-evidence.ts"
PERSONNEL = ROOT / "supabase/functions/_shared/project-personnel-cost.ts"


class NativeGuardTest(unittest.TestCase):
    def test_exact_runtime_import_closure_is_pinned(self) -> None:
        census = CENSUS.read_text()
        catering = CATERING_EVIDENCE.read_text()
        self.assertEqual(census.count('from "./catering-project-evidence.ts"'), 1)
        self.assertEqual(catering.count("from './project-personnel-cost.ts'"), 1)
        workflow = WORKFLOW.read_text()
        expected = {
            "supabase/functions/_shared/catering-project-evidence.ts":
                "0760348b57475c334abfce43b846d4136eb05ada1c99bc244ae7179e6815362a",
            "supabase/functions/_shared/project-personnel-cost.ts":
                "69c7a35c9e144b20c4db3938d61d96b519a1419b27e7689e39c48d58635b2870",
        }
        for path, digest in expected.items():
            self.assertIn(f"- '{path}'", workflow)
            self.assertIn(f'sha256sum {path}', workflow)
            self.assertIn(digest, workflow)

    def test_blocked_admission_is_closed_and_complete(self) -> None:
        value = json.loads(ADMISSION.read_bytes())
        self.assertEqual(value["authority"], "blocked_missing_reviewed_registry_and_publisher_evidence")
        self.assertIsNone(value["verified_config_digest"])
        self.assertIsNone(value["publisher_signature_bundle_sha256"])
        self.assertIn("cannot authorize", value["nonclaims"][-1])

    def test_workflow_has_no_pre_step_service(self) -> None:
        text = WORKFLOW.read_text()
        self.assertNotIn("services:", text)
        self.assertIn("runs-on: ubuntu-24.04", text)
        self.assertIn("node-version: '24.21.0'", text)
        self.assertIn("persist-credentials: false", text)
        self.assertNotIn("postgres:15.19\n", text)

    def test_launcher_checks_admission_before_docker(self) -> None:
        text = LAUNCHER.read_text()
        admission = text.index('mapfile -t admission')
        private_root = text.index('readonly PRIVATE_ROOT')
        first_daemon = text.index('exec dockerd')
        first_pull = text.index('docker_exact pull')
        self.assertLess(admission, private_root)
        self.assertLess(private_root, first_daemon)
        self.assertLess(first_daemon, first_pull)

    def test_every_post_bind_docker_call_uses_gateway(self) -> None:
        text = LAUNCHER.read_text()
        calls = [line.strip() for line in text.splitlines() if "docker " in line]
        allowed = (
            'docker --host "unix://$PRIVATE_SOCKET"', "sudo dockerd", "# A private daemon",
            "# Synthetic-only", "# available. No Docker",
        )
        self.assertTrue(calls)
        self.assertTrue(all(any(item in line for item in allowed) for line in calls), calls)
        self.assertGreaterEqual(text.count("docker_exact "), 13)
        self.assertIn("docker_cleanup", text)

    def test_exact_platform_and_private_inventory_are_enforced(self) -> None:
        text = LAUNCHER.read_text()
        self.assertIn('docker_exact pull --platform "$EXPECTED_PLATFORM" "$IMAGE_REF"', text)
        self.assertIn('container_id="$(docker_exact create \\', text)
        self.assertIn('--platform "$EXPECTED_PLATFORM"', text)
        self.assertGreaterEqual(text.count("volume ls --quiet"), 2)
        self.assertIn("image-config-chain", text)
        self.assertIn("image-command", text)
        self.assertIn("postgres-version", text)

    def test_success_cleanup_accounts_for_private_evidence(self) -> None:
        text = LAUNCHER.read_text()
        self.assertNotIn("rm -rf", text)
        self.assertIn("os.open(root, os.O_RDONLY | os.O_DIRECTORY", text)
        self.assertIn("if set(os.listdir(root_fd)) != set(names)", text)
        self.assertIn("os.unlink(name, dir_fd=root_fd)", text)
        self.assertIn("if os.fstat(fd).st_nlink != 0", text)
        self.assertIn("private_mount_ok || original=74", text)
        self.assertIn('rmdir -- "$PRIVATE_ROOT" || original=74', text)
        self.assertLess(text.index('rmdir -- "$PRIVATE_ROOT"'), text.index("operations_catering_two_booking_persistence_native PASS"))

    def test_open_admission_requires_exact_raw_evidence_closure(self) -> None:
        text = LAUNCHER.read_text()
        for name in (
            "registry-oci-chain.json",
            "publisher-signature.dsse.json",
            "trusted-time.json",
            "verification-policy.json",
        ):
            self.assertIn(name, text)
        self.assertIn("os.O_NOFOLLOW", text)
        self.assertIn("identity(before) != identity(after)", text)
        self.assertIn("Byte closure alone is never signature/provenance authority", text)
        self.assertIn("raise SystemExit(73)", text)

    def test_source_and_sql_are_materialized_from_held_exact_bytes(self) -> None:
        text = LAUNCHER.read_text()
        self.assertIn('"$MIGRATION_PATH" "$EXPECTED_MIGRATION_SHA256" "$PRIVATE_MIGRATION"', text)
        self.assertIn('"$SQL_PATH" "$EXPECTED_SQL_SHA256" "$PRIVATE_SQL"', text)
        self.assertIn("if identity(before) != identity(after) or identity(after) != identity(current)", text)
        self.assertIn("EXPECTED_DRIVER_SHA256", text)
        self.assertIn('cat "$PRIVATE_DRIVER"', text)
        self.assertNotIn('<"$SQL_PATH"', text)

    def test_runtime_has_hard_resource_and_time_limits(self) -> None:
        text = LAUNCHER.read_text()
        for token in (
            "--memory 805306368",
            "--memory-swap 805306368",
            "--cpus 1.0",
            "--pids-limit 256",
            "--ulimit nofile=1024:1024",
            "statement_timeout=30000",
            "lock_timeout=5000",
            "idle_in_transaction_session_timeout=30000",
            "timeout --signal=TERM --kill-after=5s",
        ):
            self.assertIn(token, text)
        self.assertIn("container-limits", text)
        self.assertIn("postgres-timeouts", text)

    def test_private_daemon_endpoint_is_bound_before_and_after_every_call(self) -> None:
        text = LAUNCHER.read_text()
        self.assertIn("socket_dev", text)
        self.assertIn("socket_ino", text)
        self.assertGreaterEqual(text.count("env -u DOCKER_CONTEXT -u DOCKER_HOST"), 5)
        self.assertGreaterEqual(text.count('docker --host "unix://$PRIVATE_SOCKET"'), 5)
        self.assertGreaterEqual(text.count("process_epoch"), 8)
        gateway = text[text.index("docker_exact()") : text.index("docker_cleanup()")]
        self.assertGreaterEqual(gateway.count("docker_info_id"), 2)
        self.assertGreaterEqual(gateway.count("process_epoch"), 2)

    def test_pass_marker_is_emitted_only_from_cleanup(self) -> None:
        text = LAUNCHER.read_text()
        self.assertEqual(text.count("operations_catering_two_booking_persistence_native PASS"), 1)
        cleanup_start = text.index("cleanup()")
        marker = text.index("operations_catering_two_booking_persistence_native PASS")
        success_assignment = text.rindex("success=true")
        self.assertLess(cleanup_start, marker)
        self.assertLess(marker, success_assignment)

    def test_blocked_manifest_exits_before_fake_docker(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            marker = root / "docker-called"
            sudo_marker = root / "sudo-called"
            fake = root / "docker"
            fake.write_text(f"#!/bin/sh\ntouch {marker}\nexit 99\n")
            fake.chmod(0o700)
            fake_sudo = root / "sudo"
            fake_sudo.write_text(f"#!/bin/sh\ntouch {sudo_marker}\nexit 99\n")
            fake_sudo.chmod(0o700)
            digest = hashlib.sha256(ADMISSION.read_bytes()).hexdigest()
            env = dict(os.environ)
            env.update({
                "PATH": f"{root}:{env['PATH']}",
                "RUNNER_TEMP": str(root),
                "OPERATIONS_CATERING_EXPECTED_ADMISSION_SHA256": digest,
            })
            result = subprocess.run(
                ["bash", str(LAUNCHER)],
                cwd=ROOT,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(result.returncode, 73, result.stderr)
            self.assertFalse(marker.exists())
            self.assertFalse(sudo_marker.exists())
            self.assertIn("phase=admission-schema", result.stderr)

    def test_source_files_are_not_group_or_world_writable(self) -> None:
        for path in (LAUNCHER, ADMISSION, WORKFLOW, CENSUS, CATERING_EVIDENCE, PERSONNEL, pathlib.Path(__file__)):
            mode = stat.S_IMODE(path.stat().st_mode)
            self.assertEqual(mode & 0o022, 0, (path, oct(mode)))


if __name__ == "__main__":
    unittest.main()
