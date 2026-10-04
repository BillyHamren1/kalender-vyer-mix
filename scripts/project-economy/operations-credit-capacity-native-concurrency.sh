#!/usr/bin/env bash
set -euo pipefail
# ONLY the dedicated ephemeral native CI database; no hosted/provider calls.
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2; exit 2; }
[[ ${EVENTFLOW_CREDIT_CAPACITY_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated native database guard required' >&2; exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Native fixture requires loopback PostgreSQL' >&2; exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq host/service/options overrides forbidden' >&2; exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Dedicated native fixture requires postgres on explicit port 5432' >&2; exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_own_credit_capacity_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_own_credit_capacity_ database required' >&2; exit 2; }
psql_run() { psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
# Read-only exact scoped disposable seed before any mutation.
[[ $(psql_run -Atqc "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database() ~ '^eventflow_own_credit_capacity_[a-z0-9_]+$'
 and (select count(*)=2 and bool_and(slot in ('first','second') and command->>'project_id'='55555555-5555-4555-8555-555555555555' and command->>'obligation_id'='abababab-abab-4aba-8aba-abababababab') from public.operations_credit_capacity_native_fixture)
 and (select count(*)=4 and bool_and(id=any(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[])) from auth.users)
 and (select count(*)=3 and bool_and((id,organization_id,deleted_at is null) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,true))) from public.projects)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and enabled) from public.operations_obligation_credit_capacity_gates)
 and (select count(*)=2 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and project_id='55555555-5555-4555-8555-555555555555' and obligation_id='abababab-abab-4aba-8aba-abababababab' and revision=1) from public.operations_obligation_credit_assignments)
 and (select count(*)=1 and bool_and(current_revision=1 and invoice_id='23232323-2323-4232-8232-232323232323') from public.operations_finance_invoice_streams)
 and not exists(select 1 from public.operations_obligation_credit_capacity_heads) and not exists(select 1 from public.operations_obligation_credit_capacity_events)") == t ]] || { echo 'Fresh synthetic capacity state required' >&2;exit 2; }
task_capacity_run_dir=$(mktemp -d)
declare -A task_capacity_pids=()
wait_owned() {
 local owned_pid=$1 owned_status=0
 wait "$owned_pid" || owned_status=$?
 unset 'task_capacity_pids[$owned_pid]'
 return "$owned_status"
}
cleanup() {
 local pid live_pid live_jobs
 # Signal only owned jobs still running; wait also reaps completed owned jobs.
 live_jobs=$(jobs -pr)
 for pid in "${!task_capacity_pids[@]}"; do
  while read -r live_pid; do if [[ $pid == "$live_pid" ]]; then kill "$pid" 2>/dev/null || true; fi; done <<< "$live_jobs"
 done
 for pid in "${!task_capacity_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
 rm -rf "$task_capacity_run_dir"
}
trap cleanup EXIT
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
PGAPPNAME=eventflow_capacity_first psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_capacity_run_dir/first.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_obligation_credit_capacity_v1(command) from public.operations_credit_capacity_native_fixture where slot='first';select pg_sleep(5);commit;
SQL
first_pid=$!;task_capacity_pids["$first_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_capacity_first' and wait_event='PgSleep')"
PGAPPNAME=eventflow_capacity_second psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq >"$task_capacity_run_dir/second.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_obligation_credit_capacity_v1(command) from public.operations_credit_capacity_native_fixture where slot='second';commit;
SQL
second_pid=$!;task_capacity_pids["$second_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_capacity_second' and wait_event='advisory')"
wait_owned "$first_pid"
second_status=0;wait_owned "$second_pid" || second_status=$?
[[ $second_status != 0 ]] || { echo 'Expected distinct-credit overcapacity denial absent' >&2; exit 1; }
grep -Eq '22023: actual_original_credit_capacity_exceeded$' "$task_capacity_run_dir/second.log"
[[ $(psql_run -Atqc 'select count(*)=1 and sum(reserved_minor)=50000 from public.operations_obligation_credit_capacity_events') == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 from public.operations_obligation_credit_capacity_heads') == t ]]
echo 'operations-credit-capacity-native PASS actual_two_credit_competing_reservations_no_overcap'
# Actual capacity transaction holds the original source before correction can commit.
PGAPPNAME=eventflow_capacity_refresh psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_capacity_run_dir/refresh.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_obligation_credit_capacity_v1(command||jsonb_build_object('expected_capacity_revision',1,'idempotency_key','native-capacity-refresh-proof')) from public.operations_credit_capacity_native_fixture where slot='first';select pg_sleep(5);commit;
SQL
refresh_pid=$!;task_capacity_pids["$refresh_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_capacity_refresh' and wait_event='PgSleep')"
PGAPPNAME=eventflow_capacity_source_correction psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_capacity_run_dir/source.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_credit_native_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_capacity_original_correction',(select raw_original_lower from public.operations_credit_capacity_native_fixture where slot='first'));commit;
SQL
source_pid=$!;task_capacity_pids["$source_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_capacity_source_correction' and wait_event='advisory')"
[[ $(psql_run -Atqc "select current_revision=1 from public.operations_finance_invoice_streams where invoice_id='23232323-2323-4232-8232-232323232323'") == t ]]
wait_owned "$refresh_pid";wait_owned "$source_pid"
[[ $(psql_run -Atqc "begin;set local role service_role;select public.read_operations_obligation_credit_capacity_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',(select source_anchor from public.operations_credit_capacity_native_fixture where slot='first'))->>'state'='unresolved';rollback;") == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 and sum(e.reserved_minor)=50000 from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision') == t ]]
python3 - "$task_capacity_run_dir/first.log" "$task_capacity_run_dir/refresh.log" <<'PY_PROOF'
import json,sys
for path,revision in zip(sys.argv[1:],(1,2)):
 receipts=[]
 for line in open(path):
  try:value=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(value,dict) and 'outcome' in value:receipts.append(value)
 assert len(receipts)==1 and receipts[0]['outcome']=='accepted' and receipts[0]['revision']==revision,(path,receipts)
 assert receipts[0]['reserved_minor']==50000 and receipts[0]['credit_eligible'] is False and receipts[0]['eac_minor'] is None
PY_PROOF
[[ $(psql_run -Atqc 'select count(*)=2 from public.operations_obligation_credit_capacity_events') == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 and min(current_revision)=2 from public.operations_obligation_credit_capacity_heads') == t ]]
[[ $(psql_run -Atqc "select current_revision=2 from public.operations_finance_invoice_streams where invoice_id='23232323-2323-4232-8232-232323232323'") == t ]]
echo 'operations-credit-capacity-native PASS actual_source_correction_serialized_retained_reservation'
