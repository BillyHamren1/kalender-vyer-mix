#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2;exit 2; }
[[ ${EVENTFLOW_SCOPE_PUBLICATION_TRY_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated publication fixture required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Loopback PostgreSQL required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq overrides forbidden' >&2;exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Explicit postgres port5432 required' >&2;exit 2; }
[[ ${PGDATABASE:-} == eventflow_scope_publication_runtime ]] || { echo 'Dedicated publication database required' >&2;exit 2; }
task_pub_deno=${EVENTFLOW_SCOPE_PUBLICATION_TRY_DENO_BIN:-deno}
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
 # Fixed PostgreSQL timeout categories only; private SQL/context never leaves.
 raw=path.read_bytes()
 for token,code,reason in ((b'canceling statement due to lock timeout','55P03','writer_lock_timeout'),(b'canceling statement due to statement timeout','57014','writer_statement_timeout'),(b'deadlock detected','40P01','writer_deadlock')):
  if token in raw:
   print('ERROR: '+code+': closed_native_child_failure');print('TRY_NATIVE_REASON '+reason);break
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
[[ $(observe "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user)
 and current_database()='eventflow_scope_publication_runtime'
 and current_setting('eventflow.scope_publication_isolated',true)='synthetic-disposable'
 and (select count(*)=4 from auth.users)
 and (select count(*)=4 and bool_and(organization_id is not null and (user_id,organization_id) in (('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid))) from public.profiles)
 and (select count(*)=3 and bool_and(organization_id is not null and (user_id,organization_id,role::text) in (('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin'))) from public.user_roles)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.role='admin')
 and (select count(*)=3 and bool_and(deleted_at is null and (id,organization_id) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid))) from public.projects)
 and (select count(*)=1 and bool_and(slot='only' and read_request->>'organization_id'='11111111-1111-4111-8111-111111111111' and read_request->>'economic_scope_id'='90909090-9090-4909-8909-909090909090' and read_request->>'expected_scope_revision'='1' and read_request->>'expected_composition_revision'='1') from public.operations_scope_invoice_kernel_native_fixture)
 and (select count(*)=2 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id=any(array['13131313-1313-4313-8313-131313131313','23232323-2323-4232-8232-232323232323']::uuid[]) and current_revision=1) from public.operations_finance_invoice_streams)
 and not exists(select 1 from public.operations_finance_credit_v2_streams)
 and (select count(*)=3 from public.operations_project_obligation_invoice_bindings)
 and (select count(*)=3 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and current_revision=1) from public.operations_project_obligation_heads)
 and (select count(*)=3 from public.operations_project_obligation_baselines)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='90909090-9090-4909-8909-909090909090' and current_revision=1) from public.operations_project_scope_heads)
 and (select count(*)=1 from public.operations_project_scope_snapshots)
 and (select count(*)=1 and bool_and(current_revision=1) from public.operations_scope_obligation_composition_heads)
 and (select count(*)=1 from public.operations_scope_obligation_compositions)
 and (select count(*)=2 and bool_and(current_revision=1) from public.operations_obligation_source_policy_heads)
 and (select count(*)=1 and bool_and(system_user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and project_id='55555555-5555-4555-8555-555555555555' and decision='granted') from public.operations_project_personnel_review_grants)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='90909090-9090-4909-8909-909090909090' and enabled and not fault_after_publication and not pause_after_barriers) from operations_scope_publication_native.gates)
 and not exists(select 1 from operations_scope_publication_native.heads)
 and not exists(select 1 from operations_scope_publication_native.publications)
 and not exists(select 1 from operations_scope_publication_native.receipts)
 and not exists(select 1 from operations_scope_publication_native.blocked_controls)
 and (select count(*)=1 and bool_and(slot='only' and pause_stage='none') from operations_scope_publication_try_native.controls)
 and not has_schema_privilege('authenticated','operations_scope_publication_native','USAGE')
 and not has_schema_privilege('service_role','operations_scope_publication_native','USAGE')") == t ]] || { echo 'Exact fresh synthetic publication state required' >&2;exit 2; }
