from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-node24-acquisition-route.py"
PREPARATION = HERE.parent / "operations-node24-successor-stage" / "compatible-eight-reader-full-app-node24-preparation.py"
STATIC_OWNER = (HERE.parent / "operations-economy" / "scripts" / "project-economy" /
                "compatible-eight-reader-full-app-static-owner-node24.py")
SPEC = importlib.util.spec_from_file_location("node24_acquisition_route", SOURCE)
route = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(route)
OWNER_SPEC = importlib.util.spec_from_file_location("published_static_owner", STATIC_OWNER)
static_owner = importlib.util.module_from_spec(OWNER_SPEC)
OWNER_SPEC.loader.exec_module(static_owner)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write(path: Path, raw: bytes, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(raw)
    path.chmod(mode)


def ident(path: Path):
    return list(route.identity(path.lstat()))


class Fixture:
    def __init__(self, *, bad_fetch=False, bad_runner=False):
        self.root = Path(tempfile.mkdtemp(prefix="node24-route-test-"))
        self.root.chmod(0o700)
        self.attempt = self.root / route.ATTEMPT_LEAF
        self.attempt.mkdir(mode=0o700)
        acquisition = self.attempt / route.ACQUISITION_LEAF
        extraction = self.attempt / route.EXTRACTION_LEAF
        journal = self.attempt / route.JOURNAL_LEAF
        for directory in (acquisition, extraction, journal):
            directory.mkdir(mode=0o700)

        self.archive_raw = b"synthetic exact held archive bytes"
        self.archive_sha = digest(self.archive_raw)
        route.ARCHIVE_SHA256 = self.archive_sha
        self.archive = acquisition / route.ARCHIVE_NAME
        write(self.archive, self.archive_raw, 0o400)

        distribution = extraction / route.EXTRACTED_LEAF / route.ARCHIVE_ROOT
        node = distribution / route.NODE_PATH
        npm = distribution / route.NPM_PATH
        node.parent.mkdir(parents=True, mode=0o700)
        npm.parent.mkdir(parents=True, mode=0o700)
        self.node_raw = b"N" * 1_000_000
        self.npm_raw = b"npm synthetic cli"
        write(node, self.node_raw, 0o500)
        write(npm, self.npm_raw, 0o400)
        npm_link = distribution / route.NPM_LINK
        npm_link.symlink_to(route.NPM_LINK_TARGET)
        for directory in (distribution, distribution.parent, node.parent,
                          npm.parent, npm.parent.parent, npm.parent.parent.parent):
            directory.chmod(0o700)

        fetch = {
            "schema": "compatible-full-app-node-archive-fetch-receipt.v1",
            "url": route.ARCHIVE_URL,
            "redirects": 0,
            "bytes": len(self.archive_raw),
            "sha256": ("0" * 64 if bad_fetch else self.archive_sha),
            "proxy": "disabled",
            "bootstrap_ca_sha256": "a" * 64,
        }
        self.fetch_receipt = acquisition / route.FETCH_RECEIPT_LEAF
        write(self.fetch_receipt, canonical(fetch))

        extraction_receipt = {
            "schema": "compatible-full-app-node24-extraction-evidence.v1",
            "preparation_sha256": route.PREPARATION_SHA256,
            "policy_sha256": route.POLICY_SHA256,
            "archive_sha256": self.archive_sha,
            "archive_identity": ident(self.archive),
            "archive_root": route.ARCHIVE_ROOT,
            "distribution_root_identity": ident(distribution),
            "node_version": route.NODE_VERSION,
            "npm_version": route.NPM_VERSION,
            "members": 9,
            "expanded_bytes": len(self.node_raw) + len(self.npm_raw),
            "node": {"relative_path": route.NODE_PATH, "sha256": digest(self.node_raw),
                     "bytes": len(self.node_raw), "identity": ident(node)},
            "npm_cli": {"relative_path": route.NPM_PATH, "sha256": digest(self.npm_raw),
                        "bytes": len(self.npm_raw), "identity": ident(npm)},
            "npm_link": {"relative_path": route.NPM_LINK,
                         "target": route.NPM_LINK_TARGET, "identity": ident(npm_link)},
            "node_executed": False,
            "runtime_admission": False,
        }
        self.extraction_receipt = extraction / route.EXTRACTION_RECEIPT_LEAF
        write(self.extraction_receipt, canonical(extraction_receipt))
        self.distribution = distribution
        self.node = node
        self.npm = npm
        self.journal = journal
        self._runner(1, "node-version", ("v0.0.0\n" if bad_runner else route.NODE_VERSION + "\n").encode("ascii"))
        self._runner(2, "npm-version", (route.NPM_VERSION + "\n").encode("ascii"))

        paths = (self.root, self.attempt, self.archive, self.fetch_receipt,
                 self.extraction_receipt, self.distribution, self.node, self.npm,
                 self.journal)
        flags = (os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_NOFOLLOW,
                 os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.fds = [os.open(path, flag) for path, flag in zip(paths, flags)]

    def _runner(self, serial, purpose, output):
        prefix = "long-command-%d-%s" % (serial, purpose)
        empty_sha = digest(b"")
        base = {
            "schema": "compatible-full-app-long-process-receipt.v1",
            "purpose": purpose,
            "serial": serial,
            "pid": 4100 + serial,
            "starttime": 9000 + serial,
            "policy_sha256": "c" * 64,
            "node_sha256": digest(self.node_raw),
            "npm_cli_sha256": digest(self.npm_raw),
            "npm_trust_evidence_sha256": "d" * 64,
            "stdout_bytes": len(output),
            "stdout_sha256": digest(output),
            "stderr_bytes": 0,
            "stderr_sha256": empty_sha,
            "cleanup_complete": True,
        }
        base_raw = canonical(base)
        supplemental = dict(base)
        supplemental.update({
            "schema": "compatible-full-app-long-process-node24-receipt.v1",
            "base_adapter_sha256": route.BASE_ADAPTER_SHA256,
            "base_receipt_sha256": digest(base_raw),
            "distribution_archive_sha256": self.archive_sha,
            "node_version": route.NODE_VERSION,
            "npm_version": route.NPM_VERSION,
            "origin_guard_sha256": route.ORIGIN_GUARD_SHA256,
        })
        pid = 4100 + serial
        owner = {"schema": "auth-chain-command-owner.v1", "pid": pid,
                 "starttime": 9000 + serial, "pgid": pid, "sid": pid}
        closed = dict(owner)
        closed["schema"] = "auth-chain-command-closed.v1"
        for suffix, raw in ((".receipt.json", base_raw),
                            (".node24.receipt.json", canonical(supplemental)),
                            (".out", output), (".err", b""),
                            (".owner.json", canonical(owner)),
                            (".closed.json", canonical(closed))):
            write(self.journal / (prefix + suffix), raw)

    def args(self):
        return (PREPARATION.read_bytes(), *self.fds)

    def close(self):
        for fd in self.fds:
            try:
                os.close(fd)
            except OSError:
                pass
        shutil.rmtree(self.root, ignore_errors=True)


class AcquisitionRouteTests(unittest.TestCase):
    def tearDown(self):
        route.ARCHIVE_SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"

    def test_join_emits_bound_tool_and_static_owner_evidence_but_never_launches(self):
        value = Fixture()
        try:
            result = route.join_route(*value.args())
            self.assertEqual(set(result), {"node", "npm", "owner", "route"})
            node = json.loads(result["node"])
            npm = json.loads(result["npm"])
            owner = json.loads(result["owner"])
            joined = json.loads(result["route"])
            self.assertEqual((node["tool"], node["version"]), ("node", route.NODE_VERSION))
            self.assertEqual((npm["tool"], npm["version"]), ("npm", route.NPM_VERSION))
            self.assertEqual(owner["schema"], "compatible-full-app-node24-executable-evidence.v1")
            self.assertEqual(owner["adapter_sha256"], route.NODE24_ADAPTER_SHA256)
            with mock.patch.object(static_owner, "NODE_ARCHIVE_SHA256", value.archive_sha):
                parsed = static_owner.parse_node_evidence(result["owner"], digest(result["owner"]))
            self.assertEqual(parsed, owner)
            self.assertFalse(joined["sdk_routing"])
            self.assertFalse(joined["immutable_source_root_bound"])
            self.assertFalse(joined["writable_build_root_or_overlay_bound"])
            self.assertFalse(joined["source_to_build_derivation_bound"])
            self.assertFalse(joined["read_only_tree_bound"])
            self.assertFalse(joined["launch_admitted"])
            self.assertFalse(joined["runtime_admission"])
            self.assertIn("exact2445_root_has_no_scripts_directory_use_separate_verified_sdk_package_root",
                          joined["blockers"])
            self.assertIn("immutable_source_root_must_not_be_npm_ci_or_build_cwd",
                          joined["blockers"])
            for leaf in route.OUTPUTS.values():
                self.assertEqual(stat.S_IMODE((value.attempt / leaf).stat().st_mode), 0o600)
        finally:
            value.close()

    def test_false_acquisition_receipt_discards_the_whole_attempt(self):
        value = Fixture(bad_fetch=True)
        try:
            with self.assertRaisesRegex(
                    route.RouteFailure,
                    "^compatible_full_app_node24_acquisition_route_denied$"):
                route.join_route(*value.args())
            self.assertFalse(value.attempt.exists())
            self.assertTrue((value.root / route.QUARANTINE_LEAF).is_dir())
            self.assertGreater(os.fstat(value.fds[1]).st_nlink, 0)
            self.assertGreater(os.fstat(value.fds[5]).st_nlink, 0)
        finally:
            value.close()

    def test_substituted_external_node_fd_discards_the_whole_attempt(self):
        value = Fixture()
        outside = value.root / "outside-node"
        write(outside, value.node_raw, 0o500)
        outside_fd = os.open(outside, os.O_RDONLY | os.O_NOFOLLOW)
        args = list(value.args())
        args[7] = outside_fd
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*args)
            self.assertFalse(value.attempt.exists())
        finally:
            os.close(outside_fd)
            value.close()

    def test_runner_output_mismatch_discards_the_whole_attempt(self):
        value = Fixture(bad_runner=True)
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*value.args())
            self.assertFalse(value.attempt.exists())
        finally:
            value.close()

    def test_output_write_failure_discards_partial_outputs_and_attempt(self):
        value = Fixture()
        original = route._write_once
        calls = 0

        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise route.RouteFailure("synthetic write failure")
            return original(*args, **kwargs)

        try:
            with mock.patch.object(route, "_write_once", side_effect=fail_second):
                with self.assertRaisesRegex(route.RouteFailure,
                                            "^synthetic write failure$"):
                    route.join_route(*value.args())
            self.assertFalse(value.attempt.exists())
        finally:
            value.close()

    def test_unexpected_layout_discards_without_leaking_internal_fds(self):
        value = Fixture()
        write(value.attempt / "unexpected", b"unexpected")
        before = len(os.listdir("/proc/self/fd"))
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*value.args())
            self.assertEqual(len(os.listdir("/proc/self/fd")), before)
            self.assertFalse(value.attempt.exists())
        finally:
            value.close()

    def test_unbound_attempt_is_never_deleted(self):
        value = Fixture()
        alien = value.root / "alien"
        alien.mkdir(mode=0o700)
        alien_fd = os.open(alien, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        args = list(value.args())
        args[2] = alien_fd
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*args)
            self.assertTrue(value.attempt.is_dir())
            self.assertTrue(alien.is_dir())
        finally:
            os.close(alien_fd)
            value.close()

    def test_hardlink_failure_is_quarantined_without_deleting_either_link(self):
        value = Fixture(bad_fetch=True)
        linked = value.attempt / "unsafe-link"
        outside = value.root / "outside"
        outside.write_bytes(b"outside")
        os.link(outside, linked)
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*value.args())
            self.assertFalse(value.attempt.exists())
            self.assertTrue((value.root / route.QUARANTINE_LEAF / "unsafe-link").exists())
            self.assertTrue(outside.exists())
            self.assertEqual(outside.stat().st_nlink, 2)
        finally:
            value.close()

    def test_top_level_substitution_cannot_fake_original_attempt_removal(self):
        value = Fixture(bad_fetch=True)
        real_quarantine = route._rename_noreplace
        moved = value.root / "renamed-original-attempt"

        def swap_before_quarantine(parent_fd, source, destination):
            os.rename(source, moved.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
            os.mkdir(source, mode=0o700, dir_fd=parent_fd)
            replacement_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY,
                                     dir_fd=parent_fd)
            try:
                marker = os.open("replacement-marker",
                                 os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                                 0o600, dir_fd=replacement_fd)
                os.close(marker)
            finally:
                os.close(replacement_fd)
            return real_quarantine(parent_fd, source, destination)

        try:
            with mock.patch.object(route, "_rename_noreplace",
                                   side_effect=swap_before_quarantine):
                with self.assertRaisesRegex(route.RouteFailure, "cleanup_incomplete"):
                    route.join_route(*value.args())
            self.assertTrue(moved.is_dir())
            self.assertGreater(os.fstat(value.fds[1]).st_nlink, 0)
            self.assertFalse(value.attempt.exists())
            self.assertTrue((value.root / route.QUARANTINE_LEAF /
                             "replacement-marker").is_file())
        finally:
            value.close()

    def test_quarantine_never_unlinks_or_rmdirs_failure_material(self):
        value = Fixture(bad_fetch=True)
        try:
            with self.assertRaises(route.RouteFailure):
                route.join_route(*value.args())
            retained = (value.root / route.QUARANTINE_LEAF / route.ACQUISITION_LEAF /
                        route.ARCHIVE_NAME)
            self.assertEqual(retained.read_bytes(), value.archive_raw)
            self.assertGreater(os.fstat(value.fds[2]).st_nlink, 0)
            source = SOURCE.read_text("utf-8")
            self.assertNotIn("os.unlink", source)
            self.assertNotIn("os.rmdir", source)
        finally:
            value.close()

    def test_closed_layout_scan_stops_at_exact_expected_entry_cap(self):
        value = Fixture()
        write(value.attempt / "unexpected-one", b"one")
        write(value.attempt / "unexpected-two", b"two")
        try:
            with self.assertRaises(route.RouteFailure):
                route._exact_names(value.fds[1], route.Deadline(1), {
                    route.ACQUISITION_LEAF, route.EXTRACTION_LEAF, route.JOURNAL_LEAF,
                })
        finally:
            value.close()

    def test_fixed_cli_hold_and_no_process_or_ambient_executable_primitive(self):
        self.assertEqual(route.main(), 78)
        source = SOURCE.read_text("utf-8")
        for forbidden in ("import subprocess", "Popen(", "os.exec", "spawn(",
                          "shell=True", "'/usr/bin", '"/usr/bin'):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
