"""Offline source/cache-input guard. It never downloads, launches or signals."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import time


HERE = Path(__file__).resolve().parent
DESCRIPTOR = HERE / "compatible-eight-reader-full-app-playwright-native-inputs-three.json"
FIELDS = ("st_dev", "st_ino", "st_uid", "st_gid", "st_nlink", "st_mode",
          "st_size", "st_mtime_ns", "st_ctime_ns")
EXPECTED = {
    "metadata_snapshot": (HERE / "compatible-eight-reader-full-app-playwright-browsers-1.55.0-three.json",
                          "6a346d802543e845c5e79715b99d58fc2bbf58f2a509dccc00f08b634dcb7894"),
    "static_server": (HERE / "compatible-eight-reader-full-app-node-static-server.mjs",
                      "9a73fddf2d2a8e0de1692274ef2b9ef2e031466705948ff038e43c98ae7da93a"),
    "static_owner": (HERE / "compatible-eight-reader-full-app-static-owner-node24.py",
                     "19f25cdfa6e41f5af525897981f84483d790ecc1c15222c324ad1aa5fadca986"),
    "browser_network": (HERE / "compatible-eight-reader-full-app-browser-network.mjs",
                        "3b88a4acea11f9305f0049e04b37e6fb6359616311060698decdf9a80af23511"),
    "browser_receipt_network": (HERE / "compatible-eight-reader-full-app-browser-receipt-network.mjs",
                                "33b77650d3d04dcd98b7e1285e8571b40cebcf81ce251c9c0b1ab77661d2b80e"),
}


class InputFailure(Exception):
    pass


def need(value):
    if value is not True:
        raise InputFailure("compatible_full_app_playwright_inputs_refused")


def pairs(items):
    result = {}
    for key, value in items:
        need(type(key) is str and key not in result); result[key] = value
    return result


def sha(path):
    need(path.is_file() and not path.is_symlink())
    digest = hashlib.sha256(); total = 0
    with path.open("rb") as handle:
        while True:
            part = handle.read(65_536)
            if not part: break
            total += len(part); need(total <= 1_048_576); digest.update(part)
    need(total > 0); return digest.hexdigest()


def load(raw=None):
    canonical = DESCRIPTOR.read_bytes(); raw = canonical if raw is None else raw
    need(type(raw) is bytes and 0 < len(raw) <= 32_768 and raw == canonical)
    try:
        value = json.loads(raw.decode("ascii", "strict"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(InputFailure()))
    except (ValueError, UnicodeError):
        raise InputFailure("compatible_full_app_playwright_inputs_refused") from None
    need(set(value) == {"schema", "status", "canonical", "publication_transition", "packages", "browser",
                        "local_cache_observations", "owned_controller_inputs", "admission"}
         and value["schema"] == "compatible-full-app-playwright-native-inputs.v3"
         and value["status"] == "source-locked-admission-blocked")
    need(value["canonical"] == {
        "predecessor_head": "c08dd21b21e2c8050e59f8270d7364094effbea7",
        "current_head": "834f91ed842ab26a54160a7e43716db3c022def5",
        "current_tree": "00925178686c18aa6f69ea9f85655e1f76fb51b8",
        "exact_app_commit": "809f64e0fd98322c53d9c4e9697df5b515303812",
        "exact_app_tree": "3d96301591652f9d86ccbbdf8ff26efcb7180ce9",
        "exact_app_package_lock_blob_sha1": "56cbf67ce03fd29258acc38ad723e13fa0ab7d6e",
        "exact_app_package_lock_bytes": 491691})
    need(value["publication_transition"] == {
        "observed_404_at_current_path":
            "scripts/project-economy/compatible-eight-reader-full-app-playwright-native-inputs-two.json",
        "candidate_additive_path":
            "scripts/project-economy/compatible-eight-reader-full-app-playwright-native-inputs-three.json",
        "candidate_additive": True,
        "outer_refetch_required": True})
    need(value["packages"] == {
        "@playwright/test": {"version": "1.55.0", "integrity":
            "sha512-04IXzPwHrW69XusN/SIdDdKZBzMfOT9UNT/YiJit/xpy2VuAoB8NHc8Aplb96zsWDddLnbkPL3TsmrS04ZU2xQ=="},
        "playwright": {"version": "1.55.0", "integrity":
            "sha512-sdCWStblvV1YU909Xqx0DhOjPZE4/5lJsIS84IfN9dAZfcl/CIZ5O8l3o0j7hPMjDvqoTF8ZUcc+i/GL5erstA=="},
        "playwright-core": {"version": "1.55.0", "integrity":
            "sha512-GvZs4vU3U5ro2nZpeiwyb0zuFaqb9sUiAJuyrWpcGouD8y9/HLgGbNRjIph7zU9D3hnPaisMl9zG9CgFi/biIg=="}})
    browser = value["browser"]
    need(set(browser) == {"name", "revision", "version", "platform", "archive_path",
                          "archive_origins", "archive_sha256", "metadata_snapshot_sha256",
                          "metadata_snapshot_candidate_path",
                          "registry_source_sha256", "host_platform_source_sha256"}
         and browser["name"] == "chromium" and browser["revision"] == "1187"
         and browser["version"] == "140.0.7339.16" and browser["platform"] == "ubuntu24.04-x64"
         and browser["archive_path"] == "builds/chromium/1187/chromium-linux.zip"
         and browser["archive_sha256"] is None
         and browser["metadata_snapshot_sha256"] == EXPECTED["metadata_snapshot"][1]
         and browser["metadata_snapshot_candidate_path"] ==
             "scripts/project-economy/compatible-eight-reader-full-app-playwright-browsers-1.55.0-three.json"
         and browser["registry_source_sha256"] ==
             "c79e676c73ca11f0cc69954bdb5c3a9ba797449ae1600d500e70f8baf23c5351"
         and browser["host_platform_source_sha256"] ==
             "e27fb61af426b70736a1a7c942a8aa895bd5250fd20bfa4a38a70d0a09255bd1"
         and browser["archive_origins"] == [
             "https://cdn.playwright.dev/dbazure/download/playwright",
             "https://playwright.download.prss.microsoft.com/dbazure/download/playwright",
             "https://cdn.playwright.dev"])
    snapshot = json.loads(EXPECTED["metadata_snapshot"][0].read_text("utf-8"))
    chromium = [row for row in snapshot["browsers"] if row["name"] == "chromium"]
    need(chromium == [{"name": "chromium", "revision": "1187", "installByDefault": True,
                       "browserVersion": "140.0.7339.16"}])
    for path, digest in EXPECTED.values(): need(sha(path) == digest)
    need(value["local_cache_observations"] == {
        "chromium-1187": {"entries": 476, "directories": 8, "files": 468, "bytes": 621257716,
            "tree_fingerprint": "fc7ed38ce14a87f681835537e8ee31f3d787aae22555f4dce3d8ce74044067ad",
            "executable_relative_path": "chrome-linux/chrome", "executable_bytes": 459860328,
            "executable_sha256": "2fa605e3639b8cfbe8037d0b8e0324dbf7f9e6ad7beb345374ecd26764e2d92b"},
        "chromium_headless_shell-1187": {"entries": 15, "directories": 2, "files": 13, "bytes": 336010568,
            "tree_fingerprint": "55c60189eadae5e4d09362ac89d4a46b5768deacf6b372877d05662450f39c5f",
            "executable_relative_path": "chrome-linux/headless_shell", "executable_bytes": 304286872,
            "executable_sha256": "a6bd350a143a92159c12291f336d2f3cc65ea501e521070d9ebb596c8c90a2a7"},
        "ffmpeg-1011": {"entries": 4, "directories": 0, "files": 4, "bytes": 5127582,
            "tree_fingerprint": "dcb305e52832df112e03632f411bdb3708ad376f4b94f521561dbeca83f7c5f9",
            "executable_relative_path": "ffmpeg-linux", "executable_bytes": 5101056,
            "executable_sha256": "460d44f3416005662f528d4b92e7b94ace924e8a0288106d3803b73c56eaadc8"}})
    controller = value["owned_controller_inputs"]
    need(controller == {
        "owned_process": {
            "path": "scripts/project-economy/auth-chain-cleanup-owned-process.py",
            "sha256": "b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a",
            "git_blob_sha1": "11c764813b6ad04337d07ff89886602b98d1bea8",
            "bytes": 11439,
            "present_at_current": True},
        "static_server_sha256": EXPECTED["static_server"][1],
        "static_owner_sha256": EXPECTED["static_owner"][1],
        "browser_network_sha256": EXPECTED["browser_network"][1],
        "browser_receipt_network_sha256": EXPECTED["browser_receipt_network"][1],
        "static_browser_controller_sha256": None})
    need(value["admission"] == {"allowed": False, "blockers": [
        "browser_archive_bytes_and_sha256_not_available_in_local_evidence",
        "installed_cache_tree_is_observation_not_archive_provenance",
        "static_browser_controller_not_reviewed",
        "native_browser_chain_not_run"]})
    return value


def _identity(value):
    return tuple(getattr(value, key) for key in FIELDS)


def observe_tree(root, maximum_files=1024, maximum_bytes=1_073_741_824, seconds=60,
                 maximum_entries=2048, maximum_directories=512, maximum_depth=32):
    """FD-bound full-tree observation; it never establishes archive provenance."""
    need(type(root) is type(Path()) and root.is_absolute() and root.resolve(strict=True) == root
         and type(maximum_files) is int and 0 < maximum_files <= 4096
         and type(maximum_entries) is int and maximum_files <= maximum_entries <= 8192
         and type(maximum_directories) is int and 0 < maximum_directories <= 2048
         and type(maximum_depth) is int and 0 < maximum_depth <= 64
         and type(maximum_bytes) is int and 0 < maximum_bytes <= 2_147_483_648
         and type(seconds) in (int, float) and 0 < seconds <= 120)
    end = time.monotonic() + seconds; rows = []; total = 0; entries = 0; files = 0; directories = 0
    root_info = root.lstat()
    need(stat.S_ISDIR(root_info.st_mode) and root_info.st_uid == os.geteuid()
         and not root.is_symlink() and not root_info.st_mode & 0o022)
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)

    def walk(parent_fd, prefix, depth):
        nonlocal total, entries, files, directories
        need(time.monotonic() < end and depth <= maximum_depth)
        parent_saved = os.fstat(parent_fd); names = []
        with os.scandir(parent_fd) as children:
            for child in children:
                need(time.monotonic() < end)
                entries += 1; need(entries <= maximum_entries)
                name = child.name
                need(type(name) is str and 0 < len(name) <= 255 and name not in (".", "..")
                     and "/" not in name and "\\" not in name and "\x00" not in name)
                names.append(name)
        need(len(names) == len(set(names)))
        for name in sorted(names):
            need(time.monotonic() < end)
            relative = name if not prefix else prefix + "/" + name
            need(len(relative) <= 4096)
            before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            need(before.st_uid == os.geteuid() and not before.st_mode & 0o022)
            if stat.S_ISDIR(before.st_mode):
                directories += 1; need(directories <= maximum_directories)
                fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
                try:
                    need(_identity(os.fstat(fd)) == _identity(before))
                    rows.append(("d", relative, format(stat.S_IMODE(before.st_mode), "o"), 0, "-"))
                    walk(fd, relative, depth + 1)
                    need(_identity(os.fstat(fd)) == _identity(before)
                         and _identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) == _identity(before))
                finally: os.close(fd)
            else:
                files += 1
                need(files <= maximum_files and stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                     and 0 <= before.st_size <= 536_870_912)
                fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
                try:
                    need(_identity(os.fstat(fd)) == _identity(before))
                    digest = hashlib.sha256(); size = 0
                    while size <= before.st_size:
                        need(time.monotonic() < end)
                        part = os.read(fd, min(1_048_576, before.st_size + 1 - size))
                        if not part: break
                        size += len(part); need(size <= before.st_size); digest.update(part)
                    need(size == before.st_size and _identity(os.fstat(fd)) == _identity(before)
                         and _identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) == _identity(before))
                finally: os.close(fd)
                total += size; need(total <= maximum_bytes)
                rows.append(("f", relative, format(stat.S_IMODE(before.st_mode), "o"), size, digest.hexdigest()))
        need(_identity(os.fstat(parent_fd)) == _identity(parent_saved) and time.monotonic() < end)

    try:
        need(_identity(os.fstat(root_fd)) == _identity(root_info))
        walk(root_fd, "", 0)
        need(files > 0 and entries == files + directories
             and _identity(os.fstat(root_fd)) == _identity(root_info)
             and _identity(root.lstat()) == _identity(root_info) and time.monotonic() < end)
    finally: os.close(root_fd)
    packet = b"".join((kind + "\0" + path + "\0" + mode + "\0" + str(size) + "\0" + digest + "\0").encode("utf-8")
                      for kind, path, mode, size, digest in rows)
    return {"entries": entries, "directories": directories, "files": files, "bytes": total,
            "tree_fingerprint": hashlib.sha256(packet).hexdigest()}


def main():
    try:
        load()
    except BaseException:
        print("FULL_APP_PLAYWRIGHT_INPUTS HOLD invalid_source_closure")
        return 78
    print("FULL_APP_PLAYWRIGHT_INPUTS HOLD archive_sha_and_owned_controller_required")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