task_pub_dir=$(mktemp -d)
declare -A task_pub_pids=()
task_pub_revision=0
task_pub_baseline_as_of=0
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
 observe "select jsonb_build_object('scope_snapshot_id',m.snapshot_id,'scope_revision',m.scope_revision,'membership_fingerprint',m.membership_fingerprint,'composition_snapshot_id',c.snapshot_id,'composition_revision',c.composition_revision,'composition_fingerprint',c.fingerprint,'baselines',(select jsonb_agg(jsonb_build_array(b.project_id,b.obligation_id,b.event_id,b.revision,b.fingerprint) order by b.project_id,b.obligation_id) from public.operations_scope_obligation_baseline_captures x join public.operations_project_obligation_baselines b on b.event_id=x.baseline_event_id where x.composition_snapshot_id=c.snapshot_id)) from public.operations_scope_invoice_kernel_native_fixture f join public.operations_scope_obligation_compositions c on c.organization_id=(f.read_request->>'organization_id')::uuid and c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=(f.read_request->>'expected_composition_revision')::bigint and c.fingerprint=f.read_request->>'expected_composition_fingerprint' join public.operations_project_scope_snapshots m on m.snapshot_id=c.scope_snapshot_id" >"$task_pub_dir/${label}_hint.json"
 cat >"$task_pub_dir/${label}_pub.sql" <<SQL
begin;
create temporary table native_try_receipt(data jsonb not null);
grant insert,select on native_try_receipt to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into native_try_receipt select pg_temp.publish_scope_native_try_v1((read_request-'organization_id')||jsonb_build_object('schema_version','operations-scope-publication-native.v1','expected_publication_revision',$expected,'idempotency_key','native-atomic-publication-$label','reason','Native atomic source publication')) from public.operations_scope_invoice_kernel_native_fixture;
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
 # These four real waiters span authored4s pre-pause +7s held-proof pause.
 # Keep finite bounds with room for validation; all other families stay10/12s.
 case "$label" in baseline|project_update|compound_enrollment|compound_root_update)
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
do $$declare command jsonb;result jsonb;membership public.operations_project_scope_snapshots%rowtype;h public.operations_project_scope_heads%rowtype;revision bigint;ids jsonb;begin
select * into strict h from public.operations_project_scope_heads;
select * into strict membership from public.operations_project_scope_snapshots where scope_revision=h.current_revision;
select current_revision into strict revision from public.operations_scope_obligation_composition_heads;
select jsonb_agg(to_jsonb(b.event_id) order by b.event_id) into ids from public.operations_project_obligation_heads oh join public.operations_project_obligation_baselines b on b.organization_id=oh.organization_id and b.obligation_id=oh.obligation_id and b.revision=oh.current_revision;
select compose_command||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision,'baseline_event_ids',ids,'idempotency_key','native-atomic-recompose-'||revision) into command from public.operations_scope_invoice_kernel_native_fixture;
execute 'set local role authenticated';result:=public.compose_operations_scope_obligations_v1(command);execute 'reset role';
if result->>'outcome'<>'accepted' or (result->>'composition_revision')::bigint<>revision+1 then raise exception 'native_actual_recomposition_not_accepted';end if;
update public.operations_scope_invoice_kernel_native_fixture set read_request=read_request||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision+1,'expected_composition_fingerprint',result->'fingerprint');
end;$$;commit;
SQL
}
busy_pub(){ local label=$1 pid=$2 status=0;wait_owned "$pid" || status=$?;[[ $label != baseline_busy ]] || task_try_checkpoint=baseline_busy_denial;denied "$status" "$label" 55P03 native_try_publication_lock_busy
 [[ $label != baseline_busy ]] || task_try_checkpoint=baseline_busy_state
 assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and coalesce(bool_and(destination_id is null and wire_payload is null),true) from operations_scope_publication_native.blocked_controls) and (select coalesce(max(publication_revision),0)=$task_pub_revision from operations_scope_publication_native.heads)"; }
authority_denied(){ local label=$1 message=$2 status=0;start_pub "$label" 0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" "$label" 42501 "$message"; }
pause(){ psql_run -q -c "update operations_scope_publication_try_native.controls set pause_stage='$1'" >"$task_pub_dir/pause_$task_pub_revision.log" 2>&1; }
blocked_by(){ wait_query "select exists(select 1 from pg_stat_activity w join pg_stat_activity b on b.application_name='$2' where w.application_name='$1' and w.wait_event_type='Lock' and b.pid=any(pg_blocking_pids(w.pid)))"; }
restore_project(){ psql_run -q -c "update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555'" >"$task_pub_dir/restore_project_$task_pub_revision.log" 2>&1; }
restore_root(){ psql_run -q -c "update public.large_projects set deleted_at=null where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'" >"$task_pub_dir/restore_root_$task_pub_revision.log" 2>&1; }

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
 if actual!=hint['baselines'] or len(actual)!=3:raise ValueError()
 if set(state)!={'schema','head_revision','publications','receipts','controls','blocked_only','receipt_matches'} or state['schema']!='native-held-publication-state.v1' or any(type(state[k]) is not int or state[k]!=revision for k in ('head_revision','publications','receipts','controls')) or state['blocked_only'] is not True or state['receipt_matches'] is not True:raise ValueError()
except Exception:print('Native held publication proof mismatch',file=sys.stderr);sys.exit(1)
PY
 "$task_pub_deno" run --allow-read="$task_pub_dir/${label}_held_vector.json" "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts" "$task_pub_dir/${label}_held_vector.json" >"$task_pub_dir/${label}_held_kernel.log" 2>&1
 grep -Fx 'whole-scope-publication-transaction-vectors PASS 1 actual_saved_sql_to_unchanged_kernel' "$task_pub_dir/${label}_held_kernel.log" >/dev/null
 pub_sleep "$label";blocked_by "$writer_app" "native_try_pub_$label";blocked_by "$updater_app" "$writer_app"
 finish_pub "$label" "$pid";task_pub_compatible_accepted=1
}

