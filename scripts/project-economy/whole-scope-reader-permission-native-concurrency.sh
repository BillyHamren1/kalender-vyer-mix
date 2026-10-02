#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2;exit 2; }
[[ ${EVENTFLOW_SCOPE_READER_PERMISSION_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated publication fixture required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Loopback PostgreSQL required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq overrides forbidden' >&2;exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Explicit postgres port5432 required' >&2;exit 2; }
[[ ${PGDATABASE:-} == eventflow_scope_publication_runtime ]] || { echo 'Dedicated publication database required' >&2;exit 2; }
task_pub_deno=${EVENTFLOW_SCOPE_READER_PERMISSION_DENO_BIN:-deno}
command -v "$task_pub_deno" >/dev/null && command -v python3 >/dev/null || { echo 'Exact Deno and monotonic observer runtime required' >&2;exit 2; }
task_pub_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
task_pub_dir='' # Ignore inherited paths before the guarded owned mktemp.
task_try_checkpoint=guard
task_try_focus=''
finish_try(){ local status=$?
 if [[ $status != 0 ]];then
  printf 'TRY_NATIVE_CHECKPOINT %s\n' "$task_try_checkpoint" >&2
  if [[ -n $task_pub_dir && -n $task_try_focus ]];then
   python3 - "$task_pub_dir" "$task_try_focus" 2>/dev/null <<'PYCODE' >&2 || true
import pathlib,re,sys
try:
 directory=pathlib.Path(sys.argv[1]);label=sys.argv[2]
 if not re.fullmatch(r'[a-z_]{1,64}',label):raise ValueError()
 path=directory/(label+'.log')
 if path.resolve()!=path or not path.is_file() or path.stat().st_size>8*1024*1024:raise ValueError()
 matches=re.findall(rb'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):',path.read_bytes())
 allowed={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
 if matches and matches[-1].decode('ascii') in allowed:print('ERROR: '+matches[-1].decode('ascii')+': closed_native_child_failure')
except Exception:pass
PYCODE
  fi
 fi
 if declare -F cleanup >/dev/null;then cleanup;fi
 exit "$status"
}
trap finish_try EXIT

export PGCONNECT_TIMEOUT=5
task_pub_options='-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable'
psql_run(){ PGOPTIONS="$task_pub_options" psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose "$@"; }
observe(){ local private_log=/dev/null;if [[ -n $task_pub_dir ]];then private_log="$task_pub_dir/observers.log";fi
 PGCONNECT_TIMEOUT=2 PGOPTIONS='-c statement_timeout=1000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=2000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable' psql -X --no-password --set ON_ERROR_STOP=1 -Atqc "$1" 2>>"$private_log";
}
[[ $(observe "select current_user='postgres' and session_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database()='eventflow_scope_publication_runtime' and current_setting('eventflow.scope_publication_isolated',true)='synthetic-disposable' and current_setting('eventflow.scope_publication_try_isolated',true)='synthetic-disposable' and (select count(*)=1 and bool_and(slot='only' and read_request->>'economic_scope_id'='67676767-6767-4676-8676-676767676767' and read_request->>'expected_scope_revision'='1' and read_request->>'expected_composition_revision'='1') from operations_scope_reader_permission_native.fixture) and (select count(*)=4 from auth.users) and (select count(*)=4 and bool_and(organization_id is not null) from public.profiles) and (select count(*)=3 from public.user_roles) and exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin') and (select count(*)=4 and bool_and(deleted_at is null) from public.projects) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_project_scope_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_scope_obligation_composition_heads) and (select current_revision=1 from public.operations_project_scope_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select current_revision=1 from public.operations_scope_obligation_composition_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select count(*)=4 and bool_and(current_revision=1) from public.operations_project_obligation_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams) and (select count(*)=1 and bool_and(slot='only' and pause_stage='none') from operations_scope_publication_try_native.controls) and (select count(*)=2 and bool_and(enabled and not fault_after_publication and not pause_after_barriers) from operations_scope_publication_native.gates) and (select count(*)=2 and bool_and(enabled) from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status in ('planning','ready')) and exists(select 1 from public.packing_projects where id='65656565-6565-4656-8656-656565656565' and organization_id='11111111-1111-4111-8111-111111111111' and status='planning') and not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.blocked_controls) and exists(select 1 from pg_constraint where conrelid='public.user_roles'::regclass and confrelid='auth.users'::regclass and contype='f' and confdeltype='c' and convalidated) and exists(select 1 from pg_index where indexrelid='public.user_roles_user_role_org_key'::regclass and indisunique and indisvalid) and not has_schema_privilege('authenticated','operations_scope_reader_permission_native','USAGE') and not has_schema_privilege('service_role','operations_scope_reader_permission_native','USAGE')") == t ]] || { echo 'Exact fresh permission fixture required' >&2;exit 2; }
task_pub_dir=$(mktemp -d)
declare -A task_pub_pids=()
task_pub_revision=0
task_pub_compound_as_of=0
wait_owned(){ local pid=$1 status=0;wait "$pid" || status=$?;unset 'task_pub_pids[$pid]';return "$status"; }
owned_live(){ local pid job live;live=$(jobs -rp;jobs -sp);for pid in "${!task_pub_pids[@]}";do while read -r job;do [[ $job == "$pid" ]] && printf '%s\n' "$pid";done <<< "$live";done;return 0; }
cleanup(){ local pending pid round;pending=$(owned_live)
 while read -r pid;do if [[ -n $pid ]];then kill -CONT "$pid" 2>/dev/null || true;kill -TERM "$pid" 2>/dev/null || true;fi;done <<< "$pending"
 for ((round=0;round<40;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 while read -r pid;do [[ -n $pid ]] && kill -KILL "$pid" 2>/dev/null || true;done <<< "$pending"
 for ((round=0;round<20;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 if [[ -n $pending ]];then echo 'Owned publication child failed bounded termination; private logs retained' >&2;exit 1;fi
 for pid in "${!task_pub_pids[@]}";do wait "$pid" 2>/dev/null || true;done;rm -rf "$task_pub_dir"
}
trap finish_try EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
monotonic_ns(){ python3 -c 'import time;print(time.monotonic_ns())' 2>>"$task_pub_dir/observers.log"; }
wait_query(){ local now deadline result;now=$(monotonic_ns);deadline=$((now+3000000000))
 while :;do now=$(monotonic_ns);[[ $now -lt $deadline ]] || break
 result=$(observe "$1") || { echo 'Native publication observer failed' >&2;return 1; }
 now=$(monotonic_ns);[[ $now -lt $deadline ]] || break
 [[ $result == t ]] && return 0;sleep 0.05;done
 echo 'Native publication observation deadline' >&2;return 1;
}
assert_state(){ [[ $(observe "$1") == t ]] || { echo 'Native publication state assertion failed' >&2;return 1; }; }
receipt(){ python3 - "$task_pub_dir/$1.log" "$2" "$3" "$4" 2>>"$task_pub_dir/receipts.log" <<'PY'
import json,sys
try:
 rows=[]
 for line in open(sys.argv[1]):
  try: value=json.loads(line)
  except ValueError: continue
  if isinstance(value,dict) and value.get('outcome')==sys.argv[2] and value.get(sys.argv[3])==int(sys.argv[4]):rows.append(value)
 if len(rows)!=1:raise ValueError('receipt mismatch')
 if sys.argv[3]=='publication_revision' and (rows[0].get('schema_version')!='operations-scope-publication-native-receipt.v1' or rows[0].get('historical_only')!=(sys.argv[2]=='replayed') or rows[0].get('delivery_state')!='blocked_missing_authoritative_destination'):raise ValueError('receipt meaning mismatch')
except Exception:print('Native receipt assertion failed',file=sys.stderr);sys.exit(1)
PY
}
denied(){ local status=$1 label=$2 code=$3 message=$4
 [[ $status != 0 ]] || { echo 'TRY_NATIVE_REASON unexpected_success' >&2;echo 'Native denial unexpectedly succeeded' >&2;return 1; }
 grep -F "$code" "$task_pub_dir/$label.log" >/dev/null && grep -F "$message" "$task_pub_dir/$label.log" >/dev/null || { echo 'TRY_NATIVE_REASON denial_mismatch' >&2;echo 'Native denial mismatch' >&2;return 1; }
}
start_pub(){ local label=$1 hold=$2 expected=${3:-$task_pub_revision};task_try_focus=$label
 observe "select jsonb_build_object('scope_snapshot_id',m.snapshot_id,'scope_revision',m.scope_revision,'membership_fingerprint',m.membership_fingerprint,'composition_snapshot_id',c.snapshot_id,'composition_revision',c.composition_revision,'composition_fingerprint',c.fingerprint,'baselines',(select jsonb_agg(jsonb_build_array(b.project_id,b.obligation_id,b.event_id,b.revision,b.fingerprint) order by b.project_id,b.obligation_id) from public.operations_scope_obligation_baseline_captures x join public.operations_project_obligation_baselines b on b.event_id=x.baseline_event_id where x.composition_snapshot_id=c.snapshot_id)) from operations_scope_reader_permission_native.fixture f join public.operations_scope_obligation_compositions c on c.organization_id=(f.read_request->>'organization_id')::uuid and c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=(f.read_request->>'expected_composition_revision')::bigint and c.fingerprint=f.read_request->>'expected_composition_fingerprint' join public.operations_project_scope_snapshots m on m.snapshot_id=c.scope_snapshot_id" >"$task_pub_dir/${label}_hint.json"
 cat >"$task_pub_dir/${label}_pub.sql" <<SQL
begin;
create temporary table native_try_receipt(data jsonb not null);
create temporary table native_permission_request(data jsonb not null);
insert into native_permission_request select read_request from operations_scope_reader_permission_native.fixture;
grant select on native_permission_request to authenticated;
grant insert,select on native_try_receipt to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into native_try_receipt select pg_temp.publish_scope_native_try_v1((data-'organization_id')||jsonb_build_object('schema_version','operations-scope-publication-native.v1','expected_publication_revision',$expected,'idempotency_key','native-atomic-publication-$label','reason','Native atomic source publication')) from pg_temp.native_permission_request;
reset role;
select data from native_try_receipt;
select data from native_try_receipt
\\g $task_pub_dir/${label}_held_receipt.json
select jsonb_build_array(jsonb_build_object('label','native_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint)) from operations_scope_publication_native.publications where publication_revision=$expected+1
\\g $task_pub_dir/${label}_held_vector.json
select jsonb_build_object('schema','native-held-publication-state.v1','head_revision',(select publication_revision from operations_scope_publication_native.heads),'publications',(select count(*) from operations_scope_publication_native.publications),'receipts',(select count(*) from operations_scope_publication_native.receipts),'controls',(select count(*) from operations_scope_publication_native.blocked_controls),'blocked_only',(select count(*)=$expected+1 and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls),'receipt_matches',(select r.document from operations_scope_publication_native.receipts r join operations_scope_publication_native.publications p on p.publication_id=r.publication_id where p.publication_revision=$expected+1)=(select data from native_try_receipt))
\\g $task_pub_dir/${label}_held_state.json
select pg_sleep($hold);
commit;
SQL
 PGAPPNAME="native_try_pub_$label" psql_run -Atq -f "$task_pub_root/scripts/project-economy/whole-scope-projection-sql-prototype.sql" -f "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-prototype.sql" -f "$task_pub_root/scripts/project-economy/whole-scope-publication-try-native-wrapper.sql" -f "$task_pub_dir/${label}_pub.sql" >"$task_pub_dir/$label.log" 2>&1 &
 task_pub_active_pid=$!;task_pub_pids["$task_pub_active_pid"]=1
}
finish_pub(){ local label=$1 pid=$2;wait_owned "$pid" || { echo 'Native publication transaction failed' >&2;return 1; }
 task_pub_revision=$((task_pub_revision+1));receipt "$label" accepted publication_revision "$task_pub_revision"
 assert_state "select (select publication_revision=$task_pub_revision from operations_scope_publication_native.heads) and (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls)"
}
publish_now(){ start_pub "$1" 0;finish_pub "$1" "$task_pub_active_pid"; }
start_writer(){ local label=$1;task_try_focus=$label;cat >"$task_pub_dir/$label.sql"
 local writer_options=$task_pub_options
 # Only held-role and compound-policy waiters span the explicit held proof.
 case "$label" in role_after|compound_packing|compound_policy)
  writer_options='-c statement_timeout=20000 -c lock_timeout=15000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable';;
 esac
 PGAPPNAME="native_try_writer_$label" PGOPTIONS="$writer_options" psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq -f "$task_pub_dir/$label.sql" >"$task_pub_dir/$label.log" 2>&1 &
 task_pub_writer_pid=$!;task_pub_pids["$task_pub_writer_pid"]=1
}
pub_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_try_pub_$1' and wait_event='PgSleep')"; }
writer_wait(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_$1' and wait_event_type='Lock')"; }
writer_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_$1' and wait_event='PgSleep')"; }
pub_wait(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_try_pub_$1' and wait_event_type='Lock')"; }

recompose(){ psql_run -Atq >"$task_pub_dir/recompose_$task_pub_revision.log" 2>&1 <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare command jsonb;result jsonb;membership public.operations_project_scope_snapshots%rowtype;h public.operations_project_scope_heads%rowtype;revision bigint;begin
select * into strict h from public.operations_project_scope_heads where economic_scope_id='67676767-6767-4676-8676-676767676767';
select * into strict membership from public.operations_project_scope_snapshots where economic_scope_id=h.economic_scope_id and scope_revision=h.current_revision;
select current_revision into strict revision from public.operations_scope_obligation_composition_heads where economic_scope_id=h.economic_scope_id;
select compose_command||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision,'idempotency_key','native-permission-recompose-'||revision) into strict command from operations_scope_reader_permission_native.fixture;
execute 'set local role authenticated';result:=public.compose_operations_scope_obligations_v1(command);execute 'reset role';
if result->>'outcome' is distinct from 'accepted' or result->'composition_revision' is distinct from to_jsonb(revision+1) then raise exception 'native_actual_recomposition_not_accepted' using errcode='22023';end if;
update operations_scope_reader_permission_native.fixture set read_request=read_request||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision+1,'expected_composition_fingerprint',result->'fingerprint');
end;$$;commit;
SQL
}
busy_pub(){ local label=$1 pid=$2 status=0;wait_owned "$pid" || status=$?;[[ $label != baseline_busy ]] || task_try_checkpoint=baseline_busy_denial;denied "$status" "$label" 55P03 native_try_publication_lock_busy
 [[ $label != baseline_busy ]] || task_try_checkpoint=baseline_busy_state
 assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and coalesce(bool_and(destination_id is null and wire_payload is null),true) from operations_scope_publication_native.blocked_controls) and (select coalesce(max(publication_revision),0)=$task_pub_revision from operations_scope_publication_native.heads)"; }
authority_denied(){ local label=$1 message=$2 status=0;start_pub "$label" 0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" "$label" 42501 "$message"
 assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and coalesce(bool_and(destination_id is null and wire_payload is null),true) from operations_scope_publication_native.blocked_controls) and (select coalesce(max(publication_revision),0)=$task_pub_revision from operations_scope_publication_native.heads)"; }
pause(){ psql_run -q -c "update operations_scope_publication_try_native.controls set pause_stage='$1'" >"$task_pub_dir/pause_$task_pub_revision.log" 2>&1; }
blocked_by(){ wait_query "select exists(select 1 from pg_stat_activity w join pg_stat_activity b on b.application_name='$2' where w.application_name='$1' and w.wait_event_type='Lock' and b.pid=any(pg_blocking_pids(w.pid)))"; }

# Compatible SHARE may be acquired while a conflicting UPDATE is only queued.
# Success is accepted ONLY with saved proof inspected while the publisher is
# still open and both actual writer/UPDATE queues remain observed. Conflicting
# acquired locks still require exact55P03 and full rollback.
compatible_pub(){ local label=$1 pid=$2 writer_app=$3 updater_app=$4 now deadline live;task_pub_compatible_accepted=0
 now=$(monotonic_ns);deadline=$((now+6000000000))
 while :;do
  if [[ -s $task_pub_dir/${label}_held_receipt.json && -s $task_pub_dir/${label}_held_vector.json && -s $task_pub_dir/${label}_held_state.json ]];then break;fi
  live=$(owned_live);if ! grep -Fx "$pid" <<< "$live" >/dev/null;then busy_pub "$label" "$pid";return;fi
  now=$(monotonic_ns);[[ $now -lt $deadline ]] || { echo 'Native compatible publication observation deadline' >&2;return 1; };sleep 0.05
 done
 task_try_checkpoint=${label%_busy}_held
 pub_sleep "$label";blocked_by "$writer_app" "native_try_pub_$label";blocked_by "$updater_app" "$writer_app"
 held_proof "$label" "$writer_app" "$updater_app"
 finish_pub "$label" "$pid";task_pub_compatible_accepted=1
}


held_proof(){ local label=$1 writer_app=${2:-} updater_app=${3:-}
 python3 - "$task_pub_dir" "$label" "$((task_pub_revision+1))" 2>>"$task_pub_dir/held_proofs.log" <<'PY'
import json,pathlib,sys
try:
 directory=pathlib.Path(sys.argv[1]);label=sys.argv[2];revision=int(sys.argv[3])
 def read(suffix):
  path=directory/(label+suffix+'.json')
  if path.resolve()!=path or not path.is_file() or path.stat().st_size>8*1024*1024:raise ValueError()
  return json.loads(path.read_text())
 hint=read('_hint');receipt=read('_held_receipt');vectors=read('_held_vector');state=read('_held_state')
 if receipt.get('schema_version')!='operations-scope-publication-native-receipt.v1' or receipt.get('outcome')!='accepted' or receipt.get('publication_revision')!=revision or receipt.get('historical_only') is not False or receipt.get('delivery_state')!='blocked_missing_authoritative_destination':raise ValueError()
 if not isinstance(vectors,list) or len(vectors)!=1:raise ValueError()
 capture=json.loads(vectors[0]['capture'])
 for key in ('scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint'):
  if capture[key]!=hint[key]:raise ValueError()
 actual=sorted([m['project_id'],m['obligation_id'],m['captured_baseline_event_id'],m['captured_baseline_revision'],m['captured_baseline_fingerprint']] for m in capture['members'])
 if actual!=hint['baselines'] or len(actual)!=1:raise ValueError()
 projection=json.loads(vectors[0]['projection'])
 if capture['source_inventory']!=[] or capture['source_coverage']!='unavailable' or any(projection[k] is not None for k in ('known_captured_invoice_cost_minor','remaining_minor','eac_minor','budget_minor','margin_minor')) or capture['credit_eligible'] is not False:raise ValueError()
 baseline=capture['members'][0]['kernel_evidence']['baseline']
 if baseline['estimate_minor'] is not None or baseline['committed_minor'] is not None:raise ValueError()
 if set(state)!={'schema','head_revision','publications','receipts','controls','blocked_only','receipt_matches'} or state['schema']!='native-held-publication-state.v1' or any(type(state[k]) is not int or state[k]!=revision for k in ('head_revision','publications','receipts','controls')) or state['blocked_only'] is not True or state['receipt_matches'] is not True:raise ValueError()
except Exception:print('Native held publication proof mismatch',file=sys.stderr);sys.exit(1)
PY
 "$task_pub_deno" run --allow-read="$task_pub_dir/${label}_held_vector.json" "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts" "$task_pub_dir/${label}_held_vector.json" >"$task_pub_dir/${label}_held_kernel.log" 2>&1
 grep -Fx 'whole-scope-publication-transaction-vectors PASS 1 actual_saved_sql_to_unchanged_kernel' "$task_pub_dir/${label}_held_kernel.log" >/dev/null
 pub_sleep "$label";if [[ -n $writer_app ]];then blocked_by "$writer_app" "native_try_pub_$label";fi;if [[ -n $updater_app ]];then blocked_by "$updater_app" "$writer_app";fi
}
restore_role(){ psql_run -q -c "update public.user_roles set role='admin' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='projekt'" >"$task_pub_dir/restore_role_$task_pub_revision.log" 2>&1; }
restore_policy(){ psql_run -q -c "update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='planning'" >"$task_pub_dir/restore_policy_$task_pub_revision.log" 2>&1; }
# 1 Actual role UPDATE already acquired: SHARE NOWAIT must be busy.
task_try_checkpoint=role_writer
start_writer role_first <<'SQL'
begin;update public.user_roles set role='projekt' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep role_first
start_pub role_busy 0;busy_pub role_busy "$task_pub_active_pid";assert_state "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_role_first' and wait_event='PgSleep')";wait_owned "$writer"
authority_denied role_revoked organization_scope_admin_required
restore_role;publish_now role_restored
# 2 Reader holds qualifying admin SHARE, then a genuine revocation queues.
task_try_checkpoint=role_reader
start_pub role_reader 7;publisher=$task_pub_active_pid
wait_query "select exists(select 1 from pg_stat_activity where application_name='native_try_pub_role_reader' and wait_event='PgSleep')"
[[ -s $task_pub_dir/role_reader_held_receipt.json ]] || { echo 'Held role receipt required' >&2;exit 1; }
start_writer role_after <<'SQL'
begin;update public.user_roles set role='projekt' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';commit;
SQL
writer=$task_pub_writer_pid;blocked_by native_try_writer_role_after native_try_pub_role_reader
held_proof role_reader native_try_writer_role_after '';finish_pub role_reader "$publisher";wait_owned "$writer"
authority_denied role_after_authority organization_scope_admin_required
restore_role;publish_now role_after_restored
# 3 Actual direct packing enrollment owns economic barrier before policy.
task_try_checkpoint=direct_packing
start_writer direct_packing <<'SQL'
begin;create temporary table native_permission_enroll(data jsonb);insert into native_permission_enroll select enroll_command from operations_scope_reader_permission_native.fixture;grant select on native_permission_enroll to authenticated;
set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(data||jsonb_build_object('expected_revision',1,'idempotency_key','native-permission-direct-packing')) from native_permission_enroll;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep direct_packing
start_writer direct_policy <<'SQL'
begin;update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';commit;
SQL
updater=$task_pub_writer_pid;blocked_by native_try_writer_direct_policy native_try_writer_direct_packing
start_pub direct_busy 0;busy_pub direct_busy "$task_pub_active_pid";assert_state "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_direct_packing' and wait_event='PgSleep')";wait_owned "$writer";receipt direct_packing accepted scope_revision 2;wait_owned "$updater"
authority_denied direct_policy_authority scope_packing_missing_or_unenrolled
restore_policy;recompose;publish_now direct_restored
# 4 Compound preview retains exact root/policy SHARE before enrollment barrier.
task_try_checkpoint=compound_packing
pause after_barriers;start_pub compound_busy 7;publisher=$task_pub_active_pid;pub_sleep compound_busy
start_writer compound_packing <<'SQL'
begin;create temporary table native_permission_enroll(data jsonb);insert into native_permission_enroll select enroll_command from operations_scope_reader_permission_native.fixture;grant select on native_permission_enroll to authenticated;
set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(data||jsonb_build_object('expected_revision',2,'expected_membership_fingerprint',public.preview_operations_project_scope_v1('packing_project','65656565-6565-4656-8656-656565656565')->'membership_fingerprint','idempotency_key','native-permission-compound-packing')) from native_permission_enroll;commit;
SQL
writer=$task_pub_writer_pid;blocked_by native_try_writer_compound_packing native_try_pub_compound_busy
start_writer compound_policy <<'SQL'
begin;update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';commit;
SQL
updater=$task_pub_writer_pid;blocked_by native_try_writer_compound_policy native_try_writer_compound_packing
compatible_pub compound_busy "$publisher" native_try_writer_compound_packing native_try_writer_compound_policy;task_pub_compound_as_of=$task_pub_compatible_accepted
wait_owned "$writer";receipt compound_packing accepted scope_revision 3;wait_owned "$updater";pause none
authority_denied compound_policy_authority scope_packing_missing_or_unenrolled
restore_policy;recompose;publish_now compound_restored

task_try_checkpoint=vectors
[[ $task_pub_compound_as_of =~ ^[01]$ && $task_pub_revision == $((5+task_pub_compound_as_of)) ]] || { echo 'Exact permission branch count required' >&2;exit 1; }
observe "select jsonb_agg(jsonb_build_object('label','native_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint) order by publication_revision)::text from operations_scope_publication_native.publications" >"$task_pub_dir/vectors.json"
"$task_pub_deno" run --allow-read="$task_pub_dir/vectors.json" "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts" "$task_pub_dir/vectors.json" >"$task_pub_dir/vector_result.log" 2>&1
grep -Fx "whole-scope-publication-transaction-vectors PASS $task_pub_revision actual_saved_sql_to_unchanged_kernel" "$task_pub_dir/vector_result.log"
assert_state "select (select count(*)=$task_pub_revision and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls) and (select count(*)=1 and bool_and(economic_scope_id='67676767-6767-4676-8676-676767676767' and publication_revision=$task_pub_revision) from operations_scope_publication_native.heads) and (select count(*)=$task_pub_revision and bool_and(capture->'source_inventory'='[]'::jsonb and projection->'known_captured_invoice_cost_minor'='null'::jsonb and projection->'eac_minor'='null'::jsonb and projection->'budget_minor'='null'::jsonb and projection->'margin_minor'='null'::jsonb) from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select current_revision=3 from public.operations_project_scope_heads where economic_scope_id='67676767-6767-4676-8676-676767676767') and (select count(*)=3 from public.operations_project_scope_snapshots where economic_scope_id='67676767-6767-4676-8676-676767676767') and (select current_revision=3 from public.operations_scope_obligation_composition_heads where economic_scope_id='67676767-6767-4676-8676-676767676767') and (select count(*)=3 from public.operations_scope_obligation_compositions where economic_scope_id='67676767-6767-4676-8676-676767676767') and (select current_revision=1 from public.operations_project_scope_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select current_revision=1 from public.operations_scope_obligation_composition_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select count(*)=4 and bool_and(current_revision=1) from public.operations_project_obligation_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams) and (select count(*)=1 and bool_and(pause_stage='none') from operations_scope_publication_try_native.controls) and exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin') and exists(select 1 from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status='planning' and enabled)"
task_try_checkpoint=terminal
printf 'whole-scope-reader-permission-branches PASS compound_as_of=%s saved=%s\n' "$task_pub_compound_as_of" "$task_pub_revision"
echo 'whole-scope-reader-permission-native PASS actual_role_and_packing_queues_unknown_cost_no_product_authority'
