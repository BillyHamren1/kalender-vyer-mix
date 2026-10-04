#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/../../.."
TASK_PHASE=preflight
trap 'echo "Native read harness closed phase: $TASK_PHASE" >&2' ERR
TASK_ROOT=$(pwd -P)
TASK_RUNTIME="$TASK_ROOT/scripts/project-economy/project-evidence-http-runtime"
# Environment and exact source/path checks precede the first Docker command.
TASK_NAMESPACE=$(python3 "$TASK_RUNTIME/isolation.py")
python3 "$TASK_RUNTIME/verify-sources.py"
TASK_COMPOSE=(docker compose --project-directory "$TASK_RUNTIME" -p "$TASK_NAMESPACE" -f "$TASK_RUNTIME/compose.yml")
command -v docker >/dev/null
command -v deno >/dev/null
if [[ -n "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$TASK_NAMESPACE")" ||
      -n "$(docker volume ls --quiet --filter "label=com.docker.compose.project=$TASK_NAMESPACE")" ]]; then
  echo 'Existing owned namespace refused; no stale identity or volume takeover' >&2
  exit 1
fi
TASK_PRIVATE=$(mktemp -d "${RUNNER_TEMP:-/tmp}/project-evidence-http.XXXXXXXX")
chmod 700 "$TASK_PRIVATE"
TASK_SERVER_PID=''
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$TASK_SERVER_PID" ]]; then
    kill -TERM "$TASK_SERVER_PID" 2>/dev/null || true
    for attempt in $(seq 1 20); do kill -0 "$TASK_SERVER_PID" 2>/dev/null || break; sleep 0.1; done
    if kill -0 "$TASK_SERVER_PID" 2>/dev/null; then kill -KILL "$TASK_SERVER_PID" 2>/dev/null || true; fi
    for attempt in $(seq 1 20); do kill -0 "$TASK_SERVER_PID" 2>/dev/null || break; sleep 0.1; done
    if ! kill -0 "$TASK_SERVER_PID" 2>/dev/null; then wait "$TASK_SERVER_PID" 2>/dev/null || true; else echo 'Owned controller cleanup deadline failed' >&2; status=1; fi
  fi
  timeout 10 "${TASK_COMPOSE[@]}" logs --no-color > "$TASK_PRIVATE/private-stack.log" 2>&1 || true
  timeout 35 "${TASK_COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$TASK_PRIVATE"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
TASK_PHASE=ephemeral_credentials
python3 - "$TASK_PRIVATE" <<'PY_KEYS'
from pathlib import Path
import secrets,sys
for name in ('jwt','control'):
    path=Path(sys.argv[1])/name
    path.write_text(secrets.token_hex(32)+'\n');path.chmod(0o600)
PY_KEYS
read -r PROJECT_EVIDENCE_JWT_SECRET < "$TASK_PRIVATE/jwt"
read -r PROJECT_EVIDENCE_CONTROL_TOKEN < "$TASK_PRIVATE/control"
export PROJECT_EVIDENCE_JWT_SECRET PROJECT_EVIDENCE_CONTROL_TOKEN
export PROJECT_EVIDENCE_DATABASE_NAME=eventflow_project_evidence_http_runtime
export PROJECT_EVIDENCE_POSTGREST_URL=http://127.0.0.1:55610/
export PROJECT_EVIDENCE_CONTROL_URL=http://127.0.0.1:55611/
export PROJECT_EVIDENCE_COMPOSE_NAMESPACE="$TASK_NAMESPACE"
export PROJECT_EVIDENCE_COMPOSE_PATH="$TASK_RUNTIME/compose.yml"
TASK_PHASE=database_start
"${TASK_COMPOSE[@]}" up -d --wait database > "$TASK_PRIVATE/private-start.log" 2>&1
ready=false
for attempt in $(seq 1 30); do
  if actual=$("${TASK_COMPOSE[@]}" exec -T database psql -X -h 127.0.0.1 -U postgres -d eventflow_project_evidence_http_runtime -At -c 'select current_database()' 2> "$TASK_PRIVATE/private-ready.log") && [[ "$actual" == 'eventflow_project_evidence_http_runtime' ]]; then ready=true; break; fi
  sleep 1
 done