# 1: real baseline owns project SHARE before org; queued UPDATE is observed.
task_try_checkpoint=baseline_pause
pause after_barriers;start_pub baseline_busy 7;publisher=$task_pub_active_pid;task_try_checkpoint=baseline_sleep;pub_sleep baseline_busy
start_writer baseline <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_manual_obligation_baseline_v1(baseline_command) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;task_try_checkpoint=baseline_wait;blocked_by native_try_writer_baseline native_try_pub_baseline_busy
start_writer project_update <<'SQL'
begin;update public.projects set deleted_at=now() where id='55555555-5555-4555-8555-555555555555';commit;
SQL
updater=$task_pub_writer_pid;task_try_checkpoint=baseline_queue;blocked_by native_try_writer_project_update native_try_writer_baseline
task_try_checkpoint=baseline_busy;task_try_focus=baseline_busy;compatible_pub baseline_busy "$publisher" native_try_writer_baseline native_try_writer_project_update;task_pub_baseline_as_of=$task_pub_compatible_accepted
task_try_checkpoint=baseline_writer;task_try_focus=baseline;wait_owned "$writer"
task_try_checkpoint=baseline_receipt;receipt baseline accepted revision 2
task_try_checkpoint=baseline_updater;task_try_focus=project_update;wait_owned "$updater"
task_try_checkpoint=baseline_restore;pause none;authority_denied baseline_authority obligation_project_access_denied
restore_project;recompose;publish_now baseline_restored

