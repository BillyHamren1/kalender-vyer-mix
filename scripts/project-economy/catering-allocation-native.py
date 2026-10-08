#!/usr/bin/env python3
"""Fresh native PostgreSQL authority/producer proof. No hosted or provider calls."""
import argparse
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import tempfile
import threading
import time
from urllib.parse import unquote, urlsplit
import uuid

DATABASE = "eventflow_catering_allocation_v2_ci"
SCHEMA_PATHS = [
    "scripts/project-economy/operations-postgres-bootstrap.sql",
    "scripts/project-economy/operations-project-review-bootstrap.sql",
    "supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql",
    "supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql",
    "supabase/migrations/20261001232438_operations_personnel_project_reviews.sql",
    "supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql",
    "supabase/migrations/20261001235558_operations_catering_project_evidence.sql",
    "supabase/migrations/20261002003928_operations_personnel_historical_rate_admin.sql",
    "supabase/migrations/20261002014937_operations_project_scope_enrollment.sql",
    "supabase/migrations/20261002023731_operations_project_obligation_authority.sql",
    "supabase/migrations/20261002024013_operations_catering_finance_delivery_v1.sql",
    "supabase/migrations/20261002044059_operations_catering_allocation_authority_v2.sql",
    "supabase/migrations/20261002052437_operations_catering_allocation_delivery_v2.sql",
]


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def isolated_environment(env):
    require(env.get("CI") == "true" and env.get("OPERATIONS_CATERING_ALLOCATION_ISOLATED") == "1", "isolated CI flags required")
    url = urlsplit(env.get("TEST_DATABASE_URL", ""))
    require(url.scheme in ("postgres", "postgresql") and url.hostname in ("localhost", "127.0.0.1")
            and url.port == 5432 and unquote(url.path) == "/" + DATABASE
            and unquote(url.username or "") == "postgres" and not url.query and not url.fragment,
            "exact loopback disposable database URL required")
    child = {k: v for k, v in env.items() if not k.startswith("PG")}
    child.update(PGHOST=url.hostname, PGPORT="5432", PGDATABASE=DATABASE, PGUSER="postgres",
                 PGPASSWORD=unquote(url.password or ""), PGCONNECT_TIMEOUT="3")
    return child


def literal(value):
    require(isinstance(value, str) and "\0" not in value, "SQL literal text required")
    return "'" + value.replace("'", "''") + "'"


class SqlFailure(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__("native SQL failed; SQLSTATE=" + code)


class Session:
    def __init__(self, env, label):
        self.name = "catering-allocation-" + label + "-" + uuid.uuid4().hex[:8]
        self.process = subprocess.Popen(["psql", "-X", "--no-password", "-q", "-A", "-t", "-F", "\x1f",
                                         "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"],
                                        env=dict(env, PGAPPNAME=self.name), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                        bufsize=1, start_new_session=True)
        self.lines = queue.Queue()
        self.pending = None
        threading.Thread(target=self.read, daemon=True).start()
        try:
            self.execute("set statement_timeout='8s';set idle_in_transaction_session_timeout='20s';")
            self.pid = int(self.execute("select pg_backend_pid();")[-1])
        except Exception:
            self.close()
            raise

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip("\n"))
        self.lines.put(None)

    def start(self, sql):
        require(self.pending is None, "one pending operation per native session")
        self.pending = "__native_done_" + uuid.uuid4().hex
        self.process.stdin.write(sql + "\nselect " + literal(self.pending) + ";\n")
        self.process.stdin.flush()

    def finish(self):
        require(self.pending is not None, "pending native operation required")
        result = []
        deadline = time.monotonic() + 12
        while True:
            remaining = deadline - time.monotonic()
            require(remaining > 0, "native operation deadline exceeded")
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty:
                raise RuntimeError("native operation deadline exceeded") from None
            if line is None:
                codes = [m.group(1) for line in result if (m := re.search(r"(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b", line))]
                raise SqlFailure(codes[-1] if codes else "unknown")
            if line == self.pending:
                self.pending = None
                return [line for line in result if line]
            require(sum(map(len, result)) + len(line) <= 2_097_152, "native result exceeded private bound")
            result.append(line)

    def execute(self, sql):
        self.start(sql)
        return self.finish()

    def json(self, sql):
        return self.parse_json(self.execute(sql))

    @staticmethod
    def parse_json(output):
        rows = [line for line in output if line.startswith("{")]
        require(len(rows) == 1, "one native JSON result required")
        return json.loads(rows[0])

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.close()
                self.process.wait(timeout=2)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                try:
                    os.killpg(self.process.pid, signal.SIGTERM)
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(self.process.pid, signal.SIGKILL)
                    self.process.wait(timeout=2)


