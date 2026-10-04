"""Actual controller HTTP rejection tests; Docker execution capability is absent.

No SQL, database, fixture identity, or financial mutation is possible in this test.
The root runner retains ownership of the genuine disposable SQL proof.
"""
import http.client
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest


class ControlBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        deno = shutil.which("deno") or os.environ.get("PROJECT_EVIDENCE_TEST_DENO")
        if not deno:
            raise RuntimeError("Deno executable required; test must not silently skip")
        # Never probe commands against an already running genuine fixture control.
        try:
            with socket.create_connection(("127.0.0.1", 55611), timeout=0.2):
                occupied = True
        except OSError:
            occupied = False
        if occupied:
            raise RuntimeError("Fixed controller test port already occupied; no takeover")
        cls.runtime = Path(__file__).resolve().parent
        cls.token = "test-control-token-distinct-local-" + "x" * 32
        env = dict(os.environ, CI="true", ISOLATED_PROJECT_EVIDENCE_HTTP="true",
                   GITHUB_REPOSITORY="BillyHamren1/kalender-vyer-mix", GITHUB_RUN_ID="987654321",
                   PROJECT_EVIDENCE_COMPOSE_NAMESPACE="project-evidence-http-987654321",
                   PROJECT_EVIDENCE_COMPOSE_PATH=str(cls.runtime / "compose.yml"),
                   PROJECT_EVIDENCE_DATABASE_NAME="eventflow_project_evidence_http_runtime",
                   PROJECT_EVIDENCE_CONTROL_TOKEN=cls.token,
                   PROJECT_EVIDENCE_JWT_SECRET="test-jwt-secret-distinct-local-" + "y" * 32)
        cls.log = tempfile.TemporaryFile()
        # No --allow-run: even a valid operation cannot spawn Docker or reach SQL.
        cls.child = subprocess.Popen(
            [deno, "run", "--no-prompt", "--allow-env", "--allow-net=127.0.0.1:55611",
             str(cls.runtime / "control.ts")], cwd=cls.runtime.parents[2], env=env,
            stdin=subprocess.DEVNULL, stdout=cls.log, stderr=cls.log)
        try:
            for _ in range(50):
                if cls.child.poll() is not None:
                    raise RuntimeError("Owned controller failed to start; private log suppressed")
                try:
                    if cls.request("GET", "/state", token="wrong")[0] == 403:
                        time.sleep(0.1)
                        if cls.child.poll() is not None:
                            raise RuntimeError("Owned controller lost its fixed port")
                        return
                except OSError:
                    pass
                time.sleep(0.1)
            raise RuntimeError("Owned controller startup deadline")
        except Exception:
            cls.stop()
            raise

    @classmethod
    def stop(cls):
        if cls.child.poll() is None:
            cls.child.terminate()
            try:
                cls.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.child.kill()
                cls.child.wait(timeout=3)
        cls.log.close()

    @classmethod
    def tearDownClass(cls):
        cls.stop()

    @classmethod
    def request(cls, method, path, body=None, token=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", 55611, timeout=5)
        try:
            headers = {"x-project-evidence-control-token": cls.token if token is None else token}
            if host is not None:
                headers["Host"] = host
            conn.request(method, path, body=body, headers=headers)
            response = conn.getresponse()
            data = response.read(1024)
            return response.status, data
        finally:
            conn.close()

    def test_wrong_token_and_host(self):
        self.assertEqual(self.request("GET", "/state", token="wrong"), (403, b""))
        self.assertEqual(self.request("GET", "/state", host="foreign.example"), (403, b""))

    def test_query_and_unknown_path(self):
        self.assertEqual(self.request("GET", "/state?sql=DROP%20TABLE"), (403, b""))
        for path in ("/sql", "/state/", "/restore-admin-org/", "/__proto__", "/constructor"):
            with self.subTest(path=path):
                self.assertEqual(self.request("POST", path, b'{"fixture":"project-evidence-http-v1"}'), (400, b""))

    def test_methods_and_state_body(self):
        for method, path, body in (("POST", "/state", b"{}"), ("GET", "/revoke-admin", None),
                                   ("PUT", "/delete-project-a", b"{}"), ("GET", "/state", b"{}")):
            with self.subTest(method=method, path=path):
                self.assertEqual(self.request(method, path, body), (400, b""))

    def test_state_transfer_encoding_denied(self):
        conn = http.client.HTTPConnection("127.0.0.1", 55611, timeout=5)
        try:
            conn.request("GET", "/state", body=iter([b"{}"]), encode_chunked=True,
                         headers={"x-project-evidence-control-token": self.token})
            response = conn.getresponse()
            self.assertEqual((response.status, response.read(1024)), (400, b""))
        finally:
            conn.close()

    def test_slow_body_deadline(self):
        with socket.create_connection(("127.0.0.1", 55611), timeout=4) as connection:
            request = ("POST /delete-project-a HTTP/1.1\r\nHost: 127.0.0.1:55611\r\n"
                       "x-project-evidence-control-token: " + self.token + "\r\n"
                       "Content-Length: 1024\r\nConnection: close\r\n\r\n{")
            started = time.monotonic()
            connection.sendall(request.encode("ascii"))
            response = b""
            while b"\r\n\r\n" not in response and len(response) < 4096:
                part = connection.recv(1024)
                if not part:
                    break
                response += part
            self.assertTrue(response.startswith(b"HTTP/1.1 400 "), "Slow body did not fail closed")
            self.assertLess(time.monotonic() - started, 4, "Slow body response exceeded deadline")
        # Rejected incomplete body must not destabilize the subsequent fixed route.
        self.assertEqual(self.request("GET", "/state", token="wrong"), (403, b""))

    def test_body_shape_utf8_and_size(self):
        for body in (b"", b"null", b"[]", b"{}", b"\xff", b'{"fixture":"wrong"}',
                     b'{"fixture":"project-evidence-http-v1","sql":"DROP TABLE x"}',
                     b'{"fixture":["project-evidence-http-v1"]}', b" " * 1025):
            with self.subTest(body_length=len(body)):
                self.assertEqual(self.request("POST", "/delete-project-a", body), (400, b""))

    def test_valid_commands_cannot_execute_docker(self):
        for path in ("/move-admin-org", "/restore-admin-org", "/delete-project-a", "/revoke-admin"):
            with self.subTest(path=path):
                self.assertEqual(self.request("POST", path, b'{"fixture":"project-evidence-http-v1"}'),
                                 (409, b'{"status":"denied"}'))
        self.assertEqual(self.request("GET", "/state"), (409, b'{"status":"denied"}'))


if __name__ == "__main__":
    unittest.main()
