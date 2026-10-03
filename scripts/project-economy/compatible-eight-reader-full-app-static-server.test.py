"""Local support controls only; no browser, App or provider acceptance."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "compatible-eight-reader-full-app-static-server.py"
SPEC = importlib.util.spec_from_file_location("static_server", SCRIPT)
s = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(s)


def build_dist(base: Path) -> Path:
    dist = base / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    dist.chmod(0o700)
    assets.chmod(0o700)
    files = {
        "index.html": b"<!doctype html><div id=\"root\"></div>",
        "about.html": b"<!doctype html><p>static about</p>",
        "assets/app-12345678.js": b"globalThis.__STATIC_TEST__=true;",
        "assets/style-12345678.css": b"body{color:#123}",
        "manifest.json": b'{"name":"test"}',
        "robots.txt": b"User-agent: *\nDisallow: /\n",
    }
    for name, body in files.items():
        target = dist / name
        target.write_bytes(body)
        target.chmod(0o600)
    return dist


class Running:
    def __init__(self, dist: Path):
        receipt = dist.parent / "receipt.json"
        self.fd = os.open(receipt, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.fchmod(self.fd, 0o600)
        self.child = subprocess.Popen(
            (str(Path(os.sys.executable)), "-I", "-B", str(SCRIPT), str(dist.resolve()), str(self.fd)),
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, pass_fds=(self.fd,), close_fds=True,
            env={"CI": "true", "PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"})
        end = time.monotonic() + 3
        raw = b""
        while not raw and time.monotonic() < end:
            raw = os.pread(self.fd, 2_048, 0)
            if not raw:
                time.sleep(0.01)
        if not raw:
            out, err = self.child.communicate(timeout=3)
            os.close(self.fd)
            raise AssertionError((self.child.returncode, out, err))
        self.receipt = json.loads(raw)
        self.host = self.receipt["host"]
        self.port = self.receipt["port"]

    def request(self, target: str, method: str = "GET", headers: tuple[str, ...] = (), body: bytes = b"") -> bytes:
        with socket.create_connection((self.host, self.port), timeout=2) as connection:
            request = (method + " " + target + " HTTP/1.1\r\nHost: " + self.host + ":" + str(self.port)
                       + "\r\n".join(("", *headers)) + "\r\n\r\n").encode("ascii") + body
            connection.sendall(request)
            connection.shutdown(socket.SHUT_WR)
            pieces = []
            while True:
                data = connection.recv(65_536)
                if not data:
                    break
                pieces.append(data)
            return b"".join(pieces)

    def close(self):
        if self.child.poll() is None:
            self.child.terminate()
        out, err = self.child.communicate(timeout=3)
        os.close(self.fd)
        if self.child.returncode != 0:
            raise AssertionError((self.child.returncode, out, err))
        if b"compatible-full-app-static-server CLOSED" not in out or err:
            raise AssertionError((out, err))


class StaticServerControls(unittest.TestCase):
    def test_real_loopback_get_head_cache_mime_and_fixed_spa(self):
        with tempfile.TemporaryDirectory() as name:
            dist = build_dist(Path(name))
            server = Running(dist)
            try:
                self.assertEqual(server.receipt["schema"], "compatible-full-app-static-server.v1")
                self.assertEqual(server.host, "127.0.0.1")
                self.assertEqual(server.receipt["project_route"], s.PROJECT_ROUTE)
                page = server.request(s.PROJECT_ROUTE)
                self.assertIn(b"HTTP/1.1 200 OK", page)
                self.assertIn(b"Cache-Control: no-store", page)
                self.assertTrue(page.endswith((dist / "index.html").read_bytes()))
                head = server.request("/assets/app-12345678.js", "HEAD")
                self.assertIn(b"HTTP/1.1 200 OK", head)
                self.assertIn(b"Content-Type: text/javascript; charset=utf-8", head)
                self.assertIn(b"Cache-Control: public, max-age=31536000, immutable", head)
                self.assertTrue(head.endswith(b"\r\n\r\n"))
                manifest = server.request("/manifest.json")
                self.assertIn(b"Content-Type: application/manifest+json; charset=utf-8", manifest)
                self.assertTrue(manifest.endswith(b'{"name":"test"}'))
                secondary = server.request("/about.html")
                self.assertIn(b"HTTP/1.1 200 OK", secondary)
                self.assertIn(b"Content-Type: text/html; charset=utf-8", secondary)
                self.assertIn(b"Cache-Control: no-store", secondary)
            finally:
                server.close()

    def test_api_auth_provider_unknown_and_traversal_never_fallback(self):
        with tempfile.TemporaryDirectory() as name:
            server = Running(build_dist(Path(name)))
            try:
                for target in ("/api/admin", "/auth/v1/user", "/rest/v1/projects", "/rpc/private",
                               "/provider/document", "/unknown", "/../index.html", "/%2e%2e/index.html",
                               "/assets/../index.html", "//external.example/path"):
                    reply = server.request(target)
                    self.assertNotIn(b"HTTP/1.1 200 OK", reply, target)
                    self.assertNotIn(b"<!doctype html>", reply, target)
            finally:
                server.close()

    def test_methods_body_host_headers_and_absolute_target_are_denied(self):
        with tempfile.TemporaryDirectory() as name:
            server = Running(build_dist(Path(name)))
            try:
                for method in ("POST", "PUT", "DELETE", "OPTIONS", "CONNECT"):
                    self.assertIn(b"HTTP/1.1 400 Bad Request", server.request(s.PROJECT_ROUTE, method))
                self.assertIn(b"HTTP/1.1 400 Bad Request",
                              server.request(s.PROJECT_ROUTE, headers=("Content-Length: 1",), body=b"X"))
                self.assertIn(b"HTTP/1.1 400 Bad Request",
                              server.request(s.PROJECT_ROUTE, headers=("Transfer-Encoding: chunked",)))
                self.assertIn(b"HTTP/1.1 400 Bad Request",
                              server.request("/assets/app-12345678.js", headers=("Range: bytes=0-3",)))
                raw = ("GET " + s.PROJECT_ROUTE + " HTTP/1.1\r\nHost: evil.example\r\n\r\n").encode()
                with socket.create_connection((server.host, server.port), timeout=2) as connection:
                    connection.sendall(raw)
                    self.assertIn(b"HTTP/1.1 400 Bad Request", connection.recv(4_096))
                absolute = "http://127.0.0.1:" + str(server.port) + s.PROJECT_ROUTE
                absolute_reply = server.request(absolute)
                self.assertNotIn(b"HTTP/1.1 200 OK", absolute_reply)
                self.assertNotIn(b"<!doctype html>", absolute_reply)
            finally:
                server.close()

    def test_oversized_and_too_many_headers_are_finite_denials(self):
        with tempfile.TemporaryDirectory() as name:
            server = Running(build_dist(Path(name)))
            try:
                huge = ("GET / HTTP/1.1\r\nHost: 127.0.0.1:" + str(server.port)
                        + "\r\nX-Large: " + "A" * 17_000 + "\r\n\r\n").encode()
                with socket.create_connection((server.host, server.port), timeout=2) as connection:
                    connection.sendall(huge)
                    self.assertIn(b"HTTP/1.1 400 Bad Request", connection.recv(4_096))
                many = tuple("X-Test-" + str(index) + ": value" for index in range(33))
                self.assertIn(b"HTTP/1.1 400 Bad Request", server.request("/", headers=many))
            finally:
                server.close()

    def test_inventory_refuses_symlink_special_unknown_and_world_writable(self):
        for mode in ("symlink", "unknown", "public"):
            with tempfile.TemporaryDirectory() as name:
                base = Path(name)
                dist = build_dist(base)
                if mode == "symlink":
                    (dist / "link.js").symlink_to("assets/app-12345678.js")
                elif mode == "unknown":
                    (dist / "secret.sql").write_bytes(b"select private")
                    (dist / "secret.sql").chmod(0o600)
                else:
                    (dist / "index.html").chmod(0o666)
                receipt = base / "receipt.json"
                fd = os.open(receipt, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
                try:
                    child = subprocess.run(
                        (str(Path(os.sys.executable)), "-I", "-B", str(SCRIPT), str(dist.resolve()), str(fd)),
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        start_new_session=True, pass_fds=(fd,), close_fds=True, timeout=3,
                        env={"CI": "true", "PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"})
                    self.assertEqual(child.returncode, 1)
                    self.assertEqual(os.pread(fd, 2_048, 0), b"")
                    self.assertIn(b"FAIL fixed_refusal", child.stdout)
                finally:
                    os.close(fd)

    def test_mutation_during_read_never_returns_alternate_bytes(self):
        with tempfile.TemporaryDirectory() as name:
            dist = build_dist(Path(name))
            fd, before = s.open_dist(dist.resolve())
            try:
                records = s.inventory(fd, dist.resolve(), before, s.Deadline(2))
                actual = os.read
                changed = False

                def mutate(handle, size):
                    nonlocal changed
                    data = actual(handle, size)
                    if not changed:
                        changed = True
                        target = dist / "assets/app-12345678.js"
                        target.write_bytes(b"alternate")
                        target.chmod(0o600)
                    return data

                with patch.object(s.os, "read", side_effect=mutate):
                    with self.assertRaises(s.StaticServerFailure):
                        s.read_asset(fd, dist.resolve(), records, "assets/app-12345678.js", s.Deadline(2))
            finally:
                os.close(fd)

    def test_route_and_deadline_do_not_expand(self):
        records = {"": object(), "index.html": type("R", (), {"st_mode": 0o100600})()}
        self.assertEqual(s.route(s.PROJECT_ROUTE, records)[0], "index.html")
        for target in ("/project/other/economy", s.PROJECT_ROUTE + "/extra", "/api", "/.hidden"):
            with self.assertRaises(Exception):
                s.route(target, records)
        deadline = s.Deadline(1)
        deadline.end = 0
        with self.assertRaises(s.StaticServerFailure):
            deadline.check()


if __name__ == "__main__":
    unittest.main()