def wait_lock(observer, waiter, blocker):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        rows = observer.execute("select pg_stat_clear_snapshot();select exists(select 1 from pg_stat_activity where application_name="
                                + literal(waiter.name) + " and wait_event_type='Lock' and " + str(blocker.pid) + "=any(pg_blocking_pids(pid)));")
        if rows[-1] == "t":
            return
        time.sleep(0.02)
    raise RuntimeError("actual native blocking relationship not observed")


def run_deno(root, arguments, env):
    result = subprocess.run([env.get("DENO_BIN", "deno"), *arguments], cwd=root, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
    require(result.returncode == 0, "native Deno source/checker failed")
    return result.stdout


def authenticate(actor):
    return "begin;set local role authenticated;select set_config('request.jwt.claim.sub'," + literal(actor) + ",true);"


def producer_sql(prefix, revision, current, snapshot=None, raw=None):
    org = prefix + "0000-4000-8000-000000000001"
    if snapshot is None:
        snapshot = "jsonb_set(fixture->'correction_snapshot','{publication_revision}',to_jsonb(" + str(revision) + "))"
    if raw is None:
        raw = "fixture->>'corrected_raw_entry'"
    return ("begin;set local role service_role;select public.publish_operations_catering_cost_v1(" + snapshot + "," + raw
            + ",null,'" + prefix + "0000-4000-8000-000000000010',encode(sha256(convert_to(" + raw + ",'UTF8')),'hex'),"
            + str(current) + "," + literal("native-producer-" + prefix + str(revision)) + ") from public.catering_allocation_native_fixture where organization_id='" + org + "';")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--finance-root", required=True)
    args = parser.parse_args()
    env = isolated_environment(os.environ)
    root = Path(args.root).resolve(strict=True)
    finance = Path(args.finance_root).resolve(strict=True)
    require((finance / "src/domain/cateringProjectAllocationDelivery.ts").is_file(), "pinned Finance validator root required")
    os.umask(0o077)
    sessions = []
    try:
        observer = Session(env, "observer");sessions.append(observer)
        require(observer.execute("select current_database()='" + DATABASE + "' and current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_tables where schemaname not like 'pg_%' and schemaname<>'information_schema');")[-1] == "t", "fresh empty disposable schema required before DDL")
        for path in SCHEMA_PATHS:
            observer.execute((root / path).read_text())
        controls = json.loads(run_deno(root, ["run", "scripts/project-economy/catering-allocation-native-fixture.ts"], env))
        observer.execute("select set_config('test.catering_allocation_vectors'," + literal(json.dumps(controls["vectors"], ensure_ascii=False)) + ",false);")
        observer.execute((root / "scripts/project-economy/catering-allocation-hash-parity-postgres-test.sql").read_text())
        observer.execute("select set_config('test.catering_allocation_fixture'," + literal(json.dumps(controls["first"], ensure_ascii=False)) + ",false);")
        fixture_sql = (root / "scripts/project-economy/catering-allocation-authority-postgres-test.sql").read_text()
        rollback_boundary = "\nrollback;\n"
        require(fixture_sql.count(rollback_boundary) == 1, "exact authority rollback boundary required")
        capture_fixture = (root / "scripts/project-economy/catering-allocation-delivery-postgres-test.sql").read_text()
        results = observer.execute(fixture_sql.replace(rollback_boundary, "\n" + capture_fixture + rollback_boundary))
        vectors = [line.split("\x1f") for line in results if "\x1f" in line]
        require(len(vectors) == 1 and len(vectors[0]) == 2, "actual native SQL parity row missing")
        with tempfile.TemporaryDirectory(prefix="catering-allocation-native-") as private:
            vector_path = Path(private) / "sql-vector.json"
            vector_path.write_text(json.dumps(dict(allocation_event=json.loads(vectors[0][0]), allocated_snapshot=json.loads(vectors[0][1])), ensure_ascii=False))
            os.chmod(vector_path, 0o600)
            run_deno(root, ["run", "--allow-read=" + str(root) + "," + str(finance) + "," + private,
                            "scripts/project-economy/catering-allocation-sql-vector-check.ts", str(vector_path), str(finance)], env)
        print("PASS native authority positive/negative/private SQL Operations Finance hash parity")
        print("PASS native default-off immutable allocation capture and synthetic predecessor receipt control; Finance v2 delivery not proven")
        marker = "set local role authenticated;\ndo $$begin\n begin perform public.reassign_operations_catering_project_v2"
        require(fixture_sql.count(marker) >= 1, "frozen seed boundary missing")
        seed = fixture_sql.split(marker, 1)[0]
        observer.execute("create table public.catering_allocation_native_fixture(organization_id uuid primary key,fixture jsonb not null,command jsonb not null);grant select on public.catering_allocation_native_fixture to authenticated,service_role;")
        for prefix, control in [("96000000-", controls["first"]), ("97000000-", controls["second"])]:
            observer.execute("select set_config('test.catering_allocation_fixture'," + literal(json.dumps(control, ensure_ascii=False)) + ",false);")
            observer.execute(seed.replace("96000000-", prefix) + "\ninsert into public.catering_allocation_native_fixture values('" + prefix + "0000-4000-8000-000000000001',current_setting('test.catering_allocation_fixture')::jsonb,current_setting('test.catering_allocation_command')::jsonb);update operations_catering_allocation_private.gates set enabled=true where organization_id='" + prefix + "0000-4000-8000-000000000001';commit;")
        allocation = Session(env, "allocation-first");sessions.append(allocation)
        producer = Session(env, "producer-after");sessions.append(producer)
        first = allocation.json(authenticate("96000000-0000-4000-8000-000000000013") + "select public.reassign_operations_catering_project_v2(command) from public.catering_allocation_native_fixture where organization_id='96000000-0000-4000-8000-000000000001';")
        require(first["outcome"] == "accepted", "native allocation did not acquire real write locks")
        producer.start(producer_sql("96000000-", 3, 2) + "commit;")
        wait_lock(observer, producer, allocation)
        allocation.execute("commit;")
        try:
            producer.finish();raise RuntimeError("old-target producer survived allocation")
        except SqlFailure as failure:
            require(failure.code == "42501", "unexpected stale-map producer failure")
        print("PASS native authenticated allocation holds map producer waits and cannot reset old target")
        producer_first = Session(env, "producer-first");sessions.append(producer_first)
        allocation_after = Session(env, "allocation-after");sessions.append(allocation_after)
        published = producer_first.json(producer_sql("97000000-", 3, 2))
        require(published["outcome"] == "accepted", "native producer did not acquire real write locks")
        allocation_after.start(authenticate("97000000-0000-4000-8000-000000000013") + "select public.reassign_operations_catering_project_v2(command) from public.catering_allocation_native_fixture where organization_id='97000000-0000-4000-8000-000000000001';commit;")
        wait_lock(observer, allocation_after, producer_first)
        producer_first.execute("commit;")
        stale = Session.parse_json(allocation_after.finish())
        require(stale["outcome"] == "stale_source", "concurrent source lost CAS protection")
        print("PASS native producer holds map allocation waits then returns stale source")
        # Owner setup resolves private source evidence. Authenticated sessions
        # invoke the actual narrow command; no production raw-read grant is added.
        observer.execute("""update public.catering_allocation_native_fixture f set command=f.command||jsonb_build_object('expected_source_revision',3,'expected_observation_id',p.observation_id,
 'expected_source_fingerprint',p.snapshot->>'source_fingerprint','idempotency_key','native-after-source-cas') from public.operations_catering_cost_publications p
 where p.organization_id=f.organization_id and f.organization_id='97000000-0000-4000-8000-000000000001' and p.source_revision=3;""")
        fresh = allocation_after.json(authenticate("97000000-0000-4000-8000-000000000013") + """
 select public.reassign_operations_catering_project_v2(command) from public.catering_allocation_native_fixture
 where organization_id='97000000-0000-4000-8000-000000000001';commit;
 """)
        require(fresh["outcome"] == "accepted" and fresh["source_revision"] == 4, "fresh command failed after real source CAS")
        third_snapshot = literal(json.dumps(controls["third_snapshot"], ensure_ascii=False))
        third_raw = literal(controls["third_raw_entry"])
        next_source = observer.json("begin;set local role service_role;select public.publish_operations_catering_cost_v1(" + third_snapshot + "::jsonb||jsonb_build_object('project_id',m.project_id,'obligation_id',m.obligation_id,'mapping_revision',m.mapping_revision),"
                                   + third_raw + ",null,m.id," + literal(controls["third_raw_entry_sha256"]) + ",4,'native-new-source-after-allocation')"
                                   + " from operations_catering_allocation_private.heads h join public.operations_catering_project_mappings m on m.id=h.mapping_id"
                                   + " where h.organization_id='97000000-0000-4000-8000-000000000001';commit;")
        require(next_source["outcome"] == "accepted", "future genuine source failed latest allocation lineage")
        final = observer.json("""select jsonb_build_object(
 'first_revision',(select current_revision from public.operations_catering_cost_streams where organization_id='96000000-0000-4000-8000-000000000001'),
 'first_snapshot',(select snapshot from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=3),
 'second_revision',(select current_revision from public.operations_catering_cost_streams where organization_id='97000000-0000-4000-8000-000000000001'),
 'second_allocated',(select snapshot from public.operations_catering_cost_publications where organization_id='97000000-0000-4000-8000-000000000001' and source_revision=4),
 'second_latest',(select snapshot from public.operations_catering_cost_publications where organization_id='97000000-0000-4000-8000-000000000001' and source_revision=5),
 'events',(select count(*) from operations_catering_allocation_private.events),
 'observations',(select count(*) from public.operations_catering_source_observations),
 'nonparked',(select count(*) from public.operations_catering_cost_outbox where status<>'parked'),
 'financial_baselines',(select count(*) from public.operations_project_obligation_baselines where estimate_minor is not null or committed_minor is not null));""")
        require(final["first_revision"] == 3 and final["first_snapshot"]["amount_minor"] == 52502
                and final["first_snapshot"]["project_id"] == "96000000-0000-4000-8000-000000000011", "allocation-first final state changed")
        require(final["second_revision"] == 5 and final["second_allocated"]["amount_minor"] == 45002
                and final["second_allocated"]["source_time_entry_version"] == 2
                and final["second_latest"]["amount_minor"] == 37501 and final["second_latest"]["source_time_entry_version"] == 3
                and final["second_latest"]["project_id"] == "97000000-0000-4000-8000-000000000011"
                and final["second_latest"]["hourly_rate_minor"] == 30001
                and final["events"] == 2 and final["observations"] == 4 and final["nonparked"] == 0
                and final["financial_baselines"] == 0, "producer-first retry/future source provenance invariant failed")
        print("PASS native fresh authenticated retry preserves45002 future source version3 adopts latest allocation")
        print("PASS native authority proof only; hosted_human_attest=false; Finance_v2_delivery=false")
    finally:
        for session in reversed(sessions):
            session.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        print("FAIL native Catering allocation; error_class=" + type(failure).__name__)
        raise SystemExit(1)
