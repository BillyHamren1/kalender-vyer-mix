"""Support/negative controls only; never installs dependencies or builds the App."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "compatible-eight-reader-full-app-long-process.py"
spec = importlib.util.spec_from_file_location("full_app_long_process", SOURCE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


def policy():
    return {"schema": m.SCHEMA,
            "node": {"sha256": "1" * 64, "version": "v22.14.0"},
            "npm_cli": {"sha256": "2" * 64, "version": "10.9.2"},
            "npm_trust": {"registry_origin": "https://registry.example.invalid/",
                          "ca_sha256": "3" * 64,
                          "proxy_policy": "caller-reviewed-direct",
                          "redirect_policy": "caller-reviewed-npm",
                          "cache_policy": "fresh-private",
                          "evidence_sha256": "4" * 64}}


def raw_policy(value=None):
    return json.dumps(policy() if value is None else value, separators=(",", ":")).encode()


class Controls(unittest.TestCase):
    def test_exact_caller_digest_and_duplicate_unknown_fields_refuse(self):
        raw = raw_policy(); parsed = m.parse_policy(raw, hashlib.sha256(raw).hexdigest())
        self.assertEqual(parsed, policy())
        for candidate in (raw + b" ", b'{"schema":"x","schema":"y"}',
                          json.dumps(policy() | {"unexpected": True}).encode()):
            with self.assertRaises(Exception):
                m.parse_policy(candidate, hashlib.sha256(raw).hexdigest())

    def test_exact_node_npm_versions_and_trust_declarations_required(self):
        for mutate in (("node", "version", "v24.0.0"), ("npm_cli", "version", "latest"),
                       ("npm_trust", "registry_origin", "http://registry.invalid/"),
                       ("npm_trust", "proxy_policy", "ambient"),
                       ("npm_trust", "redirect_policy", "allow-all"),
                       ("npm_trust", "cache_policy", "ambient")):
            value = policy(); value[mutate[0]][mutate[1]] = mutate[2]; raw = raw_policy(value)
            with self.assertRaises(Exception): m.parse_policy(raw, hashlib.sha256(raw).hexdigest())

    def test_five_command_vectors_are_fixed_fd_paths(self):
        expected = {
            "node-version": ("/proc/self/fd/11", "--version"),
            "npm-version": ("/proc/self/fd/11", "/proc/self/fd/12", "--version"),
            "npm-ci": ("/proc/self/fd/11", "/proc/self/fd/12", "ci"),
            "sdk-unit": ("/proc/self/fd/11", m.SDK),
            "app-build": ("/proc/self/fd/11", "/proc/self/fd/12", "run", "build"),
        }
        for purpose in m.SEQUENCE: self.assertEqual(m.command_for(purpose, 11, 12), expected[purpose])
        for purpose in ("shell", "npm-test", "vite"):
            with self.assertRaises(Exception): m.command_for(purpose, 11, 12)

    def test_minimal_environment_does_not_inherit_host_values(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); root.chmod(0o700); state = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with mock.patch.dict(os.environ, {"PRIVATE_SENTINEL": "secret", "HTTP_PROXY": "secret"}):
                    env = m.environment_for("npm-ci", state, 19, policy())
                    self.assertEqual(set(env), {"PATH", "HOME", "CI", "LC_ALL", "LANG", "NPM_CONFIG_CACHE",
                                                "NPM_CONFIG_REGISTRY", "NPM_CONFIG_CAFILE",
                                                "NPM_CONFIG_STRICT_SSL", "NPM_CONFIG_UPDATE_NOTIFIER"})
                    self.assertNotIn("PRIVATE_SENTINEL", env); self.assertNotIn("HTTP_PROXY", env)
                    build = m.environment_for("app-build", state, 19, policy())
                    self.assertEqual({key for key in build if key.startswith("VITE_")}, set(m.BUILD_FLAGS))
            finally: os.close(state)

    def test_budgets_have_distinct_execution_and_cleanup_reserve(self):
        self.assertEqual(set(m.SECONDS), set(m.SEQUENCE)); self.assertEqual(set(m.CAPS), set(m.SEQUENCE))
        self.assertGreaterEqual(m.CLEANUP_RESERVE, 10)
        self.assertLessEqual(m.SECONDS["npm-ci"], 600); self.assertLessEqual(m.SECONDS["app-build"], 300)
        self.assertTrue(all(0 < m.CAPS[p] <= 8_388_608 for p in m.SEQUENCE))

    def test_tool_reader_refuses_symlink_mode_hash_and_replacement(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); tool = root / "node"; tool.write_bytes(b"fixed-tool"); tool.chmod(0o500)
            digest = hashlib.sha256(b"fixed-tool").hexdigest(); deadline = __import__("time").monotonic() + 2
            fd, saved = m.open_tool(tool, digest, 1024, deadline); self.assertEqual(os.fstat(fd).st_ino, saved.st_ino); os.close(fd)
            (root / "link").symlink_to(tool)
            with self.assertRaises(Exception): m.open_tool(root / "link", digest, 1024, deadline)
            tool.chmod(0o522)
            with self.assertRaises(Exception): m.open_tool(tool, digest, 1024, deadline)
            tool.chmod(0o500)
            with self.assertRaises(Exception): m.open_tool(tool, "0" * 64, 1024, deadline)

    def test_execution_fd_binding_hashes_exact_node_npm_and_ca_bytes(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            for filename, raw, mode, executable in (
                    ("node", b"node-exact", 0o500, True),
                    ("npm-cli.js", b"npm-exact", 0o400, False),
                    ("ca.pem", b"ca-exact", 0o400, False)):
                path = root / filename; path.write_bytes(raw); path.chmod(mode)
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    saved = m.verify_tool_fd(fd, hashlib.sha256(raw).hexdigest(), 1024,
                                             executable, __import__("time").monotonic() + 2)
                    self.assertEqual(saved.st_size, len(raw))
                    with self.assertRaises(Exception):
                        m.verify_tool_fd(fd, "0" * 64, 1024, executable,
                                         __import__("time").monotonic() + 2)
                finally: os.close(fd)

    def test_runner_refuses_before_popen_when_process_identity_is_uncertain(self):
        custody = mock.Mock(); custody.UNCERTAIN_CHILDREN = {}; custody.REAPING_CHILDREN = {}
        custody.proc_identity_valid.return_value = False
        raw = raw_policy(); digest = hashlib.sha256(raw).hexdigest()
        with mock.patch.object(m.subprocess, "Popen", side_effect=AssertionError("popen_called")) as popen:
            with self.assertRaises(Exception):
                m.run_phase(custody, "npm-ci", -1, -1, -1, 11, 12, 13, raw, digest, 3)
            popen.assert_not_called()

    def test_runner_source_contains_no_poll_wait_kill_or_shell_route(self):
        text = SOURCE.read_text()
        for forbidden in (".poll(", ".wait(", "os.kill(", "os.killpg(", "shell=True", "preexec_fn=os.setsid"):
            self.assertNotIn(forbidden, text)
        self.assertIn("custody.exited_unreaped", text); self.assertIn("custody.stop_owned", text)
        self.assertIn("custody.REAPING_CHILDREN", text)

    def test_main_is_fixed_unrouted_refusal(self):
        output = io.StringIO()
        with mock.patch("sys.stdout", output): self.assertEqual(m.main(), 78)
        self.assertEqual(output.getvalue(), "compatible-full-app-long-process FAIL unrouted_policy_required\n")


if __name__ == "__main__": unittest.main()
