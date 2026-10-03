"""Local source/negative tests; no genuine Node archive or Node execution."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-node24-extraction-evidence.py"
PREPARATION = HERE.parent / "operations-node24-successor-stage/compatible-eight-reader-full-app-node24-preparation.py"
POLICY = HERE.parent / "operations-economy/scripts/project-economy/compatible-eight-reader-full-app-node24-input-policy.json"
spec = importlib.util.spec_from_file_location("node24_extraction_evidence", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class FakePreparation:
    def __init__(self, archive_sha, action=None, result=None):
        self.archive_sha = archive_sha
        self.action = action
        self.result = result

    def parse_source_policy(self, _raw):
        return {"distribution": {"archive_sha256": self.archive_sha,
                                 "node_version": m.NODE_VERSION,
                                 "npm_version": m.NPM_VERSION}}

    @staticmethod
    def _directory(parent, name):
        try:
            os.mkdir(name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                       dir_fd=parent)

    @staticmethod
    def _file(parent, name, body, mode):
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     mode, dir_fd=parent)
        try:
            os.fchmod(fd, mode)
            os.write(fd, body)
            os.fsync(fd)
        finally:
            os.close(fd)

    def extract_archive(self, _archive_fd, destination_fd, deadline):
        deadline.check()
        root = self._directory(destination_fd, m.ARCHIVE_ROOT)
        try:
            binary = self._directory(root, "bin")
            try:
                self._file(binary, "node", b"synthetic-node24-binary", 0o500)
                os.symlink(m.NPM_LINK_TARGET, "npm", dir_fd=binary)
            finally:
                os.close(binary)
            lib = self._directory(root, "lib")
            try:
                modules = self._directory(lib, "node_modules")
                try:
                    npm = self._directory(modules, "npm")
                    try:
                        npm_bin = self._directory(npm, "bin")
                        try:
                            self._file(npm_bin, "npm-cli.js", b"synthetic-npm-cli", 0o400)
                        finally:
                            os.close(npm_bin)
                    finally:
                        os.close(npm)
                finally:
                    os.close(modules)
            finally:
                os.close(lib)
        finally:
            os.close(root)
        if self.action is not None:
            self.action()
        if self.result is not None:
            return self.result
        return {"schema": "compatible-full-app-node-distribution-extract-receipt.v1",
                "archive_sha256": self.archive_sha, "members": 9,
                "expanded_bytes": 40, "root": m.ARCHIVE_ROOT,
                "node_version": m.NODE_VERSION, "npm_version": m.NPM_VERSION}


class Controls(unittest.TestCase):
    def fixture(self, archive=b"synthetic exact archive"):
        temporary = tempfile.TemporaryDirectory()
        base = Path(temporary.name).resolve()
        parent = base / "private"
        parent.mkdir(mode=0o700)
        parent.chmod(0o700)
        archive_path = base / "archive.tar.xz"
        archive_path.write_bytes(archive)
        archive_path.chmod(0o400)
        archive_fd = os.open(archive_path, os.O_RDONLY | os.O_NOFOLLOW)
        return temporary, parent, archive_path, archive_fd, hashlib.sha256(archive).hexdigest()

    def run_fake(self, parent, archive_fd, digest, fake=None):
        fake = FakePreparation(digest) if fake is None else fake
        with mock.patch.object(m, "ARCHIVE_SHA256", digest), \
                mock.patch.object(m, "load_preparation", return_value=fake):
            return m.extract_evidence(b"captured", POLICY.read_bytes(), archive_fd, parent)

    def test_exact_preparation_and_policy_load(self):
        raw = PREPARATION.read_bytes()
        self.assertEqual(len(raw), 20_956)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.PREPARATION_SHA256)
        loaded = m.load_preparation(raw)
        value = loaded.parse_source_policy(POLICY.read_bytes())
        self.assertEqual(value["distribution"]["archive_sha256"], m.ARCHIVE_SHA256)
        with self.assertRaises(m.ExtractionEvidenceFailure):
            m.load_preparation(raw + b" ")

    def test_success_derives_exact_held_node_and_npm_evidence(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        try:
            raw = self.run_fake(parent, archive_fd, digest)
            value = json.loads(raw)
            self.assertEqual(value["schema"],
                             "compatible-full-app-node24-extraction-evidence.v1")
            self.assertEqual(value["archive_sha256"], digest)
            self.assertEqual(value["node"]["sha256"],
                             hashlib.sha256(b"synthetic-node24-binary").hexdigest())
            self.assertEqual(value["npm_cli"]["sha256"],
                             hashlib.sha256(b"synthetic-npm-cli").hexdigest())
            self.assertEqual(value["npm_link"]["target"], m.NPM_LINK_TARGET)
            self.assertFalse(value["node_executed"])
            receipt = parent / m.RECEIPT_LEAF
            self.assertEqual(receipt.read_bytes(), raw)
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
            self.assertEqual({item.name for item in parent.iterdir()},
                             {m.EXTRACTION_LEAF, m.RECEIPT_LEAF})
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_nonempty_private_parent_is_denied(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        try:
            (parent / "existing").write_bytes(b"private")
            with self.assertRaises(m.ExtractionEvidenceFailure):
                self.run_fake(parent, archive_fd, digest)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_writable_archive_is_denied(self):
        temporary, parent, archive_path, archive_fd, digest = self.fixture()
        try:
            archive_path.chmod(0o600)
            with self.assertRaises(m.ExtractionEvidenceFailure):
                self.run_fake(parent, archive_fd, digest)
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_archive_mutation_during_extract_is_denied(self):
        temporary, parent, archive_path, archive_fd, digest = self.fixture()
        try:
            def mutate():
                archive_path.chmod(0o600)
                archive_path.write_bytes(b"changed archive bytes")
                archive_path.chmod(0o400)
            fake = FakePreparation(digest, action=mutate)
            with self.assertRaises(m.ExtractionEvidenceFailure):
                self.run_fake(parent, archive_fd, digest, fake)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_extraction_path_replacement_is_denied(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        try:
            def replace():
                original = parent / m.EXTRACTION_LEAF
                original.rename(parent / "retained-original")
                original.mkdir(mode=0o700)
                original.chmod(0o700)
            fake = FakePreparation(digest, action=replace)
            with self.assertRaises(m.ExtractionEvidenceFailure):
                self.run_fake(parent, archive_fd, digest, fake)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_wrong_extract_receipt_is_denied(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        try:
            fake = FakePreparation(digest, result={"schema": "wrong"})
            with self.assertRaises(m.ExtractionEvidenceFailure):
                self.run_fake(parent, archive_fd, digest, fake)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_receipt_path_replacement_before_final_binding_is_denied(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        original_fsync = m.os.fsync
        replaced = False
        parent_inode = parent.stat().st_ino

        def adversarial_fsync(fd):
            nonlocal replaced
            original_fsync(fd)
            if (not replaced and stat.S_ISDIR(os.fstat(fd).st_mode)
                    and os.fstat(fd).st_ino == parent_inode
                    and (parent / m.RECEIPT_LEAF).exists()):
                replacement = parent / "replacement"
                replacement.write_bytes(b"replacement")
                replacement.chmod(0o600)
                os.replace(replacement, parent / m.RECEIPT_LEAF)
                replaced = True
        try:
            fake = FakePreparation(digest)
            with mock.patch.object(m, "ARCHIVE_SHA256", digest), \
                    mock.patch.object(m, "load_preparation", return_value=fake), \
                    mock.patch.object(m.os, "fsync", side_effect=adversarial_fsync):
                with self.assertRaises(m.ExtractionEvidenceFailure):
                    m.extract_evidence(b"captured", POLICY.read_bytes(), archive_fd, parent)
            self.assertTrue(replaced)
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_node_path_replacement_during_read_is_denied(self):
        temporary, parent, _, archive_fd, digest = self.fixture()
        original_hash = m._hash_fd
        replaced = False

        def adversarial_hash(fd, maximum, deadline, expected_sha256=None):
            nonlocal replaced
            result = original_hash(fd, maximum, deadline, expected_sha256)
            if (not replaced and maximum == m.FILE_LIMIT
                    and stat.S_IMODE(os.fstat(fd).st_mode) == 0o500):
                node = parent / m.EXTRACTION_LEAF / m.ARCHIVE_ROOT / m.NODE_PATH
                replacement = node.with_name("replacement")
                replacement.write_bytes(b"replacement-node")
                replacement.chmod(0o500)
                os.replace(replacement, node)
                replaced = True
            return result
        try:
            fake = FakePreparation(digest)
            with mock.patch.object(m, "ARCHIVE_SHA256", digest), \
                    mock.patch.object(m, "load_preparation", return_value=fake), \
                    mock.patch.object(m, "_hash_fd", side_effect=adversarial_hash):
                with self.assertRaises(m.ExtractionEvidenceFailure):
                    m.extract_evidence(b"captured", POLICY.read_bytes(), archive_fd, parent)
            self.assertTrue(replaced)
            self.assertFalse((parent / m.RECEIPT_LEAF).exists())
        finally:
            os.close(archive_fd)
            temporary.cleanup()

    def test_source_has_no_fetch_execution_or_cleanup_authority(self):
        text = SOURCE.read_text()
        for forbidden in ("fetch_archive(", "subprocess", "socket", "urllib",
                          "Popen", "os.exec", "os.unlink", "os.remove",
                          "os.rmdir", "shutil.rmtree", "shell=True"):
            self.assertNotIn(forbidden, text)
        self.assertIn("preparation.extract_archive(", text)
        self.assertIn("node_executed\": False", text)

    def test_main_is_fixed_refusal(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output):
            self.assertEqual(m.main(), 78)
        self.assertEqual(
            output.getvalue(),
            "compatible-full-app-node24-extraction-evidence FAIL exact_archive_and_route_required\n",
        )


if __name__ == "__main__":
    unittest.main()