# 2: actual composition owns org before project; TRY refuses its held key.
start_writer composition <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare command jsonb;result jsonb;membership public.operations_project_scope_snapshots%rowtype;h public.operations_project_scope_heads%rowtype;revision bigint;ids jsonb;begin
select * into strict h from public.operations_project_scope_heads;
select * into strict membership from public.operations_project_scope_snapshots where scope_revision=h.current_revision;
select current_revision into strict revision from public.operations_scope_obligation_composition_heads;
select jsonb_agg(to_jsonb(b.event_id) order by b.event_id) into ids from public.operations_project_obligation_heads oh join public.operations_project_obligation_baselines b on b.organization_id=oh.organization_id and b.obligation_id=oh.obligation_id and b.revision=oh.current_revision;
select compose_command||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision,'baseline_event_ids',ids,'idempotency_key','native-try-recompose-'||revision) into command from public.operations_scope_invoice_kernel_native_fixture;
execute 'set local role authenticated';result:=public.compose_operations_scope_obligations_v1(command);execute 'reset role';
if result->>'outcome'<>'accepted' or (result->>'composition_revision')::bigint<>revision+1 then raise exception 'native_actual_recomposition_not_accepted';end if;
update public.operations_scope_invoice_kernel_native_fixture set read_request=read_request||jsonb_build_object('expected_scope_revision',h.current_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',revision+1,'expected_composition_fingerprint',result->'fingerprint');
end;$$;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;task_try_checkpoint=composition_sleep;writer_sleep composition
start_writer composition_update <<'SQL'
begin;update public.projects set deleted_at=now() where id='55555555-5555-4555-8555-555555555555';commit;
SQL
updater=$task_pub_writer_pid;task_try_checkpoint=composition_queue;blocked_by native_try_writer_composition_update native_try_writer_composition
task_try_checkpoint=composition_busy;start_pub composition_busy 0;busy_pub composition_busy "$task_pub_active_pid";assert_state "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_composition' and wait_event='PgSleep')";wait_owned "$writer";wait_owned "$updater"
assert_state "select current_revision=3 from public.operations_scope_obligation_composition_heads"
task_try_checkpoint=composition_restore;authority_denied composition_authority obligation_project_access_denied
restore_project;publish_now composition_restored

# 3: ordinary direct enrollment takes economic barrier BEFORE root SHARE.
start_writer direct_enrollment <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(enroll_command||jsonb_build_object('expected_revision',1,'idempotency_key','native-try-direct-enrollment')) from public.operations_scope_invoice_kernel_native_fixture;
select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;task_try_checkpoint=direct_sleep;writer_sleep direct_enrollment
start_writer direct_root_update <<'SQL'
begin;update public.large_projects set deleted_at=now() where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';commit;
SQL
updater=$task_pub_writer_pid;task_try_checkpoint=direct_queue;blocked_by native_try_writer_direct_root_update native_try_writer_direct_enrollment
task_try_checkpoint=direct_busy;start_pub direct_busy 0;busy_pub direct_busy "$task_pub_active_pid";assert_state "select exists(select 1 from pg_stat_activity where application_name='native_try_writer_direct_enrollment' and wait_event='PgSleep')";wait_owned "$writer";receipt direct_enrollment accepted scope_revision 2;wait_owned "$updater"
task_try_checkpoint=direct_restore;authority_denied direct_authority scope_root_missing_or_foreign
restore_root;recompose;publish_now direct_restored

# 4: supported compound preview→enroll retains root BEFORE economic barrier.
task_try_checkpoint=compound_sleep;pause after_barriers;start_pub compound_busy 7;publisher=$task_pub_active_pid;pub_sleep compound_busy
start_writer compound_enrollment <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(enroll_command||jsonb_build_object('expected_revision',2,'expected_membership_fingerprint',public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc')->'membership_fingerprint','idempotency_key','native-try-compound-enrollment')) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;task_try_checkpoint=compound_wait;blocked_by native_try_writer_compound_enrollment native_try_pub_compound_busy
start_writer compound_root_update <<'SQL'
begin;update public.large_projects set deleted_at=now() where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';commit;
SQL
updater=$task_pub_writer_pid;task_try_checkpoint=compound_queue;blocked_by native_try_writer_compound_root_update native_try_writer_compound_enrollment
task_try_checkpoint=compound_busy;task_try_focus=compound_busy;compatible_pub compound_busy "$publisher" native_try_writer_compound_enrollment native_try_writer_compound_root_update;task_pub_compound_as_of=$task_pub_compatible_accepted;wait_owned "$writer";receipt compound_enrollment accepted scope_revision 3;wait_owned "$updater"
task_try_checkpoint=compound_restore;pause none;authority_denied compound_authority scope_root_missing_or_foreign
restore_root;recompose;publish_now compound_restored

task_try_checkpoint=vectors
[[ $task_pub_baseline_as_of =~ ^[01]$ && $task_pub_compound_as_of =~ ^[01]$ && $task_pub_revision == $((4+task_pub_baseline_as_of+task_pub_compound_as_of)) ]] || { echo 'Exact TRY native branch publication count required' >&2;exit 1; }
observe "select jsonb_agg(jsonb_build_object('label','native_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint) order by publication_revision)::text from operations_scope_publication_native.publications" >"$task_pub_dir/vectors.json"
"$task_pub_deno" run --allow-read="$task_pub_dir/vectors.json" "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts" "$task_pub_dir/vectors.json" >"$task_pub_dir/vector_result.log" 2>&1 || { echo 'Native saved TRY publication vector verification failed' >&2;exit 1; }
grep -Fx "whole-scope-publication-transaction-vectors PASS $task_pub_revision actual_saved_sql_to_unchanged_kernel" "$task_pub_dir/vector_result.log"
assert_state "select (select count(*)=$task_pub_revision and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls) and (select count(*)=1 and bool_and(publication_revision=$task_pub_revision) from operations_scope_publication_native.heads) and (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select current_revision=3 from public.operations_project_scope_heads) and (select current_revision=5 from public.operations_scope_obligation_composition_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams) and (select count(*)=3 and bool_and(current_revision=case when obligation_id='abababab-abab-4aba-8aba-abababababab' then 2 else 1 end) from public.operations_project_obligation_heads) and (select count(*)=1 and bool_and(pause_stage='none') from operations_scope_publication_try_native.controls)"
task_try_checkpoint=terminal
printf 'whole-scope-publication-try-branches PASS baseline_as_of=%s compound_as_of=%s saved=%s\n' "$task_pub_baseline_as_of" "$task_pub_compound_as_of" "$task_pub_revision"
echo 'whole-scope-publication-try-native PASS four_actual_queued_writer_families_protected_as_of_or_busy_rollback_no_authority_activation'
