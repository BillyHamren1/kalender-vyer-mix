#!/usr/bin/env bash
set -euo pipefail
# ONLY the dedicated ephemeral native CI database; no hosted/provider calls.
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2; exit 2; }
[[ ${EVENTFLOW_SCOPE_INVOICE_KERNEL_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated native database guard required' >&2; exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Native fixture requires loopback PostgreSQL' >&2; exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq host/service/options overrides forbidden' >&2; exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Dedicated native fixture requires postgres on explicit port 5432' >&2; exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_scope_invoice_kernel_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_scope_invoice_kernel_ database required' >&2; exit 2; }
task_scope_deno_bin=${EVENTFLOW_SCOPE_INVOICE_DENO_BIN:-deno}
command -v "$task_scope_deno_bin" >/dev/null || { echo 'Exact Deno runtime required for captured native reply verification' >&2;exit 2; }
export PGCONNECT_TIMEOUT=5
# Hardcoded options are scoped to this helper after rejecting caller PGOPTIONS.
# Observers and helper sessions have connection, statement and lock bounds.
psql_run() { PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=4000 -c idle_in_transaction_session_timeout=10000' psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
# Read-only authority and exact synthetic state before any harness mutation.
[[ $(psql_run -Atqc "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database() ~ '^eventflow_scope_invoice_kernel_[a-z0-9_]+$'
 and (select count(*)=4 and bool_and(id=any(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[])) from auth.users)
 and (select count(*)=3 and bool_and(deleted_at is null and (id,organization_id) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid))) from public.projects)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 and (select count(*)=1 and min(slot)='only' and bool_and(read_request->>'organization_id'='11111111-1111-4111-8111-111111111111' and read_request->>'economic_scope_id'='90909090-9090-4909-8909-909090909090' and read_request->>'expected_scope_revision'='1' and read_request->>'expected_composition_revision'='1') from public.operations_scope_invoice_kernel_native_fixture)
 and (select count(*)=2 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id=any(array['13131313-1313-4313-8313-131313131313','23232323-2323-4232-8232-232323232323']::uuid[]) and current_revision=1) from public.operations_finance_invoice_streams)
 and not exists(select 1 from public.operations_finance_credit_v2_streams)
 and (select count(*)=3 from public.operations_project_obligation_invoice_bindings)
 and (select count(*)=3 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and project_id=any(array['55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-777777777777']::uuid[]) and current_revision=1) from public.operations_project_obligation_heads)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='90909090-9090-4909-8909-909090909090' and current_revision=1) from public.operations_scope_obligation_composition_heads)
 and (select count(*)=2 and bool_and(current_revision=1) from public.operations_obligation_source_policy_heads)
 and (select count(*)=1 and bool_and(enabled and organization_id='11111111-1111-4111-8111-111111111111') from public.operations_scope_invoice_kernel_read_gates)") == t ]] || { echo 'Fresh synthetic-only whole scope state required' >&2; exit 2; }
task_credit_run_dir=$(mktemp -d)
declare -A task_credit_pids=()
wait_owned() {
 local owned_pid=$1 owned_status=0
 wait "$owned_pid" || owned_status=$?
 unset 'task_credit_pids[$owned_pid]'
 return "$owned_status"
}
owned_live() {
 local owned_pid live_pid live_jobs
 live_jobs=$(jobs -rp; jobs -sp)
 for owned_pid in "${!task_credit_pids[@]}";do
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
 for pid in "${!task_credit_pids[@]}";do wait "$pid" 2>/dev/null || true;done
 rm -rf "$task_credit_run_dir"
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
for kind in policy counterpart sources baseline; do
 PGAPPNAME="eventflow_scope_reader_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/reader_$kind.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.read_operations_scope_invoice_kernel_evidence_v1(read_request) from public.operations_scope_invoice_kernel_native_fixture;
select pg_sleep(5);commit;
SQL
 reader_pid=$!;task_credit_pids["$reader_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_scope_reader_$kind' and wait_event='PgSleep')"
 if [[ $kind == counterpart ]]; then
 [[ $(psql_run -Atqc 'select not exists(select 1 from public.operations_finance_credit_v2_streams)') == t ]]
 PGAPPNAME="eventflow_scope_writer_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$kind.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v2('fixture_scope_kernel_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_whole_scope_counterpart',raw_coequal_v2) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
 elif [[ $kind == sources ]]; then
 PGAPPNAME=eventflow_scope_writer_sources psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_sources.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_whole_scope_source_a',raw_source_correction) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
 else
 if [[ $kind == policy ]];then rpc=append_operations_obligation_source_policy_v1;cmd=policy_command;else rpc=append_operations_manual_obligation_baseline_v1;cmd=baseline_command;fi
 PGAPPNAME="eventflow_scope_writer_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_$kind.log" 2>&1 <<SQL &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.$rpc($cmd) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
 fi
 writer_pid=$!;task_credit_pids["$writer_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_scope_writer_$kind' and wait_event='advisory')"
 if [[ $kind == sources ]];then
 PGAPPNAME=eventflow_scope_writer_second psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_second.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_whole_scope_source_b',raw_second_correction) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
 second_pid=$!;task_credit_pids["$second_pid"]=1
 wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_scope_writer_second' and wait_event='advisory')"
 [[ $(psql_run -Atqc 'select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams') == t ]]
 fi
 if [[ $kind == counterpart ]];then [[ $(psql_run -Atqc 'select not exists(select 1 from public.operations_finance_credit_v2_streams)') == t ]];fi
 wait_owned "$reader_pid";wait_owned "$writer_pid"
 if [[ $kind == sources ]];then wait_owned "$second_pid";fi
 if [[ $kind == baseline ]];then
 set +e
 psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq >"$task_credit_run_dir/baseline_stale.log" 2>&1 <<'SQL'
begin;set local statement_timeout='12s';set local role service_role;
select public.read_operations_scope_invoice_kernel_evidence_v1(read_request) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
 failure=$?;set -e
 [[ $failure != 0 ]] || { echo 'Stale baseline read unexpectedly succeeded' >&2;exit 1; }
 grep -q '22023: current_scope_invoice_baseline_required' "$task_credit_run_dir/baseline_stale.log"
 else
 psql_run -Atq >"$task_credit_run_dir/after_$kind.log" <<'SQL'
begin;set local statement_timeout='12s';set local role service_role;
select public.read_operations_scope_invoice_kernel_evidence_v1(read_request) from public.operations_scope_invoice_kernel_native_fixture;rollback;
SQL
 fi
 python3 - "$kind" "$task_credit_run_dir" <<'PYASSERT'
import json,sys,pathlib
kind=sys.argv[1];root=pathlib.Path(sys.argv[2])
def one(name,key):
 vals=[]
 for line in (root/name).read_text().splitlines():
  try:v=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(v,dict) and key in v:vals.append(v)
 assert len(vals)==1,(name,vals)
 return vals[0]
before=one('reader_'+kind+'.log','source_inventory');receipt=one('writer_'+kind+'.log','outcome')
assert receipt['outcome']=='accepted',(kind,receipt)
assert len(before['members'])==3 and len(before['source_inventory'])==3
assert before['eac_minor'] is None and before['credit_eligible'] is False
if kind=='baseline':assert receipt['revision']==2
else:
 after=one('after_'+kind+'.log','source_inventory')
 assert len(after['source_inventory'])==3 and before['composition_snapshot_id']==after['composition_snapshot_id']
 assert before['saved_source_references']==after['saved_source_references']
 if kind=='policy':
  assert receipt['policy_revision']==2
  a={s['source_anchor']:s for s in before['source_inventory']};b={s['source_anchor']:s for s in after['source_inventory']}
  assert sum(x['policy_revision']!=b[k]['policy_revision'] for k,x in a.items())==1
 elif kind=='counterpart':
  assert all(s['mapping_state']=='charging' for s in after['source_inventory'])
  assert sum(a['current_snapshot_id']!=b['current_snapshot_id'] for a,b in zip(before['source_inventory'],after['source_inventory']))==2
 else:
  second=one('writer_second.log','outcome');assert second['outcome']=='accepted'
  assert all(s['mapping_state']=='charging' for s in before['source_inventory']) and all(s['mapping_state']=='excluded' for s in after['source_inventory'])
  assert all(s['current_snapshot_id'] is None for s in after['source_inventory'])
PYASSERT
 echo "operations-scope-invoice-native PASS actual_${kind}_whole_barrier_coherence"
done
# Explicitly recompose CURRENT manual baseline IDs after the genuine correction.
# Old selection remains historical and cannot be made current by a read.
psql_run -Atq <<'SQL'
begin;set local statement_timeout='12s';
create temporary table native_recompose(command jsonb);
insert into native_recompose select f.compose_command||jsonb_build_object('expected_composition_revision',1,'idempotency_key','native-whole-current-recompose','baseline_event_ids',(select jsonb_agg(b.event_id order by b.obligation_id) from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b on b.organization_id=h.organization_id and b.obligation_id=h.obligation_id and b.revision=h.current_revision where h.organization_id='11111111-1111-4111-8111-111111111111')) from public.operations_scope_invoice_kernel_native_fixture f;
grant select on native_recompose to authenticated;create temporary table recompose_receipt(body jsonb);grant insert on recompose_receipt to authenticated;
set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into recompose_receipt select public.compose_operations_scope_obligations_v1(command) from native_recompose;reset role;
do $$begin if (select body->>'outcome' from recompose_receipt) is distinct from 'accepted' or (select body->>'composition_revision' from recompose_receipt) is distinct from '2' then raise exception 'real recompose did not append2';end if;end;$$;
update public.operations_scope_invoice_kernel_native_fixture set read_request=read_request||jsonb_build_object('expected_composition_revision',2,'expected_composition_fingerprint',(select body->'fingerprint' from recompose_receipt));commit;
SQL
# Actual legacy join insert can commit after the coherent as-of read. It does
# not upgrade the immutable graph; native enrollment waits the scope head lock.
PGAPPNAME=eventflow_scope_reader_graph psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/reader_graph.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role service_role;
select public.read_operations_scope_invoice_kernel_evidence_v1(read_request) from public.operations_scope_invoice_kernel_native_fixture;
select pg_sleep(5);commit;
SQL
reader_pid=$!;task_credit_pids["$reader_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_scope_reader_graph' and wait_event='PgSleep')"
psql_run -Atq <<'SQL'
begin;set local statement_timeout='12s';insert into public.bookings values('Native-Third-Order','11111111-1111-4111-8111-111111111111',null);insert into public.large_project_bookings values('16161616-1616-4616-8616-161616161616','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Native-Third-Order');commit;
SQL
PGAPPNAME=eventflow_scope_writer_graph psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_credit_run_dir/writer_graph.log" 2>&1 <<'SQL' &
begin;set local statement_timeout='12s';set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(enroll_command||jsonb_build_object('expected_revision',1,'expected_membership_fingerprint',public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc')->'membership_fingerprint','idempotency_key','native-whole-new-graph-enrollment')) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer_pid=$!;task_credit_pids["$writer_pid"]=1
wait_for_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_scope_writer_graph' and wait_event_type='Lock')"
[[ $(psql_run -Atqc 'select count(*)=1 and min(current_revision)=1 from public.operations_project_scope_heads') == t ]]
wait_owned "$reader_pid";wait_owned "$writer_pid"
python3 - "$task_credit_run_dir/writer_graph.log" <<'PYASSERT'
import json,sys
receipts=[]
for line in open(sys.argv[1]):
 try:v=json.loads(line)
 except json.JSONDecodeError:continue
 if isinstance(v,dict) and 'outcome' in v:receipts.append(v)
assert len(receipts)==1 and receipts[0]['outcome']=='accepted' and receipts[0]['scope_revision']==2,receipts
PYASSERT
set +e
psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq >"$task_credit_run_dir/graph_stale.log" 2>&1 <<'SQL'
begin;set local statement_timeout='12s';set local role service_role;select public.read_operations_scope_invoice_kernel_evidence_v1(read_request) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
failure=$?;set -e
[[ $failure != 0 ]] || { echo 'Stale graph read unexpectedly succeeded' >&2;exit 1; }
grep -q '22023: current_scope_invoice_graph_required' "$task_credit_run_dir/graph_stale.log"
[[ $(psql_run -Atqc 'select count(*)=2 from public.operations_project_scope_snapshots') == t ]]
[[ $(psql_run -Atqc 'select count(*)=2 from public.operations_scope_obligation_compositions') == t ]]
[[ $(psql_run -Atqc 'select count(*)=4 from public.operations_project_obligation_baselines') == t ]]
[[ $(psql_run -Atqc 'select count(*)=3 from public.operations_obligation_source_policies') == t ]]
[[ $(psql_run -Atqc 'select count(*)=3 from public.operations_project_obligation_invoice_bindings') == t ]]
echo 'operations-scope-invoice-native PASS current_graph_reenrollment_wait_and_stale_selection'
echo 'operations-scope-invoice-native PASS immutable_source_baseline_composition_history'
python3 - "$task_credit_run_dir" <<'PYVECTORS'
import pathlib,json,sys
root=pathlib.Path(sys.argv[1]);rows=[]
for label,filename in [('policy_before','reader_policy.log'),('policy_after','after_policy.log'),('counterpart_before','reader_counterpart.log'),('counterpart_after','after_counterpart.log'),('sources_before','reader_sources.log'),('sources_after','after_sources.log'),('baseline_before','reader_baseline.log'),('graph_before','reader_graph.log')]:
 matches=[]
 for line in (root/filename).read_text().splitlines():
  try:value=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(value,dict) and value.get('schema_version')=='operations-scope-invoice-kernel-evidence.v1':matches.append(line)
 assert len(matches)==1,(label,len(matches))
 rows.append({'label':label,'evidence':matches[0]})
(root/'native_vectors.json').write_text(json.dumps(rows))
PYVECTORS
"$task_scope_deno_bin" run --allow-read "$(dirname "$0")/operations-scope-invoice-kernel-vector-test.ts" "$task_credit_run_dir/native_vectors.json" --native-races
