#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true && ${EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB:-} == true ]] || { echo 'Explicit disposable CI hired guard required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 && ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres && ${PGDATABASE:-} == operations_hired_authority_runtime ]] || { echo 'Exact loopback hired disposable database required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} && -z ${DATABASE_URL:-} && -z ${SUPABASE_DB_URL:-} && -z ${PGDATABASE_URL:-} && -z ${PGRST_DB_URI:-} && -z ${SUPABASE_URL:-} && -z ${SUPABASE_SERVICE_ROLE_KEY:-} ]] || { echo 'Ambient database overrides forbidden' >&2;exit 2; }
export PGCONNECT_TIMEOUT=5
# Ignore any ambient name: stderr path becomes owned only after guarded mktemp.
task_hired_run_dir=''
psql_run() {
 if [[ -n ${task_hired_run_dir:-} ]];then
  PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=4000 -c idle_in_transaction_session_timeout=15000' psql -X --no-password --set ON_ERROR_STOP=1 "$@" 2>>"$task_hired_run_dir/private-foreground.log"
 else
  PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=4000 -c idle_in_transaction_session_timeout=15000' psql -X --no-password --set ON_ERROR_STOP=1 "$@" 2>/dev/null
 fi
}
[[ $(psql_run -Atqc "select current_database()='operations_hired_authority_runtime' and current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user)
 and (select count(*)=4 from auth.users) and (select count(*)=3 and bool_and(deleted_at is null) from public.projects)
 and (select count(*)=1 and bool_and(slot='only' and assignment->>'project_id'='55555555-5555-4555-8555-555555555555' and assignment->>'obligation_id'='abababab-abab-4aba-8aba-abababababab' and contender->>'obligation_id'='cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd') from public.operations_hired_native_fixture)
 and (select count(*)=2 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and project_id='55555555-5555-4555-8555-555555555555' and current_revision=1) from public.operations_project_obligation_heads)
 and (select count(*)=2 and bool_and(current_revision=1) from public.operations_hired_basis_heads)
 and (select count(*)=1 and bool_and(current_revision=1) from public.operations_personnel_cost_streams)
 and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams)
 and (select count(*)=1 and bool_and(enabled) from public.operations_hired_authority_gates)
 and not exists(select 1 from public.operations_hired_assignment_events) and not exists(select 1 from public.operations_hired_source_ownership)") == t ]] || { echo 'Fresh exact synthetic hired state required' >&2;exit 2; }
task_hired_run_dir=$(mktemp -d)
declare -A task_hired_pids=()
wait_owned() {
 local owned_pid=$1 owned_status=0
 wait "$owned_pid" || owned_status=$?
 unset 'task_hired_pids[$owned_pid]'
 return "$owned_status"
}
owned_live() {
 local owned_pid live_pid live_jobs
 live_jobs=$(jobs -rp; jobs -sp)
 for owned_pid in "${!task_hired_pids[@]}";do
  while read -r live_pid;do if [[ $owned_pid == "$live_pid" ]];then printf '%s\n' "$owned_pid";fi;done <<< "$live_jobs"
 done
 return 0
}
cleanup() {
 local pid pending round
 pending=$(owned_live)
 while read -r pid;do if [[ -n $pid ]];then kill -CONT "$pid" 2>/dev/null || true;kill -TERM "$pid" 2>/dev/null || true;fi;done <<< "$pending"
 for ((round=0;round<40;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 while read -r pid;do [[ -n $pid ]] && kill -KILL "$pid" 2>/dev/null || true;done <<< "$pending"
 for ((round=0;round<20;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 # Reap only completed owned children. Never enter an unbounded wait on an
 # unexpectedly unkillable process or remove logs while it still writes them.
 if [[ -n $pending ]];then echo 'Owned native child failed bounded termination; private logs retained' >&2;exit 1;fi
 for pid in "${!task_hired_pids[@]}";do wait "$pid" 2>/dev/null || true;done
 rm -rf "$task_hired_run_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
wait_for_query() {
 local query=$1 result
 for ((attempt=0;attempt<100;attempt++)); do
  result=$(psql_run -Atqc "$query")
  [[ $result == t ]] && return 0
  sleep 0.05
 done
 echo 'Expected native concurrency observation not reached' >&2
 return 1
}

launch() {
 local name=$1 file=$2
 PGAPPNAME="$name" PGOPTIONS='-c statement_timeout=12000 -c lock_timeout=11000 -c idle_in_transaction_session_timeout=15000' psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq -f "$file" >"$task_hired_run_dir/$name.log" 2>&1 &
 launched_pid=$!;task_hired_pids["$launched_pid"]=1
}
observe() { wait_for_query "select exists(select 1 from pg_stat_activity where datname='operations_hired_authority_runtime' and application_name='$1' and $2)"; }
expect_failure() {
 local pid=$1 name=$2 message=$3 status=0
 wait_owned "$pid" || status=$?
 [[ $status != 0 ]] || { echo 'Expected protected native rejection missing' >&2;exit 1; }
 grep -Fq "$message" "$task_hired_run_dir/$name.log" || { echo 'Expected exact native SQLSTATE missing' >&2;exit 1; }
}
assert_sql() { [[ $(psql_run -Atqc "$1") == t ]] || { echo 'Closed native hired state assertion failed' >&2;exit 1; }; }
# Actual source publisher first: its stream UPDATE prevents stale assignment.
cat >"$task_hired_run_dir/a.sql" <<'SQL'
begin;set local role service_role;
select public.publish_operations_personnel_cost_outbox_v1(personnel->'corrected'||'{"source_revision":2}',personnel->'rawCorrection',proof||jsonb_build_object('raw_snapshot',(personnel->'rawCorrection')::text,'raw_snapshot_sha256',encode(sha256(convert_to((personnel->'rawCorrection')::text,'UTF8')),'hex')),1,'hired-native-real-correction') from public.operations_hired_native_fixture;
select pg_sleep(5);commit;
SQL
cat >"$task_hired_run_dir/b.sql" <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_hired_operational_source_v1(assignment) from public.operations_hired_native_fixture;commit;
SQL
launch hired_source_first "$task_hired_run_dir/a.sql";a=$launched_pid;observe hired_source_first "wait_event='PgSleep'"
launch hired_stale_assignment "$task_hired_run_dir/b.sql";b=$launched_pid;observe hired_stale_assignment "wait_event_type='Lock'"
assert_sql 'select not exists(select 1 from public.operations_hired_assignment_events)';wait_owned "$a";expect_failure "$b" hired_stale_assignment 'PT409: hired_source_head_changed'
assert_sql 'select not exists(select 1 from public.operations_hired_assignment_events) and (select min(current_revision)=2 from public.operations_personnel_cost_streams)'
echo 'operations-hired-native PASS publisher_first_stale_assignment_lock'
# The two genuinely authorized obligations contend for one actual source identity.
psql_run -q >"$task_hired_run_dir/prepare.log" <<'SQL'
update public.operations_hired_native_fixture set assignment=assignment||jsonb_build_object('source_revision',2,'expected_source_fingerprint',operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','time',personnel->'corrected'||'{"source_revision":2}'))),contender=contender||jsonb_build_object('source_revision',2,'expected_source_fingerprint',operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','time',personnel->'corrected'||'{"source_revision":2}')));
SQL
cat >"$task_hired_run_dir/a.sql" <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_hired_operational_source_v1(assignment) from public.operations_hired_native_fixture;select pg_sleep(5);commit;
SQL
cat >"$task_hired_run_dir/b.sql" <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_hired_operational_source_v1(contender) from public.operations_hired_native_fixture;commit;
SQL
launch hired_owner_first "$task_hired_run_dir/a.sql";a=$launched_pid;observe hired_owner_first "wait_event='PgSleep'"
launch hired_owner_contender "$task_hired_run_dir/b.sql";b=$launched_pid;observe hired_owner_contender "wait_event_type='Lock'";wait_owned "$a";expect_failure "$b" hired_owner_contender '42501: hired_permanent_source_owner_conflict'
assert_sql "select (select count(*)=1 and bool_and(obligation_id='abababab-abab-4aba-8aba-abababababab') from public.operations_hired_source_ownership) and (select count(*)=1 from public.operations_hired_assignment_events)"
echo 'operations-hired-native PASS permanent_owner_contender_lock'
# Assignment first: actual source withdrawal cannot pass its retained SHARE lock.
psql_run -q >"$task_hired_run_dir/prepare_second.log" <<'SQL'
update public.operations_hired_native_fixture set assignment=assignment||'{"expected_assignment_revision":1,"idempotency_key":"hired-native-assignment-before-withdraw"}';
SQL
cat >"$task_hired_run_dir/b.sql" <<'SQL'
begin;set local role service_role;
select public.publish_operations_personnel_cost_outbox_v1(personnel->'empty',personnel->'rawEmpty',proof||jsonb_build_object('raw_snapshot',(personnel->'rawEmpty')::text,'raw_snapshot_sha256',encode(sha256(convert_to((personnel->'rawEmpty')::text,'UTF8')),'hex')),2,'hired-native-real-withdrawal') from public.operations_hired_native_fixture;commit;
SQL
launch hired_assignment_first "$task_hired_run_dir/a.sql";a=$launched_pid;observe hired_assignment_first "wait_event='PgSleep'"
launch hired_source_withdrawal "$task_hired_run_dir/b.sql";b=$launched_pid;observe hired_source_withdrawal "wait_event_type='Lock'";wait_owned "$a";wait_owned "$b"
psql_run -Atq >"$task_hired_run_dir/read.log" <<'SQL'
begin;set local role service_role;select public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',source_identity) from public.operations_hired_native_fixture;rollback;
SQL
python3 - "$task_hired_run_dir/read.log" <<'PYASSERT'
import json,sys
v=json.loads(open(sys.argv[1]).read().strip());assert v['state']=='unresolved' and v['current_source'] is None and v['historical_source']['amount_minor']==45000 and v['historical_source']['minutes']==90 and v['eac_minor'] is None and v['remaining_minor'] is None and v['source_coverage']=='unavailable' and v['credit_eligible'] is False
PYASSERT
assert_sql 'select (select count(*)=2 from public.operations_hired_assignment_events) and (select min(current_revision)=3 from public.operations_personnel_cost_streams) and (select count(*)=3 from public.operations_personnel_cost_publications)'
echo 'operations-hired-native PASS assignment_first_withdrawal_lock_history'
for kind in gate project;do
 if [[ $kind == gate ]];then rev=1;else rev=2;fi
 cat >"$task_hired_run_dir/a.sql" <<SQL
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_hired_basis_v1(basis||jsonb_build_object('expected_basis_revision',$rev,'idempotency_key','hired-native-basis-before-$kind')) from public.operations_hired_native_fixture;select pg_sleep(5);commit;
SQL
 if [[ $kind == gate ]];then
 cat >"$task_hired_run_dir/b.sql" <<'SQL'
begin;update public.operations_hired_authority_gates set enabled=false where organization_id='11111111-1111-4111-8111-111111111111';commit;
SQL
 else
 cat >"$task_hired_run_dir/b.sql" <<'SQL'
begin;update public.projects set deleted_at=clock_timestamp() where id='55555555-5555-4555-8555-555555555555' and organization_id='11111111-1111-4111-8111-111111111111';commit;
SQL
 fi
 launch "hired_before_$kind" "$task_hired_run_dir/a.sql";a=$launched_pid;observe "hired_before_$kind" "wait_event='PgSleep'"
 launch "hired_revoke_$kind" "$task_hired_run_dir/b.sql";b=$launched_pid;observe "hired_revoke_$kind" "wait_event_type='Lock'";wait_owned "$a";wait_owned "$b"
 cat >"$task_hired_run_dir/deny.sql" <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_hired_basis_v1(basis) from public.operations_hired_native_fixture;commit;
SQL
 launch "hired_denied_$kind" "$task_hired_run_dir/deny.sql";d=$launched_pid
 if [[ $kind == gate ]];then msg='42501: hired_authority_disabled';else msg='42501: obligation_project_access_denied';fi
 expect_failure "$d" "hired_denied_$kind" "$msg"
 if [[ $kind == gate ]];then assert_sql "select count(*)=3 from public.operations_hired_basis_events";psql_run -q -c "update public.operations_hired_authority_gates set enabled=true where organization_id='11111111-1111-4111-8111-111111111111'" >"$task_hired_run_dir/restore.log";
 else assert_sql "select count(*)=4 from public.operations_hired_basis_events";psql_run -q -c "update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555' and organization_id='11111111-1111-4111-8111-111111111111'" >"$task_hired_run_dir/restore.log";fi
 echo "operations-hired-native PASS actual_${kind}_revoke_lock_denial"
done
assert_sql "select (select count(*)=1 from public.operations_hired_source_ownership) and (select count(*)=2 from public.operations_hired_assignment_events) and (select count(*)=2 from public.operations_finance_invoice_snapshots) and (select count(*)=2 from public.operations_project_obligation_baselines) and (select count(*)=3 from public.operations_personnel_cost_outbox)"
echo 'operations-hired-native PASS immutable_source_invoice_history_no_eac'
