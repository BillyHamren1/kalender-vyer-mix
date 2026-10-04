"""Local held-FD support/negative tests; no genuine App tree or build claim."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-materializer-evidence.py"
VERIFIER = HERE.parent / "operations-economy/scripts/project-economy/compatible-eight-reader-full-app-source.py"
MANIFEST = HERE.parent / "operations-economy/scripts/project-economy/compatible-eight-reader-full-app-compilemanifest.json"
spec = importlib.util.spec_from_file_location("materializer_evidence_v2", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


EXACT_RESULT = {
    "schema": "compatible-full-app-source-body-verified.v1",
    "commit": m.SOURCE_COMMIT,
    "tree": m.SOURCE_TREE,
    "files": m.SOURCE_FILES,
    "bytes": m.SOURCE_BYTES,
    "cold_compile": False,
    "native_app": False,
}


class MiniDeadline:
    def check(self):
        return None


class MiniHeldVerifier:
    Deadline = MiniDeadline

    def __init__(self, action=None):
        self.action = action
        self.observed_inode = None

    @staticmethod
    def identity(value):
        # Intentionally models an ABA-tolerant outer identity check. The held FD
        # must still choose the original directory and bytes.
        return (value.st_dev, value.st_ino)

    @staticmethod
    def selected(name):
        return name == "package.json"

    def leaf(self, root_fd, name, maximum, deadline):
        if self.action is not None:
            self.action(root_fd)
        self.observed_inode = os.fstat(root_fd).st_ino
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=root_fd)
        try:
            return os.read(fd, maximum + 1)
        finally:
            os.close(fd)

    @staticmethod
    def inventory(_root_fd, _deadline):
        return {"package.json"}


class Controls(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        parent = Path(temporary.name).resolve()
        parent.chmod(0o700)
        root = parent / m.ROOT_LEAF
        root.mkdir(mode=0o700)
        root.chmod(0o700)
        return temporary, parent, root

    def test_exact_frozen_verifier_loads_and_mutation_refuses(self):
        raw = VERIFIER.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.VERIFIER_SHA256)
        verifier = m.load_verifier(raw)
        self.assertTrue(callable(verifier.leaf))
        self.assertTrue(callable(verifier.inventory))
        with self.assertRaises(m.EvidenceFailure):
            m.load_verifier(raw + b" ")

    def test_exact_manifest_is_pinned(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(len(raw), 462_352)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.APP_MANIFEST_SHA256)

    def test_emit_uses_held_verifier_and_writes_exclusive_bound_receipt(self):
        temporary, parent, root = self.fixture()
        try:
            calls = []

            def held(_verifier, root_fd, root_saved, manifest_raw):
                calls.append((os.fstat(root_fd).st_ino, root_saved.st_ino,
                              hashlib.sha256(manifest_raw).hexdigest()))
                return dict(EXACT_RESULT)

            with mock.patch.object(m, "load_verifier", return_value=object()), \
                    mock.patch.object(m, "verify_held", side_effect=held):
                raw = m.emit_evidence(b"captured", MANIFEST.read_bytes(), parent)
            self.assertEqual(calls, [(root.stat().st_ino, root.stat().st_ino,
                                      m.APP_MANIFEST_SHA256)])
            value = json.loads(raw)
            self.assertEqual(value["schema"],
                             "compatible-full-app-materializer-evidence.v1")
            self.assertEqual(value["materialized_root_identity"],
                             list(m.identity(root.stat())))
            receipt = parent / m.RECEIPT_LEAF
            self.assertEqual(receipt.read_bytes(), raw)
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
            self.assertEqual(receipt.stat().st_nlink, 1)
        finally:
            temporary.cleanup()

    def test_aba_swap_to_replacement_and_back_still_reads_original_held_fd(self):
        temporary, parent, root = self.fixture()
        root_file = root / "package.json"
        root_file.write_bytes(b"original")
        root_file.chmod(0o600)
        retained = parent / "retained-original"
        original_inode = root.stat().st_ino
        replacement_inode = None
        swapped = False

        def swap_back(root_fd):
            nonlocal replacement_inode, swapped
            root.rename(retained)
            root.mkdir(mode=0o700)
            root.chmod(0o700)
            (root / "package.json").write_bytes(b"replacement")
            replacement_inode = root.stat().st_ino
            self.assertNotEqual(replacement_inode, os.fstat(root_fd).st_ino)
            (root / "package.json").unlink()
            root.rmdir()
            retained.rename(root)
            self.assertEqual(root.stat().st_ino, original_inode)
            swapped = True

        verifier = MiniHeldVerifier(swap_back)
        data = b"original"
        document = {"files": [{
            "path": "package.json", "mode": "100644", "bytes": len(data),
            "git_blob_sha1": hashlib.sha1(
                b"blob " + str(len(data)).encode("ascii") + b"\0" + data
            ).hexdigest(),
        }]}
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            result = m._verify_rows(verifier, root_fd, os.fstat(root_fd),
                                    document, 1, len(data))
        finally:
            os.close(root_fd)
            temporary.cleanup()
        self.assertTrue(swapped)
        self.assertNotEqual(replacement_inode, original_inode)
        self.assertEqual(verifier.observed_inode, original_inode)
        self.assertEqual(result["bytes"], len(data))

    def test_existing_receipt_fails_closed_without_overwrite(self):
        temporary, parent, _ = self.fixture()
        try:
            receipt = parent / m.RECEIPT_LEAF
            receipt.write_bytes(b"existing")
            receipt.chmod(0o600)
            with mock.patch.object(m, "load_verifier", return_value=object()), \
                    mock.patch.object(m, "verify_held", return_value=dict(EXACT_RESULT)):
                with self.assertRaises(FileExistsError):
                    m.emit_evidence(b"captured", MANIFEST.read_bytes(), parent)
            self.assertEqual(receipt.read_bytes(), b"existing")
        finally:
            temporary.cleanup()

    def test_root_path_replacement_after_held_verification_is_denied(self):
        temporary, parent, root = self.fixture()
        try:
            def replace(*_args):
                root.rename(parent / "retained-original")
                root.mkdir(mode=0o700)
                root.chmod(0o700)
                return dict(EXACT_RESULT)

            with mock.patch.object(m, "load_verifier", return_value=object()), \
                    mock.patch.object(m, "verify_held", side_effect=replace):
                with self.assertRaises(m.EvidenceFailure):
                    m.emit_evidence(b"captured", MANIFEST.read_bytes(), parent)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_receipt_path_replacement_before_final_binding_is_denied(self):
        temporary, parent, _ = self.fixture()
        try:
            original_fsync = m.os.fsync
            replaced = False

            def adversarial_fsync(fd):
                nonlocal replaced
                original_fsync(fd)
                if not replaced and __import__("stat").S_ISDIR(os.fstat(fd).st_mode):
                    replacement = parent / "replacement"
                    replacement.write_bytes(b"replacement")
                    replacement.chmod(0o600)
                    os.replace(replacement, parent / m.RECEIPT_LEAF)
                    replaced = True

            with mock.patch.object(m, "load_verifier", return_value=object()), \
                    mock.patch.object(m, "verify_held", return_value=dict(EXACT_RESULT)), \
                    mock.patch.object(m.os, "fsync", side_effect=adversarial_fsync):
                with self.assertRaises(m.EvidenceFailure):
                    m.emit_evidence(b"captured", MANIFEST.read_bytes(), parent)
            self.assertTrue(replaced)
        finally:
            temporary.cleanup()

    def test_wrong_verifier_result_is_denied_without_receipt(self):
        temporary, parent, _ = self.fixture()
        try:
            with mock.patch.object(m, "load_verifier", return_value=object()), \
                    mock.patch.object(m, "verify_held", return_value={"schema": "wrong"}):
                with self.assertRaises(m.EvidenceFailure):
                    m.emit_evidence(b"captured", MANIFEST.read_bytes(), parent)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            temporary.cleanup()

    def test_exact_held_route_and_no_path_verifier_call(self):
        text = SOURCE.read_text()
        self.assertIn("verifier.leaf(root_fd", text)
        self.assertIn("verifier.inventory(root_fd", text)
        self.assertIn("result = verify_held(verifier, root_fd, root_saved, manifest_raw)",
                      text)
        self.assertNotIn("verifier.verify(", text)

    def test_source_has_no_process_network_or_destructive_tree_authority(self):
        text = SOURCE.read_text()
        for forbidden in ("subprocess", "socket", "urllib", "requests",
                          "shutil.rmtree", "os.unlink", "os.remove", "os.rmdir",
                          "shell=True"):
            self.assertNotIn(forbidden, text)
        self.assertIn("os.O_EXCL", text)
        self.assertIn("os.O_NOFOLLOW", text)

    def test_main_is_fixed_refusal(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output):
            self.assertEqual(m.main(), 78)
        self.assertEqual(
            output.getvalue(),
            "compatible-full-app-materializer-evidence FAIL unrouted_exact_tree_required\n",
        )


if __name__ == "__main__":
    unittest.main()
