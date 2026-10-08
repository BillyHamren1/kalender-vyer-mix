#!/usr/bin/env bash
set -euo pipefail
# ONLY the dedicated ephemeral native CI database; no hosted/provider calls.
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2; exit 2; }
[[ ${EVENTFLOW_INVOICE_KERNEL_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated native database guard required' >&2; exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Native fixture requires loopback PostgreSQL' >&2; exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq host/service/options overrides forbidden' >&2; exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Dedicated native fixture requires postgres on explicit port 5432' >&2; exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_own_credit_kernel_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_own_credit_kernel_ database required' >&2; exit 2; }
psql_run() { psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
# Read-only authority and exact synthetic state before any harness mutation.
[[ $(psql_run -Atqc "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database() ~ '^eventflow_own_credit_kernel_[a-z0-9_]+$'
 and (select count(*)=1 and min(slot)='only' and bool_and(read_request->>'organization_id'='11111111-1111-4111-8111-111111111111' and read_request->>'project_id'='55555555-5555-4555-8555-555555555555' and read_request->>'obligation_id'='abababab-abab-4aba-8aba-abababababab') from public.operations_invoice_kernel_native_fixture)
 and (select count(*)=4 and bool_and(id=any(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[])) from auth.users)
 and (select count(*)=3 and bool_and(deleted_at is null and (id,organization_id) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid))) from public.projects)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='23232323-2323-4232-8232-232323232323' and current_revision=1) from public.operations_finance_invoice_streams)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and invoice_id='89898989-8989-4898-8989-898989898989') from public.operations_finance_credit_v2_streams)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and obligation_id='abababab-abab-4aba-8aba-abababababab' and current_revision=1) from public.operations_project_obligation_heads)
 and (select count(*)=1 from public.operations_project_obligation_baselines) and (select count(*)=1 from public.operations_project_obligation_invoice_bindings)
 and not exists(select 1 from public.operations_obligation_source_policy_heads) and not exists(select 1 from public.operations_obligation_source_policies)
 and (select count(*)=1 and bool_and(enabled and organization_id='11111111-1111-4111-8111-111111111111') from public.operations_invoice_obligation_kernel_read_gates)") == t ]] || { echo 'Fresh synthetic-only kernel read state required' >&2; exit 2; }
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
# Each actual read retains its organization and source barriers to transaction end.
# Actual authenticated policy/baseline writers and actual receiver core compete.
for kind in policy counterpart source baseline; do
 PGAPPNAME="eventflow_kernel_reader_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/reader_$kind.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.read_operations_invoice_obligation_kernel_evidence_v1(read_request) from public.operations_invoice_kernel_native_fixture;
select pg_sleep(5);commit;
SQL
 reader_pid=$!;task_credit_pids["$reader_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_kernel_reader_$kind' and wait_event='PgSleep')"
 if [[ $kind == counterpart ]]; then
 [[ $(psql_run -Atqc "select not exists(select 1 from public.operations_finance_credit_v2_streams where invoice_id='23232323-2323-4232-8232-232323232323')") == t ]]
 PGAPPNAME="eventflow_kernel_writer_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$kind.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_native_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_kernel_absent_counterpart',raw_original_v2) from public.operations_own_credit_native_fixture;commit;
SQL
 elif [[ $kind == source ]]; then
 PGAPPNAME="eventflow_kernel_writer_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$kind.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_credit_native_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_kernel_source_correction',raw_source_correction) from public.operations_invoice_kernel_native_fixture;commit;
SQL
 else
 if [[ $kind == policy ]]; then rpc=append_operations_obligation_source_policy_v1;command=policy_command;else rpc=append_operations_manual_obligation_baseline_v1;command=baseline_command;fi
 PGAPPNAME="eventflow_kernel_writer_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$kind.log" 2>&1 <<SQL &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.$rpc($command) from public.operations_invoice_kernel_native_fixture;commit;
SQL
 fi
 writer_pid=$!;task_credit_pids["$writer_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_kernel_writer_$kind' and wait_event='advisory')"
 if [[ $kind == counterpart ]]; then
 [[ $(psql_run -Atqc "select not exists(select 1 from public.operations_finance_credit_v2_streams where invoice_id='23232323-2323-4232-8232-232323232323')") == t ]]
 fi
 wait_owned "$reader_pid";wait_owned "$writer_pid"
 psql_run -Atq >"$task_credit_run_dir/after_$kind.log" <<'SQL'
begin;set local role service_role;
select public.read_operations_invoice_obligation_kernel_evidence_v1(read_request) from public.operations_invoice_kernel_native_fixture;rollback;
SQL
 python3 - "$kind" "$task_credit_run_dir/reader_$kind.log" "$task_credit_run_dir/writer_$kind.log" "$task_credit_run_dir/after_$kind.log" <<'PYASSERT'
import json,sys
kind=sys.argv[1]
def records(path):
 out=[]
 for line in open(path):
  try:v=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(v,dict):out.append(v)
 return out
before=records(sys.argv[2]);receipts=[v for v in records(sys.argv[3]) if 'outcome' in v];after=records(sys.argv[4])
assert len(before)==len(receipts)==len(after)==1,(kind,before,receipts,after)
before,receipt,after=before[0],receipts[0],after[0]
assert receipt['outcome']=='accepted',(kind,receipt)
assert before['eac_minor'] is None and after['eac_minor'] is None and after['credit_eligible'] is False
assert len(before['sources'])==len(after['sources'])==1
old,new=before['sources'][0],after['sources'][0]
assert old['source_anchor']==new['source_anchor']
if kind=='policy':
 assert receipt['policy_revision']==1 and old['amount_minor']==new['amount_minor']==540000
 assert old['policy_state']=='missing' and new['policy_state']=='current' and new['replaces_estimate_minor']==700000 and new['consumes_commitment_minor'] is None
elif kind=='counterpart':
 assert old['resolved'] is True and new['resolved'] is True and old['amount_minor']==new['amount_minor']==540000
 assert old['policy_event_id']==new['policy_event_id'] and old['replaces_estimate_minor']==new['replaces_estimate_minor']==700000
 assert old['current_snapshot_id']!=new['current_snapshot_id']
elif kind=='source':
 assert old['resolved'] is True and old['amount_minor']==540000 and old['policy_state']=='current'
 assert new['resolved'] is False and new['amount_minor'] is None and new['policy_state']=='stale' and new['replaces_estimate_minor'] is None
else:
 assert receipt['revision']==2 and before['baseline']['revision']==1 and after['baseline']['revision']==2
 assert before['baseline']['estimate_minor']==1000000 and after['baseline']['estimate_minor']==1100000
 assert new['resolved'] is False and new['amount_minor'] is None and new['consumes_commitment_minor'] is None
PYASSERT
 echo "operations-invoice-kernel-native PASS actual_read_${kind}_barrier_coherent"
done
[[ $(psql_run -Atqc 'select count(*)=1 and min(current_revision)=1 from public.operations_obligation_source_policy_heads') == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 from public.operations_obligation_source_policies') == t ]]
[[ $(psql_run -Atqc 'select count(*)=1 and min(current_revision)=2 from public.operations_project_obligation_heads') == t ]]
[[ $(psql_run -Atqc 'select count(*)=2 from public.operations_project_obligation_baselines') == t ]]
[[ $(psql_run -Atqc "select count(*)=1 and min(current_revision)=2 from public.operations_finance_invoice_streams") == t ]]
echo 'operations-invoice-kernel-native PASS immutable_history_retained'
