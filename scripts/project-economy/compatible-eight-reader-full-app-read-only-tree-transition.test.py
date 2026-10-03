"""Local support/negative tests only; no genuine 2445 tree or runtime admission."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-read-only-tree-transition.py"
MANIFEST = (HERE.parent / "operations-economy/scripts/project-economy/"
            "compatible-eight-reader-full-app-compilemanifest.json")
spec = importlib.util.spec_from_file_location("read_only_transition", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Controls(unittest.TestCase):
    def test_exact_manifest_and_projection_parse_to_2445_files_and_220_directories(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(len(raw), 462_352)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.APP_MANIFEST_SHA256)
        rows, directories = m.parse_manifest(raw)
        self.assertEqual(len(rows), 2_445)
        self.assertEqual(sum(row["bytes"] for row in rows.values()), 20_984_073)
        self.assertEqual(len(directories), 220)

    def fixture(self, extra=False, wrong_mode=False):
        temporary = tempfile.TemporaryDirectory()
        parent = Path(temporary.name).resolve()
        parent.chmod(0o700)
        root = parent / m.ROOT_LEAF
        root.mkdir(mode=0o700)
        sub = root / "sub"
        sub.mkdir(mode=0o700)
        bodies = {"a.txt": b"alpha", "sub/b.txt": b"beta"}
        rows = []
        for name, body in bodies.items():
            path = root / name
            path.write_bytes(body)
            path.chmod(0o644 if wrong_mode and name == "a.txt" else 0o600)
            rows.append({
                "path": name, "mode": "100644", "bytes": len(body),
                "git_blob_sha1": hashlib.sha1(
                    b"blob " + str(len(body)).encode("ascii") + b"\0" + body
                ).hexdigest(),
            })
        if extra:
            (root / "extra.txt").write_bytes(b"extra")
            (root / "extra.txt").chmod(0o600)
        document = {
            "schema": "operations-compatible-eight-reader-full-app-compile-source.v1",
            "repository": "BillyHamren1/kalender-vyer-mix",
            "source_commit": m.SOURCE_COMMIT,
            "source_tree": m.SOURCE_TREE,
            "tree_truncated": False,
            "coverage": "synthetic",
            "source_body_retrieval_claim": "synthetic",
            "runtime_admission": False,
            "files": rows,
        }
        manifest = json.dumps(document, sort_keys=True, separators=(",", ":")).encode("ascii")
        projection = bytearray()
        for row in sorted(rows, key=lambda value: value["path"]):
            projection.extend((row["path"] + "\0" + row["git_blob_sha1"] + "\0" +
                               str(row["bytes"]) + "\0" + row["mode"] + "\n").encode("ascii"))
        materializer = {
            "schema": "compatible-full-app-materializer-evidence.v1",
            "app_manifest_sha256": hashlib.sha256(manifest).hexdigest(),
            "materialized_root_identity": list(m.identity(root.stat())),
            "source_files": 2,
            "source_bytes": 9,
        }
        materializer_raw = json.dumps(materializer, sort_keys=True,
                                      separators=(",", ":")).encode("ascii")
        receipt = parent / m.MATERIALIZER_LEAF
        receipt.write_bytes(materializer_raw)
        receipt.chmod(0o600)
        patches = (
            mock.patch.object(m, "APP_MANIFEST_SHA256", hashlib.sha256(manifest).hexdigest()),
            mock.patch.object(m, "MANIFEST_PROJECTION_SHA256",
                              hashlib.sha256(projection).hexdigest()),
            mock.patch.object(m, "SOURCE_FILES", 2),
            mock.patch.object(m, "SOURCE_BYTES", 9),
            mock.patch.object(m, "SOURCE_DIRECTORIES", 1),
            mock.patch.object(m, "MAX_SECONDS", 10),
        )
        return temporary, parent, root, manifest, materializer_raw, patches

    def run_transition(self, fixture):
        temporary, parent, root, manifest, materializer, patches = fixture
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            raw = m.transition_tree(manifest, materializer, parent)
        return temporary, parent, root, raw

    def test_success_authorizes_only_mode_and_ctime_and_persists_bound_receipts(self):
        temporary, parent, root, raw = self.run_transition(self.fixture())
        try:
            value = json.loads(raw)
            self.assertEqual(value["schema"], "compatible-full-app-read-only-tree-evidence.v2")
            self.assertEqual(value["authorized_identity_changes"], ["mode", "ctime_ns"])
            self.assertTrue(value["full_tree_read_only"])
            self.assertFalse(value["immutable_filesystem"])
            self.assertEqual(value["root_purpose"], "immutable_source_snapshot_only")
            self.assertFalse(value["same_root_install_or_build"])
            self.assertTrue(value["derived_writable_build_root_required"])
            self.assertFalse(value["derived_writable_build_root_admission"])
            self.assertFalse(value["post_build_dist_verification"])
            self.assertFalse(value["runtime_admission"])
            self.assertEqual(root.stat().st_mode & 0o777, 0o500)
            self.assertEqual((root / "sub").stat().st_mode & 0o777, 0o500)
            self.assertEqual((root / "a.txt").stat().st_mode & 0o777, 0o400)
            self.assertEqual((root / "sub/b.txt").stat().st_mode & 0o777, 0o400)
            self.assertEqual((parent / m.RECEIPT_LEAF).read_bytes(), raw)
            self.assertTrue((parent / m.STARTED_LEAF).is_file())
            started = json.loads((parent / m.STARTED_LEAF).read_bytes())
            self.assertEqual(started["schema"],
                             "compatible-full-app-read-only-tree-transition-started.v2")
            self.assertEqual(started["root_purpose"], "immutable_source_snapshot_only")
            self.assertFalse(started["same_root_install_or_build"])
            self.assertTrue(started["derived_writable_build_root_required"])
            self.assertFalse(started["derived_writable_build_root_admission"])
            self.assertFalse(started["post_build_dist_verification"])
        finally:
            temporary.cleanup()

    def test_partial_file_chmod_failure_leaves_started_marker_and_no_final_receipt(self):
        fixture = self.fixture()
        temporary, parent, root, manifest, materializer, patches = fixture
        original = m.os.fchmod
        transitions = 0

        def fail_second(fd, mode):
            nonlocal transitions
            if mode in (0o400, 0o500):
                transitions += 1
                if transitions == 2:
                    raise OSError("synthetic-partial-transition")
            return original(fd, mode)

        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
                    mock.patch.object(m.os, "fchmod", side_effect=fail_second):
                with self.assertRaises(OSError):
                    m.transition_tree(manifest, materializer, parent)
            self.assertTrue((parent / m.STARTED_LEAF).is_file())
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
            self.assertEqual((root / "a.txt").stat().st_mode & 0o777, 0o400)
            # The producer has no delete authority. The caller discards this
            # entire synthetic attempt rather than retrying in place.
            shutil.rmtree(root)
            self.assertFalse(root.exists())
        finally:
            temporary.cleanup()

    def test_path_replacement_before_chmod_is_denied(self):
        fixture = self.fixture()
        temporary, parent, root, manifest, materializer, patches = fixture
        original = m._chmod_node
        replaced = False

        def replace(root_fd, relative, current, target_mode, want_directory, deadline, rows):
            nonlocal replaced
            if not replaced and not want_directory:
                path = root / relative
                body = path.read_bytes()
                path.unlink()
                path.write_bytes(body)
                path.chmod(0o600)
                replaced = True
            return original(root_fd, relative, current, target_mode, want_directory, deadline, rows)

        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
                    mock.patch.object(m, "_chmod_node", side_effect=replace):
                with self.assertRaises(m.TransitionFailure):
                    m.transition_tree(manifest, materializer, parent)
            self.assertTrue(replaced)
            self.assertTrue((parent / m.STARTED_LEAF).exists())
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_wrong_pre_mode_is_denied_before_started_marker(self):
        fixture = self.fixture(wrong_mode=True)
        temporary, parent, _root, manifest, materializer, patches = fixture
        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
                with self.assertRaises(m.TransitionFailure):
                    m.transition_tree(manifest, materializer, parent)
            self.assertFalse((parent / m.STARTED_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_extra_path_is_denied_before_started_marker(self):
        fixture = self.fixture(extra=True)
        temporary, parent, _root, manifest, materializer, patches = fixture
        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
                with self.assertRaises(m.TransitionFailure):
                    m.transition_tree(manifest, materializer, parent)
            self.assertFalse((parent / m.STARTED_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_scan_uses_streaming_global_cap_not_unbounded_listdir(self):
        source = SOURCE.read_text()
        self.assertNotIn("os.listdir", source)
        self.assertIn("with os.scandir(fd) as entries:", source)
        fixture = self.fixture(extra=True)
        temporary, parent, _root, manifest, materializer, patches = fixture
        visited = 0
        original_stat = m.os.stat

        def count_stat(*args, **kwargs):
            nonlocal visited
            if kwargs.get("dir_fd") is not None:
                visited += 1
            return original_stat(*args, **kwargs)

        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
                    mock.patch.object(m.os, "stat", side_effect=count_stat):
                with self.assertRaises(m.TransitionFailure):
                    m.transition_tree(manifest, materializer, parent)
            # The fourth tree entry trips the global expected 2+1 cap before
            # any body scan can grow without bound.
            self.assertLess(visited, 16)
            self.assertFalse((parent / m.STARTED_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_materializer_receipt_mismatch_is_denied(self):
        fixture = self.fixture()
        temporary, parent, _root, manifest, materializer, patches = fixture
        changed = json.loads(materializer)
        changed["source_bytes"] += 1
        changed_raw = json.dumps(changed, sort_keys=True, separators=(",", ":")).encode("ascii")
        try:
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
                with self.assertRaises(m.TransitionFailure):
                    m.transition_tree(manifest, changed_raw, parent)
            self.assertFalse((parent / m.STARTED_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_existing_started_or_final_receipt_refuses_without_overwrite(self):
        for leaf in (m.STARTED_LEAF, m.RECEIPT_LEAF):
            with self.subTest(leaf=leaf):
                fixture = self.fixture()
                temporary, parent, _root, manifest, materializer, patches = fixture
                existing = parent / leaf
                existing.write_bytes(b"existing")
                existing.chmod(0o600)
                try:
                    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
                        with self.assertRaises(FileExistsError):
                            m.transition_tree(manifest, materializer, parent)
                    self.assertEqual(existing.read_bytes(), b"existing")
                    self.assertFalse((parent / m.STARTED_LEAF).exists() if leaf == m.RECEIPT_LEAF else False)
                finally:
                    temporary.cleanup()

    def test_authorized_transition_rejects_each_stable_field_and_ctime_regression(self):
        before = [1, 2, os.geteuid(), os.getegid(), stat.S_IFREG | 0o600, 1, 5, 7, 9]
        after = list(before)
        after[4] = stat.S_IFREG | 0o400
        after[8] = 10
        self.assertTrue(m._authorized(tuple(before), tuple(after), 0o400))
        for index, field in enumerate(m.FIELDS):
            if field in ("st_mode", "st_ctime_ns"):
                continue
            with self.subTest(field=field):
                changed = list(after)
                changed[index] += 1
                self.assertFalse(m._authorized(tuple(before), tuple(changed), 0o400))
        changed = list(after)
        changed[8] = 8
        self.assertFalse(m._authorized(tuple(before), tuple(changed), 0o400))
        changed = list(after)
        changed[4] = stat.S_IFREG | 0o500
        self.assertFalse(m._authorized(tuple(before), tuple(changed), 0o400))

    def test_duplicate_json_keys_and_constants_are_denied(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}'):
            with self.subTest(raw=raw), self.assertRaises(m.TransitionFailure):
                m.parse_json(raw, 100)

    def test_main_is_fixed_unrouted_refusal(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output):
            self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(),
                         "compatible-full-app-read-only-tree-transition FAIL unrouted_exact_tree_required\n")


if __name__ == "__main__":
    unittest.main()
