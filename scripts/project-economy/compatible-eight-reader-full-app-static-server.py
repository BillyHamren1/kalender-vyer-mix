"""NEW bounded loopback static server for an already-built exact full App."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import re
import signal
import socket
import stat
import sys
import time
from urllib.parse import unquote_to_bytes, urlsplit


HOST = "127.0.0.1"
PROJECT = "55555555-5555-4555-8555-555555555555"
PROJECT_ROUTE = "/project/" + PROJECT + "/economy"
MAX_RUNTIME = 120
MAX_REQUESTS = 768
MAX_HEADER_BYTES = 16_384
MAX_HEADERS = 32
MAX_TARGET = 2_048
MAX_FILE_BYTES = 16_777_216
MAX_DIST_BYTES = 67_108_864
MAX_DIST_ENTRIES = 4_096
MAX_DEPTH = 16
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_nlink", "st_mode", "st_size", "st_mtime_ns", "st_ctime_ns")
TOKEN = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")
HASHED = re.compile(r"^.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$")
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
}
BLOCKED_PREFIXES = ("/api", "/auth", "/rest", "/rpc", "/graphql", "/functions", "/supabase", "/provider")


class StaticServerFailure(Exception):
    pass


def require(value: bool) -> None:
    if value is not True:
        raise StaticServerFailure("compatible_full_app_static_server_denied")


def identity(value: os.stat_result) -> tuple[int, ...]:
    return tuple(getattr(value, key) for key in FIELDS)


class Deadline:
    def __init__(self, seconds: float = MAX_RUNTIME) -> None:
        require(type(seconds) in (int, float) and math.isfinite(seconds) and 0 < seconds <= MAX_RUNTIME)
        self.end = time.monotonic() + seconds

    def check(self) -> None:
        require(time.monotonic() < self.end)


def process_identity() -> tuple[int, int, int]:
    pid = os.getpid()
    value = (pid, os.getpgid(pid), os.getsid(pid))
    require(value[1] == pid and value[2] == pid)
    return value


def open_dist(path: Path) -> tuple[int, os.stat_result]:
    require(type(path) is type(Path()) and path.is_absolute() and path.resolve() == path)
    before = path.lstat()
    require(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
            and stat.S_IMODE(before.st_mode) & 0o022 == 0)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        require(identity(os.fstat(fd)) == identity(before) and identity(path.lstat()) == identity(before))
        return fd, before
    except BaseException:
        os.close(fd)
        raise


def inventory(root_fd: int, root_path: Path, root_before: os.stat_result,
              deadline: Deadline) -> dict[str, os.stat_result]:
    records: dict[str, os.stat_result] = {"": root_before}
    total = 0
    entries = 0

    def walk(parent: int, prefix: str, depth: int) -> None:
        nonlocal total, entries
        deadline.check()
        require(depth <= MAX_DEPTH)
        parent_before = os.fstat(parent)
        with os.scandir(parent) as children:
            for child in children:
                deadline.check()
                entries += 1
                require(entries <= MAX_DIST_ENTRIES and type(child.name) is str and 0 < len(child.name) <= 255
                        and child.name not in (".", "..") and not child.name.startswith(".")
                        and "/" not in child.name and "\\" not in child.name and "\0" not in child.name)
                relative = child.name if not prefix else prefix + "/" + child.name
                require(len(relative) <= 1_024 and relative not in records)
                before = os.stat(child.name, dir_fd=parent, follow_symlinks=False)
                require(before.st_uid == os.geteuid() and stat.S_IMODE(before.st_mode) & 0o022 == 0)
                if stat.S_ISDIR(before.st_mode):
                    directory = os.open(child.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                    try:
                        require(identity(os.fstat(directory)) == identity(before))
                        records[relative] = before
                        walk(directory, relative, depth + 1)
                        require(identity(os.fstat(directory)) == identity(before)
                                and identity(os.stat(child.name, dir_fd=parent, follow_symlinks=False)) == identity(before))
                    finally:
                        os.close(directory)
                else:
                    suffix = Path(child.name).suffix.lower()
                    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and suffix in MIME
                            and 0 <= before.st_size <= MAX_FILE_BYTES)
                    total += before.st_size
                    require(total <= MAX_DIST_BYTES)
                    records[relative] = before
        require(identity(os.fstat(parent)) == identity(parent_before))

    walk(root_fd, "", 0)
    require("index.html" in records and stat.S_ISREG(records["index.html"].st_mode)
            and "assets" in records and stat.S_ISDIR(records["assets"].st_mode)
            and entries >= 3 and identity(os.fstat(root_fd)) == identity(root_before)
            and identity(root_path.lstat()) == identity(root_before))
    deadline.check()
    return records


def read_asset(root_fd: int, root_path: Path, records: dict[str, os.stat_result],
               relative: str, deadline: Deadline) -> bytes:
    require(type(relative) is str and relative in records and relative != "")
    expected = records[relative]
    require(stat.S_ISREG(expected.st_mode) and 0 <= expected.st_size <= MAX_FILE_BYTES)
    opened = [os.dup(root_fd)]
    try:
        parts = relative.split("/")
        prefix: list[str] = []
        for part in parts[:-1]:
            prefix.append(part)
            saved = records["/".join(prefix)]
            directory = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=opened[-1])
            opened.append(directory)
            require(identity(os.fstat(directory)) == identity(saved))
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=opened[-1])
        opened.append(leaf)
        require(identity(os.fstat(leaf)) == identity(expected)
                and identity(os.stat(parts[-1], dir_fd=opened[-2], follow_symlinks=False)) == identity(expected))
        pieces: list[bytes] = []
        count = 0
        while count <= expected.st_size:
            deadline.check()
            data = os.read(leaf, min(65_536, expected.st_size + 1 - count))
            deadline.check()
            if not data:
                break
            pieces.append(data)
            count += len(data)
        require(count == expected.st_size and identity(os.fstat(leaf)) == identity(expected)
                and identity(os.stat(parts[-1], dir_fd=opened[-2], follow_symlinks=False)) == identity(expected))
        parent = root_fd
        prefix = []
        for index, part in enumerate(parts[:-1]):
            prefix.append(part)
            require(identity(os.fstat(opened[index + 1])) == identity(records["/".join(prefix)])
                    and identity(os.stat(part, dir_fd=parent, follow_symlinks=False)) == identity(records["/".join(prefix)]))
            parent = opened[index + 1]
        require(identity(os.fstat(root_fd)) == identity(records[""])
                and identity(root_path.lstat()) == identity(records[""]))
        deadline.check()
        return b"".join(pieces)
    finally:
        for fd in reversed(opened):
            os.close(fd)


def parse_request(connection: socket.socket, port: int) -> tuple[str, str]:
    connection.settimeout(2)
    raw = b""
    while b"\r\n\r\n" not in raw:
        require(len(raw) < MAX_HEADER_BYTES)
        data = connection.recv(min(4_096, MAX_HEADER_BYTES + 1 - len(raw)))
        require(bool(data))
        raw += data
    require(len(raw) <= MAX_HEADER_BYTES)
    header, rest = raw.split(b"\r\n\r\n", 1)
    require(rest == b"")
    lines = header.split(b"\r\n")
    require(1 <= len(lines) <= MAX_HEADERS + 1 and 0 < len(lines[0]) <= MAX_TARGET + 16)
    request = lines[0].decode("ascii").split(" ")
    require(len(request) == 3 and request[0] in ("GET", "HEAD") and request[2] == "HTTP/1.1"
            and 0 < len(request[1]) <= MAX_TARGET)
    values: dict[str, list[str]] = {}
    for line in lines[1:]:
        require(line and not line.startswith((b" ", b"\t")) and b":" in line)
        name, value = line.split(b":", 1)
        key = name.decode("ascii").lower()
        text = value.strip().decode("ascii")
        require(bool(TOKEN.fullmatch(key)) and all(32 <= ord(char) <= 126 for char in text))
        values.setdefault(key, []).append(text)
    require(values.get("host") == [HOST + ":" + str(port)] and "transfer-encoding" not in values
            and "expect" not in values and "range" not in values and len(values.get("content-length", [])) <= 1
            and (not values.get("content-length") or values["content-length"] == ["0"]))
    return request[0], request[1]


def route(target: str, records: dict[str, os.stat_result]) -> tuple[str, str, str]:
    require(type(target) is str and target.startswith("/") and not target.startswith("//")
            and not re.search(r"%(?![0-9A-Fa-f]{2})", target))
    parsed = urlsplit(target)
    require(not parsed.scheme and not parsed.netloc and not parsed.fragment and len(parsed.query) <= 1_024)
    decoded = unquote_to_bytes(parsed.path).decode("utf-8", "strict")
    require(decoded.startswith("/") and "\\" not in decoded and "\0" not in decoded
            and all(ord(char) >= 32 and ord(char) != 127 for char in decoded))
    parts = decoded.split("/")[1:]
    require(all(part not in ("", ".", "..") for part in parts) or decoded == "/")
    if decoded == PROJECT_ROUTE or decoded in ("/", "/index.html"):
        return "index.html", MIME[".html"], "no-store"
    if any(decoded == prefix or decoded.startswith(prefix + "/") for prefix in BLOCKED_PREFIXES):
        raise FileNotFoundError
    relative = decoded[1:]
    require(relative in records and stat.S_ISREG(records[relative].st_mode))
    suffix = Path(relative).suffix.lower()
    mime = "application/manifest+json; charset=utf-8" if Path(relative).name.startswith("manifest") and suffix == ".json" else MIME[suffix]
    cache = ("no-store" if suffix == ".html" else
             "public, max-age=31536000, immutable"
             if relative.startswith("assets/") and HASHED.fullmatch(Path(relative).name)
             else "public, max-age=3600")
    return relative, mime, cache


def response(connection: socket.socket, status_code: int, body: bytes, content_type: str,
             cache: str, head: bool) -> None:
    phrases = {200: "OK", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed",
               431: "Request Header Fields Too Large", 500: "Internal Server Error"}
    require(status_code in phrases and type(body) is bytes and len(body) <= MAX_FILE_BYTES)
    header = ("HTTP/1.1 " + str(status_code) + " " + phrases[status_code] + "\r\n"
              + "Content-Length: " + str(len(body)) + "\r\n"
              + "Content-Type: " + content_type + "\r\n"
              + "Cache-Control: " + cache + "\r\n"
              + "X-Content-Type-Options: nosniff\r\n"
              + "Referrer-Policy: no-referrer\r\n"
              + "Connection: close\r\n\r\n").encode("ascii")
    connection.sendall(header if head else header + body)


def receipt(fd: int, port: int, root: os.stat_result, process: tuple[int, int, int]) -> None:
    require(type(fd) is int and 2 < fd <= 4_096 and type(port) is int and 0 < port < 65_536)
    before = os.fstat(fd)
    require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o600
            and before.st_uid == os.geteuid() and before.st_gid == os.getegid()
            and before.st_nlink == 1 and before.st_size == 0)
    packet = json.dumps({"schema": "compatible-full-app-static-server.v1", "host": HOST, "port": port,
                         "project_route": PROJECT_ROUTE, "pid": process[0],
                         "pgid": process[1], "sid": process[2], "dist_dev": root.st_dev,
                         "dist_ino": root.st_ino}, separators=(",", ":"), sort_keys=True).encode("ascii")
    require(len(packet) <= 1_024)
    cursor = 0
    while cursor < len(packet):
        size = os.write(fd, packet[cursor:])
        require(size > 0)
        cursor += size
    os.fsync(fd)
    after = os.fstat(fd)
    require(after.st_dev == before.st_dev and after.st_ino == before.st_ino and after.st_size == len(packet)
            and stat.S_IMODE(after.st_mode) == 0o600 and after.st_nlink == 1)


def serve(dist: Path, receipt_fd: int, seconds: float = MAX_RUNTIME) -> int:
    deadline = Deadline(seconds)
    root_fd = None
    server = None
    stopping = False
    requests = 0

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    old_term = signal.signal(signal.SIGTERM, stop)
    old_int = signal.signal(signal.SIGINT, stop)
    try:
        process = process_identity()
        root_fd, root_before = open_dist(dist)
        records = inventory(root_fd, dist, root_before, deadline)
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.bind((HOST, 0))
        server.listen(16)
        server.settimeout(0.2)
        bound = server.getsockname()
        require(bound[0] == HOST and type(bound[1]) is int and 0 < bound[1] < 65_536)
        receipt(receipt_fd, bound[1], root_before, process)
        while not stopping:
            deadline.check()
            require(requests < MAX_REQUESTS and identity(os.fstat(root_fd)) == identity(root_before)
                    and identity(dist.lstat()) == identity(root_before))
            try:
                connection, peer = server.accept()
            except socket.timeout:
                continue
            requests += 1
            with connection:
                try:
                    require(peer[0] == HOST)
                    method, target = parse_request(connection, bound[1])
                    try:
                        relative, mime, cache = route(target, records)
                        body = read_asset(root_fd, dist, records, relative, deadline)
                        response(connection, 200, body, mime, cache, method == "HEAD")
                    except FileNotFoundError:
                        response(connection, 404, b"not found\n", "text/plain; charset=utf-8", "no-store", method == "HEAD")
                    except (StaticServerFailure, UnicodeError, ValueError):
                        response(connection, 404, b"not found\n", "text/plain; charset=utf-8", "no-store", method == "HEAD")
                except socket.timeout:
                    response(connection, 400, b"bad request\n", "text/plain; charset=utf-8", "no-store", False)
                except (StaticServerFailure, UnicodeError, ValueError):
                    try:
                        response(connection, 400, b"bad request\n", "text/plain; charset=utf-8", "no-store", False)
                    except OSError:
                        pass
        require(identity(os.fstat(root_fd)) == identity(root_before) and identity(dist.lstat()) == identity(root_before))
        return requests
    finally:
        signal.signal(signal.SIGTERM, old_term)
        signal.signal(signal.SIGINT, old_int)
        if server is not None:
            server.close()
        if root_fd is not None:
            os.close(root_fd)


def main() -> int:
    try:
        require(os.environ.get("CI") == "true" and len(sys.argv) == 3 and sys.argv[2].isdecimal())
        count = serve(Path(sys.argv[1]), int(sys.argv[2]))
        print("compatible-full-app-static-server CLOSED requests=" + str(count) + " native_browser=false")
        return 0
    except BaseException:
        print("compatible-full-app-static-server FAIL fixed_refusal")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
