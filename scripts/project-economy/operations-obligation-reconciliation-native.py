#!/usr/bin/env python3
"""Disposable native PostgreSQL verification for obligation reconciliation v1."""
from __future__ import annotations

import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
IMAGE = "docker.io/library/postgres@sha256:e27d24a29acce1b554771ba68c43afa55446069d228310451bb8c96c1531d2cb"
SOCKET = "unix:///var/run/docker.sock"
EXPECTED_BINARY = "postgres (PostgreSQL) 15.19 (Debian 15.19-1.pgdg13+2)"
EXPECTED_PACKAGE = "15.19-1.pgdg13+2"


def run(args: list[str], *, input_text: str | None = None, timeout: int = 120, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("DOCKER_CONTEXT", None)
    env.pop("DOCKER_HOST", None)
    return subprocess.run(args, input=input_text, text=True, capture_output=True, timeout=timeout, check=check, env=env)


def docker(*args: str, timeout: int = 120, check: bool = True, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return run(["docker", "--host", SOCKET, *args], input_text=input_text, timeout=timeout, check=check)


def psql(cid: str, sql: str, *, file_mode: bool = False) -> str:
    args = ["exec", "-i", "-e", "PGOPTIONS=-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000", cid,
            "psql", "-X", "--no-password", "-U", "postgres", "-d", "reconcile", "-v", "ON_ERROR_STOP=1"]
    if not file_mode:
        args.extend(["-At", "-c", sql])
        sql = ""
    return docker(*args, input_text=sql, timeout=180).stdout


def command(idempotency: str) -> str:
    payload = {
        "schema_version": "operations-obligation-reconciliation-append.v1",
        "project_id": "22222222-2222-4222-8222-222222222222",
        "obligation_id": "33333333-3333-4333-8333-333333333333",
        "expected_revision": 11,
        "expected_baseline_event_id": "44444444-4444-4444-8444-444444444444",
        "expected_invoice_source_count": 2,
        "expected_credit_source_count": 1,
        "expected_hired_source_count": 1,
        "supersessions": [{"prior_source_anchor": "a" * 64, "current_source_anchor": "b" * 64}],
        "close_action": "none",
        "idempotency_key": idempotency,
        "reason": "concurrent reconciliation CAS proof",
    }
    literal = json.dumps(payload, separators=(",", ":")).replace("'", "''")
    return (
        "set request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';"
        "set request.jwt.claim.organization_id='11111111-1111-4111-8111-111111111111';"
        "set request.jwt.claim.role='admin';set role authenticated;"
        f"select public.append_operations_obligation_reconciliation_v1('{literal}'::jsonb)::text;"
    )


def finalize_result(result: int, cleanup_failed: bool, success_message: str) -> int:
    """A cleanup failure always overrides a successful verification result."""
    if cleanup_failed:
        return 1
    if result == 0:
        print(success_message)
    return result


def main() -> int:
    cid = ""
    phase = "preflight"
    result = 1
    success_message = ""
    cleanup_failed = False
    if run(["sh", "-c", "command -v docker"], check=False).returncode != 0:
        print("OPS_RECONCILIATION_NATIVE_UNAVAILABLE reason=docker_cli_missing", file=sys.stderr)
        return 69
    try:
        phase = "image_pull"
        docker("pull", "--platform", "linux/amd64", IMAGE, timeout=180)
        phase = "container_create"
        cid = docker(
            "create", "--platform", "linux/amd64", "--network", "none", "--read-only",
            "--memory", "805306368", "--memory-swap", "805306368", "--cpus", "1.0", "--pids-limit", "256",
            "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=268435456",
            "--tmpfs", "/var/run/postgresql:rw,noexec,nosuid,nodev,size=16777216",
            "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216",
            "-e", "POSTGRES_PASSWORD=synthetic-only", "-e", "POSTGRES_DB=reconcile", IMAGE,
        ).stdout.strip()
        if len(cid) != 64:
            raise RuntimeError("invalid_container_id")
        phase = "container_start"
        docker("start", cid, timeout=30)
        phase = "readiness"
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if docker("exec", cid, "pg_isready", "-U", "postgres", "-d", "reconcile", timeout=5, check=False).returncode == 0:
                break
        else:
            raise RuntimeError("postgres_readiness_timeout")
        phase = "identity"
        binary = docker("exec", cid, "postgres", "--version", timeout=10).stdout.strip()
        package = docker("exec", cid, "/bin/sh", "-ceu", 'printf "%s" "$PG_VERSION"', timeout=10).stdout.strip()
        if binary != EXPECTED_BINARY or package != EXPECTED_PACKAGE:
            raise RuntimeError(f"postgres_identity_mismatch binary={binary!r} package={package!r}")
        phase = "setup"
        psql(cid, (ROOT / "scripts/project-economy/operations-obligation-reconciliation-native-setup.sql").read_text(), file_mode=True)
        phase = "migration"
        psql(cid, (ROOT / "supabase/migrations/20261003210000_operations_obligation_reconciliation_v1.sql").read_text(), file_mode=True)
        phase = "matrix"
        output = psql(cid, (ROOT / "scripts/project-economy/operations-obligation-reconciliation-postgres-test.sql").read_text(), file_mode=True)
        if "PASS operations-obligation-reconciliation-postgres" not in output:
            raise RuntimeError("matrix_pass_receipt_missing")
        phase = "concurrency"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda sql: psql(cid, sql), [command("reconcile-concurrent-left-0011"), command("reconcile-concurrent-right-0012")]))
        outcomes = sorted(json.loads(line.strip().splitlines()[-1])["outcome"] for line in results)
        if outcomes != ["accepted", "stale"]:
            raise RuntimeError(f"unexpected_concurrency_outcomes={outcomes}")
        phase = "postconditions"
        state = json.loads(psql(cid, "set request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';set request.jwt.claim.organization_id='11111111-1111-4111-8111-111111111111';set request.jwt.claim.role='admin';set role authenticated;select public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')::text;").strip().splitlines()[-1])
        if state["current_revision"] != 12 or state["current"]["current_amount_minor"] != 1000 or state["frozen_close"]["current_amount_minor"] != 1500:
            raise RuntimeError("postcondition_mismatch")
        result = 0
        success_message = "OPS_RECONCILIATION_NATIVE_PASS postgres=15.19 snapshots=12 concurrent=accepted+stale no_external_writes=true"
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, RuntimeError, json.JSONDecodeError) as exc:
        print(f"OPS_RECONCILIATION_NATIVE_FAILURE phase={phase} error={type(exc).__name__}", file=sys.stderr)
        if isinstance(exc, subprocess.CalledProcessError):
            print(exc.stderr[-4000:], file=sys.stderr)
        result = 1
    finally:
        if cid:
            removed = docker("container", "rm", "--force", cid, timeout=30, check=False)
            survived = docker("inspect", cid, timeout=10, check=False).returncode == 0
            if removed.returncode != 0 or survived:
                print("OPS_RECONCILIATION_NATIVE_FAILURE phase=cleanup error=container_survived", file=sys.stderr)
                cleanup_failed = True
    return finalize_result(result, cleanup_failed, success_message)


if __name__ == "__main__":
    raise SystemExit(main())