"$ready" || { echo 'Owned named project evidence database TCP initialization failed' >&2; exit 1; }
apply_sql() {
  local path=$1; shift
  "${TASK_COMPOSE[@]}" exec -T -e 'PGOPTIONS=-c statement_timeout=30000 -c lock_timeout=10000 -c test.project_evidence_fixture=true' database \
    psql -X -U postgres -d eventflow_project_evidence_http_runtime -v ON_ERROR_STOP=1 -v VERBOSITY=verbose "$@" \
    < "$path" > "$TASK_PRIVATE/private-sql.log" 2>&1 || {
    echo "Owned project evidence SQL step failed: $path" >&2
    python3 - "$TASK_PRIVATE/private-sql.log" <<'PY_ERROR' >&2
from pathlib import Path
import re,sys
codes=re.findall(r'ERROR:\s+([A-Z0-9]{5}):',Path(sys.argv[1]).read_text())
print('Owned SQL error class: '+(codes[-1] if codes else 'unclassified'))
PY_ERROR
    return 1
  }
}
TASK_PHASE=fresh_schema
# A genuinely empty public/Auth domain is required BEFORE seeded canonical DDL.
cat > "$TASK_PRIVATE/fresh.sql" <<'SQL_FRESH'
do $$begin
if current_database()<>'eventflow_project_evidence_http_runtime' or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth')) or exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')) then raise exception 'fresh_owned_cluster_required' using errcode='55000';end if;
end;$$;
SQL_FRESH
apply_sql "$TASK_PRIVATE/fresh.sql"
python3 - "$TASK_RUNTIME/schema-closure.json" > "$TASK_PRIVATE/ordered-paths" <<'PY_PATHS'
import json,sys
for path in json.load(open(sys.argv[1]))['ordered_paths']:print(path)
PY_PATHS
TASK_PHASE=canonical_schema
while IFS= read -r path; do apply_sql "$TASK_ROOT/$path"; done < "$TASK_PRIVATE/ordered-paths"
cat > "$TASK_PRIVATE/canonical-seed.sql" <<'SQL_SEED'
do $$begin
if (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3 or (select count(*) from public.projects)<>3 or (select count(*) from public.bookings)<>1 or (select count(*) from public.large_projects)<>1 or (select count(*) from public.packing_projects)<>1 or (select count(*) from public.large_project_bookings)<>1 or (select count(*) from public.packing_project_bookings)<>1 then raise exception 'exact_canonical_seed_required' using errcode='55000';end if;
end;$$;
SQL_SEED
TASK_PHASE=canonical_identity
apply_sql "$TASK_PRIVATE/canonical-seed.sql"
TASK_PHASE=fixture_generator
deno run --cached-only scripts/project-economy/operations-obligation-fixture.ts > "$TASK_PRIVATE/fixture.json" 2> "$TASK_PRIVATE/private-generator.log"
TASK_PHASE=fixture_commit
apply_sql scripts/project-economy/operations-project-evidence-http-fixture.sql -v "fixture=$(cat "$TASK_PRIVATE/fixture.json")"
if ! grep -Fq 'project-evidence-http-fixture SETUP PASS' "$TASK_PRIVATE/private-sql.log"; then echo 'Exact project evidence setup proof missing' >&2; exit 1; fi
TASK_PHASE=rest_role
apply_sql "$TASK_RUNTIME/postgrest-role.sql"
TASK_PHASE=rest_start
"${TASK_COMPOSE[@]}" up -d rest gateway > "$TASK_PRIVATE/private-rest-start.log" 2>&1
ready=false
for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 1 http://127.0.0.1:55610/ >/dev/null; then ready=true; break; fi
  sleep 1
done
"$ready" || { echo 'Owned project evidence REST readiness failed' >&2; exit 1; }
TASK_PHASE=controller_start
deno run --cached-only --allow-env --allow-run=docker --allow-net=127.0.0.1:55611 \
  "$TASK_RUNTIME/control.ts" > "$TASK_PRIVATE/private-controller.log" 2>&1 &
TASK_SERVER_PID=$!
ready=false
for attempt in $(seq 1 20); do
  if curl --silent --max-time 1 -o /dev/null http://127.0.0.1:55611/state; then ready=true; break; fi
  sleep 1
done
"$ready" || { echo 'Owned project evidence controller readiness failed' >&2; exit 1; }
TASK_PHASE=exact_engine_versions
git rev-parse HEAD
"${TASK_COMPOSE[@]}" exec -T database psql -X -U postgres -d eventflow_project_evidence_http_runtime -At -c 'select version()'
"${TASK_COMPOSE[@]}" exec -T rest /bin/postgrest --version
deno --version
docker image inspect postgres:15.19 postgrest/postgrest:v12.2.3 nginx:1.28.0-alpine --format '{{json .RepoDigests}}'
TASK_PHASE=authenticated_journey
timeout 240 deno run --unstable-sloppy-imports --cached-only --allow-env --allow-net=127.0.0.1:55610,127.0.0.1:55611 \
  scripts/project-economy/operations-project-evidence-http-journey.ts > "$TASK_PRIVATE/private-journey.log" 2>&1 || {
    echo 'Native authenticated project evidence journey failed; no partial authorization proof' >&2
    exit 1
  }
TASK_PHASE=complete_proof
python3 "$TASK_RUNTIME/proof.py" "$TASK_PRIVATE/private-journey.log"
TASK_PHASE=drilldown_fixture_commit
apply_sql scripts/project-economy/operations-obligation-drilldown-http-fixture.sql -v "fixture=$(cat "$TASK_PRIVATE/fixture.json")"
python3 - "$TASK_PRIVATE/private-sql.log" "$TASK_PRIVATE/drilldown-selectors.json" <<'PY_DRILLDOWN'
import json,sys
from pathlib import Path
raw=Path(sys.argv[1]).read_text()
prefix='DRILLDOWN_HTTP_SELECTORS='
rows=[line.strip()[len(prefix):] for line in raw.splitlines() if line.strip().startswith(prefix)]
if len(rows)!=1 or len(rows[0].encode())>=16384 or 'operations-obligation-drilldown-http-fixture SETUP PASS' not in raw:raise SystemExit('Complete native drilldown fixture selectors required')
value=json.loads(rows[0])
if set(value)!={'schema','organizationId','actorId','requests'} or value['schema']!='operations-obligation-drilldown-http-selectors.v1' or value['organizationId']!='00000000-0000-4000-8000-000000000001' or value['actorId']!='00000000-0000-4000-8000-000000000199':raise SystemExit('Exact actual synthetic selector boundary required')
if set(value['requests'])!={'project','large','packing','baselineChanged','superseded','membershipChanged'}:raise SystemExit('Complete actual root selector set required')
Path(sys.argv[2]).write_text(json.dumps(value,separators=(',',':')))
PY_DRILLDOWN
export PROJECT_EVIDENCE_DRILLDOWN_SELECTORS="$(cat "$TASK_PRIVATE/drilldown-selectors.json")"
TASK_PHASE=drilldown_authenticated_journey
timeout 240 deno run --unstable-sloppy-imports --cached-only --allow-env --allow-net=127.0.0.1:55610,127.0.0.1:55611 \
  scripts/project-economy/operations-obligation-drilldown-http-journey.ts > "$TASK_PRIVATE/private-drilldown-journey.log" 2>&1 || {
    echo 'Native authenticated drilldown journey failed; no partial authorization proof' >&2
    python3 "$TASK_RUNTIME/drilldown-proof.py" --failure "$TASK_PRIVATE/private-drilldown-journey.log" >&2
    exit 1
  }
TASK_PHASE=drilldown_complete_proof
python3 "$TASK_RUNTIME/drilldown-proof.py" "$TASK_PRIVATE/private-drilldown-journey.log"
