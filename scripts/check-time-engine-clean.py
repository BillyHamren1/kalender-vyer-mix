#!/usr/bin/env python3
"""
check-time-engine-clean.py
==========================
Hard guard: the new Time Engine flow MUST NOT write to legacy time tables.

Allowed time-table writes in scoped files:
  - active_time_registrations
  - staff_location_history (GPS append)

Forbidden writes (insert/update/upsert/delete) in scoped files/regions:
  - workdays
  - location_time_entries
  - time_reports
  - travel_time_logs
  - current_time_registration

Scope:
  Full files:
    supabase/functions/get-current-time-registration/index.ts
    supabase/functions/get-active-time-registration-status/index.ts
    supabase/functions/get-timer-time-segments/index.ts
  Whole dir:
    supabase/functions/_shared/time-engine/
  mobile-app-api/index.ts only inside:
    handleStartTimeRegistration / handleStopTimeRegistration / handleUpdateLocation
    + the inline "TIME ENGINE v2: GPS-driven auto-start" block.

Exit 0 = clean, 1 = forbidden write found.
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FORBIDDEN_TABLES = [
    "workdays",
    "location_time_entries",
    "time_reports",
    "travel_time_logs",
    "current_time_registration",
]

FULL_FILES = [
    "supabase/functions/get-current-time-registration/index.ts",
    "supabase/functions/get-active-time-registration-status/index.ts",
    "supabase/functions/get-timer-time-segments/index.ts",
]

SCOPED_DIRS = ["supabase/functions/_shared/time-engine"]

MOBILE_API = "supabase/functions/mobile-app-api/index.ts"
MOBILE_API_REGIONS = [
    "handleStartTimeRegistration",
    "handleStopTimeRegistration",
    "handleUpdateLocation",  # may not exist as named fn — covered by geofence block
]
MOBILE_API_REQUIRED = {"handleStartTimeRegistration", "handleStopTimeRegistration"}

WRITE_VERBS = r"(insert|update|upsert|delete)"

RED, GRN, YEL, CLR = "\033[31m", "\033[32m", "\033[33m", "\033[0m"


def build_regex(table: str) -> re.Pattern[str]:
    # .from('table')...<up to 400 chars>...write-verb(
    pat = (
        r"from\(\s*['\"]" + re.escape(table) + r"['\"]\s*\)"
        r"[^;]{0,400}\." + WRITE_VERBS + r"\b"
    )
    return re.compile(pat, re.DOTALL)


def scan_text(label: str, text: str, failures: list[str]) -> None:
    for table in FORBIDDEN_TABLES:
        rx = build_regex(table)
        for m in rx.finditer(text):
            snippet = m.group(0)[:200].replace("\n", " ")
            failures.append(f"{RED}✗ {label}{CLR} writes to forbidden '{table}':\n  {snippet}")


def scan_full_file(rel: str, failures: list[str]) -> None:
    p = ROOT / rel
    if not p.is_file():
        print(f"{YEL}? skipping missing file:{CLR} {rel}")
        return
    scan_text(rel, p.read_text(encoding="utf-8"), failures)


def scan_dir(rel: str, failures: list[str]) -> None:
    d = ROOT / rel
    if not d.is_dir():
        print(f"{YEL}? skipping missing dir:{CLR} {rel}")
        return
    for f in sorted(d.rglob("*.ts")):
        rp = f.relative_to(ROOT).as_posix()
        scan_text(rp, f.read_text(encoding="utf-8"), failures)


def extract_function_region(text: str, name: str) -> str | None:
    """Find `function NAME` (optionally async) and return its body via brace
    matching. Returns None if not found."""
    m = re.search(r"\b(?:async\s+)?function\s+" + re.escape(name) + r"\b", text)
    if not m:
        return None
    # Find first '{' after the signature.
    i = text.find("{", m.end())
    if i < 0:
        return None
    depth = 0
    for j in range(i, len(text)):
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[m.start() : j + 1]
    return text[m.start() :]


def extract_block_until_next_fn(text: str, marker: str) -> str | None:
    i = text.find(marker)
    if i < 0:
        return None
    rest = text[i:]
    m = re.search(r"^async function ", rest, re.MULTILINE)
    return rest[: m.start()] if m else rest


def scan_mobile_api(failures: list[str]) -> None:
    p = ROOT / MOBILE_API
    if not p.is_file():
        print(f"{YEL}? skipping missing file:{CLR} {MOBILE_API}")
        return
    text = p.read_text(encoding="utf-8")
    for region in MOBILE_API_REGIONS:
        body = extract_function_region(text, region)
        if body is None:
            if region in MOBILE_API_REQUIRED:
                failures.append(f"{RED}✗ region not found in {MOBILE_API}: {region}{CLR}")
            continue
        scan_text(f"{MOBILE_API}::{region}", body, failures)

    geo = extract_block_until_next_fn(text, "TIME ENGINE v2: GPS-driven auto-start")
    if geo:
        scan_text(f"{MOBILE_API}::update_location(geofence+time-engine block)", geo, failures)


def main() -> int:
    print("▶ Time Engine cleanliness check")
    print(f"  forbidden tables: {' '.join(FORBIDDEN_TABLES)}")
    print()
    failures: list[str] = []
    for f in FULL_FILES:
        scan_full_file(f, failures)
    for d in SCOPED_DIRS:
        scan_dir(d, failures)
    scan_mobile_api(failures)

    print()
    if failures:
        for line in failures:
            print(line)
        print(f"\n{RED}FAIL{CLR}: {len(failures)} forbidden write(s) found in new Time Engine flow.")
        return 1
    print(f"{GRN}OK{CLR}: new Time Engine flow only touches allowed tables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
