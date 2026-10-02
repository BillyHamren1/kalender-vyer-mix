#!/usr/bin/env bash
set -euo pipefail
# ONLY the dedicated ephemeral native CI database; no hosted/provider calls.
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2; exit 2; }
[[ ${EVENTFLOW_OWN_CREDIT_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated native database guard required' >&2; exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Native fixture requires loopback PostgreSQL' >&2; exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq host/service/options overrides forbidden' >&2; exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Dedicated native fixture requires postgres on explicit port 5432' >&2; exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_own_credit_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_own_credit_ database required' >&2; exit 2; }
psql_run() { psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
# Read-only authority and exact synthetic state before any harness mutation.
[[ $(psql_run -Atqc "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database() ~ '^eventflow_own_credit_[a-z0-9_]+$'
 and (select count(*)=4 and bool_and(id=any(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[])) from auth.users)
 and (select count(*)=3 and bool_and((id,organization_id,deleted_at is null) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,true))) from public.projects)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 and (select count(*)=1 and min(slot)='only' and bool_and(command->>'project_id'='55555555-5555-4555-8555-555555555555' and command->>'obligation_id'='abababab-abab-4aba-8aba-abababababab' and command->>'expected_assignment_revision'='0') from public.operations_own_credit_native_fixture)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='23232323-2323-4232-8232-232323232323' and current_revision=1) from public.operations_finance_invoice_streams)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='89898989-8989-4898-8989-898989898989' and current_revision=1) from public.operations_finance_credit_v2_streams)
 and (select count(*)=1 from public.operations_finance_invoice_snapshots) and (select count(*)=1 from public.operations_finance_credit_v2_snapshots)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and project_id='55555555-5555-4555-8555-555555555555' and obligation_id='abababab-abab-4aba-8aba-abababababab' and current_revision=1 and currency='SEK') from public.operations_project_obligation_heads)
 and (select count(*)=1 and bool_and(actor_system_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and revision=1) from public.operations_project_obligation_baselines) and (select count(*)=1 and bool_and(source_economic_revision=1 and amount_minor=540000 and organization_id='11111111-1111-4111-8111-111111111111') from public.operations_project_obligation_invoice_bindings)
 and not exists(select 1 from public.operations_obligation_credit_assignment_heads) and not exists(select 1 from public.operations_obligation_credit_assignments)") == t ]] || { echo 'Fresh synthetic-only own-credit state required' >&2; exit 2; }
task_credit_run_dir=$(mktemp -d)
declare -A task_credit_pids=()
wait_owned() {
 local owned_pid=$1 owned_status=0
 wait "$owned_pid" || owned_status=$?
 unset 'task_credit_pids[$owned_pid]'
 return "$owned_status"
}
cleanup() {
 local pid live_pid live_jobs
 # Signal only owned jobs still running; wait also reaps completed owned jobs.
 live_jobs=$(jobs -pr)
 for pid in "${!task_credit_pids[@]}"; do
  while read -r live_pid; do if [[ $pid == "$live_pid" ]]; then kill "$pid" 2>/dev/null || true; fi; done <<< "$live_jobs"
 done
 for pid in "${!task_credit_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
 rm -rf "$task_credit_run_dir"
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
# Actual authenticated assignment holds transaction/barriers. First counterpart
# insert must wait before creating an absent stream, not only wait on an old row.
for counterpart in credit_v1 original_v2; do
 if [[ $counterpart == credit_v1 ]]; then revision=0;invoice=89898989-8989-4898-8989-898989898989;table=operations_finance_invoice_streams;protocol=v1;else revision=1;invoice=23232323-2323-4232-8232-232323232323;table=operations_finance_credit_v2_streams;protocol=v2;fi
 [[ $(psql_run -Atqc "select not exists(select 1 from public.$table where invoice_id='$invoice')") == t ]]
 PGAPPNAME="eventflow_credit_authority_$counterpart" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/authority_$counterpart.log" <<SQL &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('expected_assignment_revision',$revision,'idempotency_key','native-credit-hold-$counterpart')) from public.operations_own_credit_native_fixture;
select pg_sleep(5);commit;
SQL
 authority_pid=$!;task_credit_pids["$authority_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_credit_authority_$counterpart' and wait_event='PgSleep')"
 PGAPPNAME="eventflow_credit_writer_$counterpart" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$counterpart.log" <<SQL &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_$protocol('fixture_credit_native_$protocol',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_credit_counterpart_$counterpart',(select raw_$counterpart from public.operations_own_credit_native_fixture));commit;
SQL
 writer_pid=$!;task_credit_pids["$writer_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_credit_writer_$counterpart' and wait_event='advisory')"
 [[ $(psql_run -Atqc "select not exists(select 1 from public.$table where invoice_id='$invoice')") == t ]]
 wait_owned "$authority_pid";wait_owned "$writer_pid"
 [[ $(psql_run -Atqc "select count(*)=1 from public.$table where invoice_id='$invoice'") == t ]]
 [[ $(psql_run -Atqc "begin;set local role service_role;select (public.read_operations_obligation_own_credit_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',(select source_anchor from public.operations_own_credit_native_fixture))->>'state')='$(if [[ $counterpart == credit_v1 ]];then echo assigned;else echo unresolved;fi)';rollback;") == t ]]
 echo "operations-own-credit-native PASS actual_auth_${counterpart}_absent_head_blocked"
done
# Explicitly adopt original V2 enrichment under new CAS; old event is retained.
psql_run -Atq <<'SQL'
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('expected_assignment_revision',2,'idempotency_key','native-credit-adopt-original-v2')) from public.operations_own_credit_native_fixture;commit;
SQL
# Both real authenticated contenders request revision3; only one event4 can append.
PGAPPNAME=eventflow_credit_cas_a psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/cas_a.log" <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('expected_assignment_revision',3,'idempotency_key','native-credit-cas-a-command')) from public.operations_own_credit_native_fixture;
select pg_sleep(5);commit;
SQL
cas_a_pid=$!;task_credit_pids["$cas_a_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_credit_cas_a' and wait_event='PgSleep')"
PGAPPNAME=eventflow_credit_cas_b psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/cas_b.log" <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('expected_assignment_revision',3,'idempotency_key','native-credit-cas-b-command')) from public.operations_own_credit_native_fixture;commit;
SQL
cas_b_pid=$!;task_credit_pids["$cas_b_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_credit_cas_b' and wait_event='advisory')"
wait_owned "$cas_a_pid";wait_owned "$cas_b_pid"
python3 - "$task_credit_run_dir/cas_a.log" "$task_credit_run_dir/cas_b.log" <<'PY'
import json,sys
for path,wanted in zip(sys.argv[1:],('accepted','stale')):
 receipts=[]
 for line in open(path):
  try: value=json.loads(line)
  except json.JSONDecodeError: continue
  if isinstance(value,dict) and 'outcome' in value: receipts.append(value)
 assert len(receipts)==1 and receipts[0]['outcome']==wanted, (path,receipts)
 assert receipts[0]['credit_eligible'] is False and receipts[0]['eac_minor'] is None
PY
[[ $(psql_run -Atqc 'select count(*)=4 from public.operations_obligation_credit_assignments') == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 and min(current_revision)=4 from public.operations_obligation_credit_assignment_heads') == t ]]
echo 'operations-own-credit-native PASS actual_auth_simultaneous_CAS_one_event'
