#!/usr/bin/env bash
set -euo pipefail
# ONLY the dedicated ephemeral native CI database; no hosted/provider calls.
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2; exit 2; }
[[ ${EVENTFLOW_INVOICE_BARRIER_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated native database guard required' >&2; exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Native fixture requires loopback PostgreSQL' >&2; exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq host/service/options overrides forbidden' >&2; exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Dedicated native fixture requires postgres on explicit port 5432' >&2; exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_invoice_barrier_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_invoice_barrier_ database required' >&2; exit 2; }
psql_run() { psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
# Read-only authority/fixture check BEFORE files, child processes or any mutation.
[[ $(psql_run -Atqc "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database() ~ '^eventflow_invoice_barrier_[a-z0-9_]+$'
 and (select count(*)=4 and bool_and(id=any(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[])) from auth.users)
 and (select count(*)=3 and bool_and((id,organization_id,deleted_at is null) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,true),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,true))) from public.projects)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 and (select count(*)=2 and bool_and(case_id in ('v1','v2') and raw_v1::jsonb->>'destination_organization_id'='11111111-1111-4111-8111-111111111111' and raw_v2::jsonb->>'source_organization_id'='99999999-9999-4999-8999-999999999999') from public.operations_invoice_barrier_native_fixture)
 and not exists(select 1 from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams)
 and not exists(select 1 from public.operations_finance_invoice_snapshots) and not exists(select 1 from public.operations_finance_credit_v2_snapshots)
 and not exists(select 1 from public.operations_finance_invoice_receipts) and not exists(select 1 from public.operations_finance_credit_v2_receipts)
 and not exists(select 1 from public.operations_project_obligation_heads) and not exists(select 1 from public.operations_project_obligation_baselines)
 and not exists(select 1 from public.operations_project_obligation_invoice_bindings) and not exists(select 1 from public.operations_project_obligation_source_ownership)") == t ]] || { echo 'Fresh synthetic-only native barrier state required' >&2; exit 2; }
task_barrier_run_dir=$(mktemp -d)
declare -A task_barrier_pids=()
wait_owned() {
 local owned_pid=$1 owned_status=0
 wait "$owned_pid" || owned_status=$?
 unset 'task_barrier_pids[$owned_pid]'
 return "$owned_status"
}
cleanup() {
 local pid
 # Only still-owned, unreaped children: never signal recycled/reaped PID IDs.
 for pid in "${!task_barrier_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
 for pid in "${!task_barrier_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
 rm -rf "$task_barrier_run_dir"
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
key_list='[{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"23232323-2323-4232-8232-232323232323"},{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"89898989-8989-4898-8989-898989898989"}]'
reverse_key_list='[{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"89898989-8989-4898-8989-898989898989"},{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"23232323-2323-4232-8232-232323232323"}]'
for protocol in v1 v2; do
 if [[ $protocol == v1 ]]; then invoice=23232323-2323-4232-8232-232323232323; else invoice=89898989-8989-4898-8989-898989898989; fi
 [[ $(psql_run -Atqc "select not exists(select 1 from public.operations_finance_invoice_streams where invoice_id='$invoice') and not exists(select 1 from public.operations_finance_credit_v2_streams where invoice_id='$invoice')") == t ]]
 PGAPPNAME="eventflow_barrier_holder_$protocol" psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/holder_$protocol.log" <<SQL &
begin;
set local statement_timeout='6s';
select operations_invoice_private.lock_invoice_economic_sources_v1('11111111-1111-4111-8111-111111111111','[{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"$invoice"}]');
select pg_sleep(2);
commit;
SQL
 holder_pid=$!;task_barrier_pids["$holder_pid"]=1
 wait_for_query "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='eventflow_barrier_holder_$protocol' and l.locktype='advisory' and l.granted)"
 PGAPPNAME="eventflow_barrier_writer_$protocol" psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/writer_$protocol.log" <<SQL &
begin;
set local statement_timeout='6s';
set local role service_role;
select public.operations_receive_finance_project_invoice_destination_$protocol('fixture_barrier_$protocol',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_missing_${protocol}_nonce_01',(select raw_$protocol from public.operations_invoice_barrier_native_fixture where case_id='$protocol'));
commit;
SQL
 writer_pid=$!;task_barrier_pids["$writer_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_barrier_writer_$protocol' and wait_event='advisory')"
 [[ $(psql_run -Atqc "select not exists(select 1 from public.operations_finance_invoice_streams where invoice_id='$invoice') and not exists(select 1 from public.operations_finance_credit_v2_streams where invoice_id='$invoice')") == t ]]
 wait_owned "$holder_pid";wait_owned "$writer_pid"
 [[ $(psql_run -Atqc "select count(*)=1 from public.operations_finance_invoice_snapshots where invoice_id='$invoice'") == t || $protocol == v2 ]]
 [[ $(psql_run -Atqc "select count(*)=1 from public.operations_finance_credit_v2_snapshots where invoice_id='$invoice'") == t || $protocol == v1 ]]
 echo "operations-invoice-economic-barrier PASS missing_${protocol}_head_writer_blocked_before_insert"
done

# Opposite caller order must still serialize on the same canonical first key.
PGAPPNAME=eventflow_barrier_sorted_a psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/sorted_a.log" <<SQL &
begin;set local statement_timeout='6s';
select operations_invoice_private.lock_invoice_economic_sources_v1('11111111-1111-4111-8111-111111111111','$key_list');
select pg_sleep(2);commit;
SQL
sorted_a_pid=$!;task_barrier_pids["$sorted_a_pid"]=1
wait_for_query "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='eventflow_barrier_sorted_a' and l.locktype='advisory' and l.granted)"
PGAPPNAME=eventflow_barrier_sorted_b psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/sorted_b.log" <<SQL &
begin;set local statement_timeout='6s';
select operations_invoice_private.lock_invoice_economic_sources_v1('11111111-1111-4111-8111-111111111111','$reverse_key_list');
commit;
SQL
sorted_b_pid=$!;task_barrier_pids["$sorted_b_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_barrier_sorted_b' and wait_event='advisory')"
wait_owned "$sorted_a_pid";wait_owned "$sorted_b_pid"
echo 'operations-invoice-economic-barrier PASS reversed_original_credit_order_no_deadlock'

# Actual authenticated local binder under the future authority lock order.
# The public receiver must wait before any source economics can advance.
psql_run -q <<'SQL'
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_manual_obligation_baseline_v1('{"schema_version":"operations-obligation-manual-baseline.v1","project_id":"55555555-5555-4555-8555-555555555555","obligation_id":"abababab-abab-4aba-8aba-abababababab","expected_revision":0,"currency":"SEK","category":"supplier","cost_basis":"invoice","estimate_minor":1000000,"committed_minor":null,"idempotency_key":"native-barrier-baseline","reason":"Explicit isolated source authority baseline"}');
commit;
SQL
PGAPPNAME=eventflow_barrier_authority psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/authority.log" <<'SQL' &
begin;set local statement_timeout='6s';
select pg_advisory_xact_lock(hashtextextended('obligation-org:11111111-1111-4111-8111-111111111111',0));
select operations_invoice_private.lock_invoice_economic_sources_v1('11111111-1111-4111-8111-111111111111','[{"source_organization_id":"99999999-9999-4999-8999-999999999999","invoice_id":"23232323-2323-4232-8232-232323232323"}]');
select id as source_snapshot_id from public.operations_finance_invoice_snapshots where invoice_id='23232323-2323-4232-8232-232323232323' and source_revision=1 \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id','55555555-5555-4555-8555-555555555555','obligation_id','abababab-abab-4aba-8aba-abababababab','expected_obligation_revision',1,'source_snapshot_id',:'source_snapshot_id','source_allocation_id','45454545-4545-4454-8454-454545454545','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','native-barrier-binding','reason','Bind current source within authority transaction'));
select pg_sleep(2);commit;
SQL
authority_pid=$!;task_barrier_pids["$authority_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_barrier_authority' and wait_event='PgSleep')"
PGAPPNAME=eventflow_barrier_correction psql -X --no-password --set ON_ERROR_STOP=1 -q >"$task_barrier_run_dir/correction.log" <<'SQL' &
begin;set local statement_timeout='6s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_barrier_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_barrier_correction_01',(select (raw_v1::jsonb||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('c',64)))::text from public.operations_invoice_barrier_native_fixture where case_id='v1'));
commit;
SQL
correction_pid=$!;task_barrier_pids["$correction_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_barrier_correction' and wait_event='advisory')"
[[ $(psql_run -Atqc "select current_revision=1 from public.operations_finance_invoice_streams where invoice_id='23232323-2323-4232-8232-232323232323'") == t ]]
wait_owned "$authority_pid";wait_owned "$correction_pid"
[[ $(psql_run -Atqc "select current_revision=2 from public.operations_finance_invoice_streams where invoice_id='23232323-2323-4232-8232-232323232323'") == t ]]
[[ $(psql_run -Atqc "select source_economic_revision=1 from public.operations_project_obligation_invoice_bindings where idempotency_key='native-barrier-binding'") == t ]]
echo 'operations-invoice-economic-barrier PASS actual_binding_source_correction_serialized'
