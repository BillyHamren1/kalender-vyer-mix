#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2;exit 2; }
[[ ${EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated product read fixture required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Loopback PostgreSQL required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq overrides forbidden' >&2;exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Explicit postgres port5432 required' >&2;exit 2; }
[[ ${PGDATABASE:-} == eventflow_scope_publication_runtime ]] || { echo 'Dedicated publication database required' >&2;exit 2; }
task_pub_deno=${EVENTFLOW_SCOPE_COMPATIBLE_READ_DENO_BIN:-deno}
command -v "$task_pub_deno" >/dev/null && command -v python3 >/dev/null || { echo 'Exact Deno and monotonic observer runtime required' >&2;exit 2; }
task_pub_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
task_pub_dir='' # Ignore inherited paths before the guarded owned mktemp.
task_try_checkpoint=guard
task_try_focus=''
finish_try(){ local status=$?
 if [[ $status != 0 ]];then
  printf 'COMPATIBLE_READ_CHECKPOINT %s\n' "$task_try_checkpoint" >&2
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
task_pub_options='-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable -c eventflow.scope_compatible_read_isolated=synthetic-disposable'
psql_run(){ PGOPTIONS="$task_pub_options" psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose "$@"; }
observe(){ local private_log=/dev/null;if [[ -n $task_pub_dir ]];then private_log="$task_pub_dir/observers.log";fi
 PGCONNECT_TIMEOUT=2 PGOPTIONS='-c statement_timeout=1000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=2000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable -c eventflow.scope_compatible_read_isolated=synthetic-disposable' psql -X --no-password --set ON_ERROR_STOP=1 -Atqc "$1" 2>>"$private_log";
}
[[ $(observe "select current_user='postgres' and session_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_database()='eventflow_scope_publication_runtime' and current_setting('eventflow.scope_publication_isolated',true)='synthetic-disposable' and current_setting('eventflow.scope_publication_try_isolated',true)='synthetic-disposable' and (select count(*)=1 and bool_and(slot='only' and read_request->>'economic_scope_id'='67676767-6767-4676-8676-676767676767' and read_request->>'expected_scope_revision'='1' and read_request->>'expected_composition_revision'='1') from operations_scope_reader_permission_native.fixture) and (select count(*)=4 from auth.users) and (select count(*)=4 and bool_and(organization_id is not null) from public.profiles) and (select count(*)=3 from public.user_roles) and exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin') and (select count(*)=4 and bool_and(deleted_at is null) from public.projects) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_project_scope_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_scope_obligation_composition_heads) and (select current_revision=1 from public.operations_project_scope_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select current_revision=1 from public.operations_scope_obligation_composition_heads where economic_scope_id='90909090-9090-4909-8909-909090909090') and (select count(*)=4 and bool_and(current_revision=1) from public.operations_project_obligation_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams) and (select count(*)=1 and bool_and(slot='only' and pause_stage='none') from operations_scope_publication_try_native.controls) and (select count(*)=2 and bool_and(enabled and not fault_after_publication and not pause_after_barriers) from operations_scope_publication_native.gates) and (select count(*)=2 and bool_and(enabled) from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status in ('planning','ready')) and exists(select 1 from public.packing_projects where id='65656565-6565-4656-8656-656565656565' and organization_id='11111111-1111-4111-8111-111111111111' and status='planning') and not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.blocked_controls) and exists(select 1 from pg_constraint where conrelid='public.user_roles'::regclass and confrelid='auth.users'::regclass and contype='f' and confdeltype='c' and convalidated) and exists(select 1 from pg_index where indexrelid='public.user_roles_user_role_org_key'::regclass and indisunique and indisvalid) and not has_schema_privilege('authenticated','operations_scope_reader_permission_native','USAGE') and not has_schema_privilege('service_role','operations_scope_reader_permission_native','USAGE') and to_regclass('operations_scope_compatible_read_native.requests') is not null and (select count(*)=2 from operations_scope_compatible_read_native.requests) and not has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','execute') and not has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','execute')") == t ]] || { echo 'Exact fresh compatible read fixture required' >&2;exit 2; }
task_pub_dir=$(mktemp -d)
declare -A task_pub_pids=()
task_read_success=0
task_baseline_as_of=0
task_compound_as_of=0
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
[[ $# == 1 && $1 == /* && -f $1 && ! -L $1 ]] || { echo 'Private baseline vectors required' >&2;exit 2; }
task_read_vectors=$1
state_hash(){ observe 'select operations_scope_compatible_read_native.state_sha256()'; }
read_sql(){ local role=$1 case_id=$2 hold=$3 label=$4 prepause=${5:-0}
 case "$role:$case_id" in authenticated:unknown|authenticated:known|service_role:unknown|service_role:known);;*)return 1;;esac
 local field=service_request fn=read_operations_scope_invoice_kernel_evidence_v1
 if [[ $role == authenticated ]];then field=admin_request;fn=read_operations_scope_invoice_capture_admin_v1;fi
 cat <<SQL
begin;
select case when $prepause>0 then pg_advisory_xact_lock(hashtextextended('obligation-org:11111111-1111-4111-8111-111111111111',0)) end;
select case when $prepause>0 then pg_advisory_xact_lock(hashtextextended('operations-economic-scope:11111111-1111-4111-8111-111111111111',0)) end;
select pg_sleep($prepause);
create temporary table native_product_read_request(data jsonb);
insert into native_product_read_request select $field from operations_scope_compatible_read_native.requests where case_id='$case_id';
create temporary table native_product_read_response(data jsonb);
create temporary table native_product_read_before(data text);
insert into native_product_read_before select operations_scope_compatible_read_native.state_sha256();
grant select on native_product_read_request to $role;
grant insert,select on native_product_read_response to $role;
set local role $role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into native_product_read_response select public.$fn(data) from native_product_read_request;
reset role;
select jsonb_build_object('request',(select data from native_product_read_request),'reply',(select data from native_product_read_response),'state_before',(select data from native_product_read_before),'state_after_read',operations_scope_compatible_read_native.state_sha256())
\\g $task_pub_dir/${label}_held.json
select pg_sleep($hold);
commit;
SQL
}
start_read(){ local label=$1 role=$2 case_id=$3 hold=$4 prepause=${5:-0};task_try_focus=$label
 read_sql "$role" "$case_id" "$hold" "$label" "$prepause" >"$task_pub_dir/$label.sql"
 PGAPPNAME="native_compatible_read_$label" psql_run -Atq -f "$task_pub_dir/$label.sql" >"$task_pub_dir/$label.log" 2>&1 &
 task_read_pid=$!;task_pub_pids["$task_read_pid"]=1
}
start_writer(){ local label=$1;task_try_focus=$label;cat >"$task_pub_dir/$label.sql"
 PGAPPNAME="native_compatible_writer_$label" PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=15000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_publication_isolated=synthetic-disposable -c eventflow.scope_publication_try_isolated=synthetic-disposable -c eventflow.scope_compatible_read_isolated=synthetic-disposable' psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose -Atq -f "$task_pub_dir/$label.sql" >"$task_pub_dir/$label.log" 2>&1 &
 task_writer_pid=$!;task_pub_pids["$task_writer_pid"]=1
}
read_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_compatible_read_$1' and wait_event='PgSleep')"; }
writer_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_compatible_writer_$1' and wait_event='PgSleep')"; }
writer_blocked_by_read(){ wait_query "select exists(select 1 from pg_stat_activity w join pg_stat_activity r on r.application_name='native_compatible_read_$2' where w.application_name='native_compatible_writer_$1' and w.wait_event_type='Lock' and r.pid=any(pg_blocking_pids(w.pid)))"; }
writer_blocked_by_writer(){ wait_query "select exists(select 1 from pg_stat_activity w join pg_stat_activity b on b.application_name='native_compatible_writer_$2' where w.application_name='native_compatible_writer_$1' and w.wait_event_type='Lock' and b.pid=any(pg_blocking_pids(w.pid)))"; }
finish_read(){ wait_owned "$1" || { echo 'Actual product read failed' >&2;return 1; };task_read_success=$((task_read_success+1)); }
denial(){ local label=$1 role=$2 case_id=$3 code=$4 message=$5 status=0 before after;task_try_focus=$label
 before=$(state_hash);start_read "$label" "$role" "$case_id" 0
 wait_owned "$task_read_pid" || status=$?
 [[ $status != 0 ]] || { echo 'Product denial unexpectedly succeeded' >&2;return 1; }
 grep -F "ERROR:  $code:" "$task_pub_dir/$label.log" >/dev/null && grep -F "$message" "$task_pub_dir/$label.log" >/dev/null || { echo 'Exact product denial required' >&2;return 1; }
 after=$(state_hash);[[ $before == "$after" ]] || { echo 'Denied read changed canonical state' >&2;return 1; }
}
held(){ local label=$1 slot=$2
 python3 - "$task_read_vectors" "$task_pub_dir/${label}_held.json" "$task_pub_dir/${label}_vectors.json" "$slot" 2>>"$task_pub_dir/held.log" <<'PY'
import json,pathlib,re,sys,os
try:
 base=pathlib.Path(sys.argv[1]);actual=pathlib.Path(sys.argv[2]);out=pathlib.Path(sys.argv[3]);slot=sys.argv[4]
 for p in (base,actual):
  if p.resolve()!=p or not p.is_file() or p.stat().st_size>8*1024*1024 or p.stat().st_uid!=os.getuid():raise ValueError()
 rows=json.loads(base.read_text());value=json.loads(actual.read_text())
 if set(value)!={'request','reply','state_before','state_after_read'} or not isinstance(value['state_before'],str) or not re.fullmatch('[0-9a-f]{64}',value['state_before']) or value['state_before']!=value['state_after_read']:raise ValueError()
 selected=[r for r in rows if r['label']==slot]
 if len(rows)!=8 or len(selected)!=1 or selected[0]['request']!=value['request']:raise ValueError()
 selected[0]['evidence']=json.dumps(value['reply'],ensure_ascii=False,separators=(',',':'))
 fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(fd,json.dumps(rows,ensure_ascii=False).encode());os.close(fd)
except Exception:sys.exit(1)
PY
 "$task_pub_deno" run --allow-read "$task_pub_root/scripts/project-economy/operations-scope-compatible-read-vector-test.ts" "$task_pub_dir/${label}_vectors.json" >"$task_pub_dir/${label}_vector.log" 2>&1
 grep -Fx 'operations-scope-compatible-read-vectors PASS 8 actual_sql_same_frozen_models_null_costs' "$task_pub_dir/${label}_vector.log" >/dev/null
}
refresh_vectors(){ local label=$1
 psql_run -Atq >"$task_pub_dir/${label}_refresh.log" 2>&1 <<'SQL'
update operations_scope_compatible_read_native.requests r set
 service_request=r.service_request||jsonb_build_object('expected_scope_revision',c.scope_revision,'expected_membership_fingerprint',c.membership_fingerprint,'expected_composition_revision',c.composition_revision,'expected_composition_fingerprint',c.fingerprint),
 admin_request=r.admin_request||jsonb_build_object('expected_composition_snapshot_id',c.snapshot_id)
from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
where h.organization_id='11111111-1111-4111-8111-111111111111' and h.economic_scope_id=(r.service_request->>'economic_scope_id')::uuid;
SQL
 psql_run -Atq -f "$task_pub_root/scripts/project-economy/operations-scope-compatible-read-refresh-vectors.sql" >"$task_pub_dir/${label}_current.log" 2>&1
 python3 - "$task_pub_dir/${label}_current.log" "$task_pub_dir/${label}_current.json" 2>>"$task_pub_dir/refresh.log" <<'PYREFRESH'
import json,os,pathlib,sys
try:
 source=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);rows=[]
 if source.resolve()!=source or source.stat().st_size>8*1024*1024:raise ValueError()
 for line in source.read_text().splitlines():
  try:value=json.loads(line)
  except ValueError:continue
  if isinstance(value,list) and len(value)==8:rows.append(value)
 if len(rows)!=1:raise ValueError()
 fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.write(fd,json.dumps(rows[0],ensure_ascii=False).encode());os.close(fd)
except Exception:sys.exit(1)
PYREFRESH
 "$task_pub_deno" run --allow-read "$task_pub_root/scripts/project-economy/operations-scope-compatible-read-vector-test.ts" "$task_pub_dir/${label}_current.json" >"$task_pub_dir/${label}_current_vector.log" 2>&1
 grep -Fx 'operations-scope-compatible-read-vectors PASS 8 actual_sql_same_frozen_models_null_costs' "$task_pub_dir/${label}_current_vector.log" >/dev/null
 task_read_vectors="$task_pub_dir/${label}_current.json"
}
restore_role(){ psql_run -Atq >"$task_pub_dir/restore_role.log" 2>&1 <<'SQL'
update public.user_roles set role='admin' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111';
SQL
 assert_state "select exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin')"
}

# Product role writer first: acquired incompatible tuple requires exact busy.
task_try_checkpoint=role_acquired
start_writer role_acquired <<'SQL'
begin;update public.user_roles set role='projekt' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111';select pg_sleep(4);commit;
SQL
role_writer=$task_writer_pid;writer_sleep role_acquired
denial role_busy authenticated unknown 55P03 scope_invoice_reader_lock_busy
writer_sleep role_acquired
wait_owned "$role_writer"
denial role_revoked authenticated unknown 42501 organization_scope_admin_required
restore_role

# Product reader first: the real read retains role/project/source protections.
task_try_checkpoint=role_read_first
start_read role_held authenticated unknown 7;reader=$task_read_pid;read_sleep role_held
start_writer role_after <<'SQL'
begin;update public.user_roles set role='projekt' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111';commit;
SQL
role_writer=$task_writer_pid;writer_blocked_by_read role_after role_held
held role_held new_admin_unknown
read_sleep role_held;writer_blocked_by_read role_after role_held
finish_read "$reader";wait_owned "$role_writer"
denial role_after_denied authenticated unknown 42501 organization_scope_admin_required
restore_role

# Acquired current packing policy is incompatible with the actual public reader.
task_try_checkpoint=packing_acquired
start_writer packing_acquired <<'SQL'
begin;update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';select pg_sleep(4);commit;
SQL
packing_writer=$task_writer_pid;writer_sleep packing_acquired
denial packing_busy authenticated unknown 55P03 scope_invoice_reader_lock_busy
writer_sleep packing_acquired
wait_owned "$packing_writer"
denial packing_revoked authenticated unknown 42501 scope_packing_missing_or_unenrolled
psql_run -Atq >"$task_pub_dir/restore_packing.log" 2>&1 <<'SQL'
update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';
SQL
assert_state "select exists(select 1 from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status='planning' and enabled)"

# Actual public read first retains the exact current policy, no whole-scope repricing.
task_try_checkpoint=packing_read_first
start_read packing_held authenticated unknown 7;reader=$task_read_pid;read_sleep packing_held
start_writer packing_after <<'SQL'
begin;update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';commit;
SQL
packing_writer=$task_writer_pid;writer_blocked_by_read packing_after packing_held
held packing_held new_admin_unknown
read_sleep packing_held;writer_blocked_by_read packing_after packing_held
finish_read "$reader";wait_owned "$packing_writer"
denial packing_after_denied authenticated unknown 42501 scope_packing_missing_or_unenrolled
psql_run -Atq >"$task_pub_dir/restore_packing_after.log" 2>&1 <<'SQL'
update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';
SQL
assert_state "select exists(select 1 from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status='planning' and enabled)"

# Actual member project is locked by the public service entry, before kernel reuse.
task_try_checkpoint=project_acquired
start_writer project_acquired <<'SQL'
begin;update public.projects set deleted_at=clock_timestamp() where id='64646464-6464-4646-8646-646464646464' and organization_id='11111111-1111-4111-8111-111111111111';select pg_sleep(4);rollback;
SQL
project_writer=$task_writer_pid;writer_sleep project_acquired
denial project_busy service_role unknown 55P03 scope_invoice_reader_lock_busy
writer_sleep project_acquired
wait_owned "$project_writer"
assert_state "select deleted_at is null from public.projects where id='64646464-6464-4646-8646-646464646464'"

# Actual service reader first must prevent the legacy member update until commit.
task_try_checkpoint=project_read_first
start_read project_held service_role unknown 7;reader=$task_read_pid;read_sleep project_held
start_writer project_after <<'SQL'
begin;update public.projects set deleted_at=clock_timestamp() where id='64646464-6464-4646-8646-646464646464' and organization_id='11111111-1111-4111-8111-111111111111';rollback;
SQL
project_writer=$task_writer_pid;writer_blocked_by_read project_after project_held
held project_held new_service_unknown
read_sleep project_held;writer_blocked_by_read project_after project_held
finish_read "$reader";wait_owned "$project_writer"
assert_state "select deleted_at is null from public.projects where id='64646464-6464-4646-8646-646464646464'"

# Org-first actual composition writer is a mandatory advisory busy family.
task_try_checkpoint=compose_acquired
start_writer compose_acquired <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
create temporary table native_compose_request(data jsonb);insert into native_compose_request select compose_command||jsonb_build_object('expected_composition_revision',1,'idempotency_key','native-product-compose-two','reason','Actual product read advisory compatibility') from operations_scope_reader_permission_native.fixture;grant select on native_compose_request to authenticated;
set local role authenticated;select public.compose_operations_scope_obligations_v1(data) from native_compose_request;reset role;select pg_sleep(4);commit;
SQL
compose_writer=$task_writer_pid;writer_sleep compose_acquired
denial compose_busy service_role unknown 55P03 scope_invoice_reader_lock_busy
writer_sleep compose_acquired
wait_owned "$compose_writer"
python3 - "$task_pub_dir/compose_acquired.log" 2>>"$task_pub_dir/receipts.log" <<'PY'
import json,sys
try:
 values=[]
 for line in open(sys.argv[1]):
  try:v=json.loads(line)
  except ValueError:continue
  if isinstance(v,dict) and v.get('outcome')=='accepted' and v.get('composition_revision')==2:values.append(v)
 if len(values)!=1:raise ValueError()
except Exception:sys.exit(1)
PY
assert_state "select current_revision=2 from public.operations_scope_obligation_composition_heads where economic_scope_id='67676767-6767-4676-8676-676767676767'"
denial compose_stale_admin authenticated unknown PT409 displayed_scope_invoice_capture_changed
denial compose_stale_service service_role unknown 22023 current_scope_invoice_composition_required
refresh_vectors after_composition

# Queued project UPDATE while the real baseline writer owns project SHARE and waits org.
# Compatible SHARE may accept a fully protected as-of read or fail exact NOWAIT busy.
task_try_checkpoint=baseline_queue
start_read baseline_held service_role unknown 7 4;reader=$task_read_pid;read_sleep baseline_held
start_writer baseline_after <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
create temporary table baseline_request(data jsonb);insert into baseline_request select baseline_command||jsonb_build_object('expected_revision',1,'idempotency_key','native-product-baseline-two','reason','Actual queued baseline publication remains explicit unknown') from operations_scope_reader_permission_native.fixture;grant select on baseline_request to authenticated;
set local role authenticated;select public.append_operations_manual_obligation_baseline_v1(data) from baseline_request;reset role;commit;
SQL
baseline_writer=$task_writer_pid;writer_blocked_by_read baseline_after baseline_held
start_writer baseline_project_after <<'SQL'
begin;update public.projects set deleted_at=clock_timestamp() where id='64646464-6464-4646-8646-646464646464' and organization_id='11111111-1111-4111-8111-111111111111';commit;
SQL
project_writer=$task_writer_pid;writer_blocked_by_writer baseline_project_after baseline_after
# Observe a real result while the publisher remains open, or its exact busy rollback.
now=$(monotonic_ns);outcome_deadline=$((now+6000000000))
while [[ ! -s "$task_pub_dir/baseline_held_held.json" ]];do
 active=$(owned_live)
 if ! grep -Fx "$reader" <<< "$active" >/dev/null;then break;fi
 now=$(monotonic_ns);[[ $now -lt $outcome_deadline ]] || { echo 'Product result observation deadline' >&2;exit 1; };sleep 0.05
done
if [[ -s "$task_pub_dir/baseline_held_held.json" ]];then
 task_baseline_as_of=1
 held baseline_held new_service_unknown
 read_sleep baseline_held;writer_blocked_by_read baseline_after baseline_held;writer_blocked_by_writer baseline_project_after baseline_after
 finish_read "$reader"
else
 status=0;wait_owned "$reader" || status=$?
 [[ $status != 0 ]] || { echo 'Busy product queue unexpectedly succeeded without proof' >&2;exit 1; }
 grep -F 'ERROR:  55P03:' "$task_pub_dir/baseline_held.log" >/dev/null && grep -F scope_invoice_reader_lock_busy "$task_pub_dir/baseline_held.log" >/dev/null || { echo 'Exact queued product busy required' >&2;exit 1; }
fi
wait_owned "$baseline_writer";wait_owned "$project_writer"
python3 - "$task_pub_dir/baseline_after.log" 2>>"$task_pub_dir/baseline_receipt.log" <<'PYBASELINE'
import json,sys
try:
 receipts=[]
 for line in open(sys.argv[1]):
  try:r=json.loads(line)
  except ValueError:continue
  if isinstance(r,dict) and r.get('outcome')=='accepted' and r.get('revision')==2:receipts.append(r)
 if len(receipts)!=1:raise ValueError()
except Exception:sys.exit(1)
PYBASELINE
assert_state "select current_revision=2 from public.operations_project_obligation_heads where obligation_id='68686868-6868-4686-8686-686868686868'"
denial baseline_graph_admin authenticated unknown PT409 displayed_scope_invoice_capture_changed
denial baseline_graph_service service_role unknown 22023 current_scope_invoice_graph_required
psql_run -Atq >"$task_pub_dir/restore_baseline_project.log" 2>&1 <<'SQL'
update public.projects set deleted_at=null where id='64646464-6464-4646-8646-646464646464' and organization_id='11111111-1111-4111-8111-111111111111';
SQL
denial baseline_stale_admin authenticated unknown PT409 displayed_scope_invoice_capture_changed
denial baseline_stale_service service_role unknown 22023 current_scope_invoice_baseline_required
# The real admin captures the new explicit NULL baseline in a separate immutable composition.
psql_run -Atq >"$task_pub_dir/compose_baseline_three.log" 2>&1 <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
create temporary table recompose_request(data jsonb);insert into recompose_request select f.compose_command||jsonb_build_object('expected_composition_revision',2,'baseline_event_ids',jsonb_build_array(b.event_id),'idempotency_key','native-product-compose-three','reason','Actual capture of new explicit unknown baseline') from operations_scope_reader_permission_native.fixture f join public.operations_project_obligation_baselines b on b.obligation_id='68686868-6868-4686-8686-686868686868' and b.revision=2;grant select on recompose_request to authenticated;
set local role authenticated;select public.compose_operations_scope_obligations_v1(data) from recompose_request;reset role;commit;
SQL
assert_state "select current_revision=3 from public.operations_scope_obligation_composition_heads where economic_scope_id='67676767-6767-4676-8676-676767676767'"
refresh_vectors after_baseline

# Genuine same-transaction preview -> enrollment retains packing policy SHARE before scope.
# A queued policy revoke must never force a reader/barrier deadlock or counterfeit busy.
task_try_checkpoint=compound_queue
start_read compound_held authenticated unknown 7 4;reader=$task_read_pid;read_sleep compound_held
start_writer compound_after <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
create temporary table enroll_request(data jsonb);insert into enroll_request select enroll_command||jsonb_build_object('expected_revision',1,'idempotency_key','native-product-compound-scope-two','reason','Actual same transaction preview and enrollment') from operations_scope_reader_permission_native.fixture;grant select,update on enroll_request to authenticated;
set local role authenticated;
update enroll_request set data=data||jsonb_build_object('expected_membership_fingerprint',public.preview_operations_project_scope_v1('packing_project','65656565-6565-4656-8656-656565656565')->'membership_fingerprint');
select public.enroll_operations_project_scope_v1(data) from enroll_request;reset role;commit;
SQL
compound_writer=$task_writer_pid;writer_blocked_by_read compound_after compound_held
start_writer compound_policy_after <<'SQL'
begin;update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';commit;
SQL
policy_writer=$task_writer_pid;writer_blocked_by_writer compound_policy_after compound_after
now=$(monotonic_ns);outcome_deadline=$((now+6000000000))
while [[ ! -s "$task_pub_dir/compound_held_held.json" ]];do
 active=$(owned_live)
 if ! grep -Fx "$reader" <<< "$active" >/dev/null;then break;fi
 now=$(monotonic_ns);[[ $now -lt $outcome_deadline ]] || { echo 'Compound product result observation deadline' >&2;exit 1; };sleep 0.05
done
if [[ -s "$task_pub_dir/compound_held_held.json" ]];then
 task_compound_as_of=1
 held compound_held new_admin_unknown
 read_sleep compound_held;writer_blocked_by_read compound_after compound_held;writer_blocked_by_writer compound_policy_after compound_after
 finish_read "$reader"
else
 status=0;wait_owned "$reader" || status=$?
 [[ $status != 0 ]] || { echo 'Compound busy unexpectedly succeeded without proof' >&2;exit 1; }
 grep -F 'ERROR:  55P03:' "$task_pub_dir/compound_held.log" >/dev/null && grep -F scope_invoice_reader_lock_busy "$task_pub_dir/compound_held.log" >/dev/null || { echo 'Exact compound product busy required' >&2;exit 1; }
fi
wait_owned "$compound_writer";wait_owned "$policy_writer"
python3 - "$task_pub_dir/compound_after.log" 2>>"$task_pub_dir/compound_receipt.log" <<'PYCOMPOUND'
import json,sys
try:
 receipts=[]
 for line in open(sys.argv[1]):
  try:r=json.loads(line)
  except ValueError:continue
  if isinstance(r,dict) and r.get('outcome')=='accepted' and r.get('scope_revision')==2:receipts.append(r)
 if len(receipts)!=1:raise ValueError()
except Exception:sys.exit(1)
PYCOMPOUND
assert_state "select current_revision=2 from public.operations_project_scope_heads where economic_scope_id='67676767-6767-4676-8676-676767676767'"
denial compound_revoked_admin authenticated unknown 42501 scope_packing_missing_or_unenrolled
denial compound_revoked_service service_role unknown 42501 scope_packing_missing_or_unenrolled
psql_run -Atq >"$task_pub_dir/restore_compound_policy.log" 2>&1 <<'SQL'
update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';
SQL
denial compound_stale_admin authenticated unknown PT409 displayed_scope_invoice_capture_changed
denial compound_stale_service service_role unknown 22023 current_scope_invoice_graph_required
psql_run -Atq >"$task_pub_dir/compose_scope_four.log" 2>&1 <<'SQL'
begin;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
create temporary table recompose_request(data jsonb);insert into recompose_request select f.compose_command||jsonb_build_object('expected_scope_revision',2,'expected_composition_revision',3,'expected_membership_fingerprint',s.membership_fingerprint,'baseline_event_ids',jsonb_build_array(b.event_id),'idempotency_key','native-product-compose-four','reason','Actual same graph new scope revision remains unknown') from operations_scope_reader_permission_native.fixture f join public.operations_project_obligation_baselines b on b.obligation_id='68686868-6868-4686-8686-686868686868' and b.revision=2 join public.operations_project_scope_snapshots s on s.economic_scope_id='67676767-6767-4676-8676-676767676767' and s.scope_revision=2;grant select on recompose_request to authenticated;
set local role authenticated;select public.compose_operations_scope_obligations_v1(data) from recompose_request;reset role;commit;
SQL
assert_state "select current_revision=4 from public.operations_scope_obligation_composition_heads where economic_scope_id='67676767-6767-4676-8676-676767676767'"
refresh_vectors after_compound

# First missing V2 counterpart: the actual service receiver protects its source key.
task_try_checkpoint=source_acquired
start_writer source_acquired <<'SQL'
begin;create temporary table source_body(raw text);insert into source_body select raw_coequal_v2 from public.operations_scope_invoice_kernel_native_fixture;grant select on source_body to service_role;
set local role service_role;select public.operations_receive_finance_project_invoice_destination_v2('fixture_scope_kernel_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_product_first_v2_rollback',(select raw from source_body));reset role;select pg_sleep(4);rollback;
SQL
source_writer=$task_writer_pid;writer_sleep source_acquired
denial source_busy service_role known 55P03 scope_invoice_reader_lock_busy
writer_sleep source_acquired
wait_owned "$source_writer"
assert_state "select not exists(select 1 from public.operations_finance_credit_v2_streams) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams)"

# Actual service reader first protects absent V2 until its complete immutable reply is observed.
task_try_checkpoint=source_read_first
start_read source_held service_role known 7;reader=$task_read_pid;read_sleep source_held
start_writer source_after <<'SQL'
begin;create temporary table source_body(raw text);insert into source_body select raw_coequal_v2 from public.operations_scope_invoice_kernel_native_fixture;grant select on source_body to service_role;
set local role service_role;select public.operations_receive_finance_project_invoice_destination_v2('fixture_scope_kernel_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_product_first_v2_commit',(select raw from source_body));reset role;commit;
SQL
source_writer=$task_writer_pid;writer_blocked_by_read source_after source_held
held source_held new_service_known
read_sleep source_held;writer_blocked_by_read source_after source_held
finish_read "$reader";wait_owned "$source_writer"
python3 - "$task_pub_dir/source_after.log" 2>>"$task_pub_dir/source_receipt.log" <<'PYSOURCE'
import json,sys
try:
 receipts=[]
 for line in open(sys.argv[1]):
  try:r=json.loads(line)
  except ValueError:continue
  if isinstance(r,dict) and r.get('outcome')=='accepted':receipts.append(r)
 if len(receipts)!=1:raise ValueError()
except Exception:sys.exit(1)
PYSOURCE
assert_state "select (select count(*)=1 and bool_and(current_revision=1) from public.operations_finance_credit_v2_streams) and (select count(*)=1 from public.operations_finance_credit_v2_snapshots) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams)"
# Re-capture current public replies and unchanged old owner paths after metadata enrichment.
refresh_vectors after_first_v2

[[ $task_read_success == $((4+task_baseline_as_of+task_compound_as_of)) ]] || { echo 'Exact actual read count required' >&2;exit 1; }
assert_state "select (select count(*)=4 from public.operations_project_obligation_heads) and (select count(*)=3 from public.operations_project_obligation_heads where current_revision=1) and (select count(*)=1 from public.operations_project_obligation_heads where current_revision=2 and obligation_id='68686868-6868-4686-8686-686868686868') and (select count(*)=5 from public.operations_project_obligation_baselines) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and (select count(*)=1 and bool_and(current_revision=1) from public.operations_finance_credit_v2_streams) and not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.blocked_controls)"
task_try_checkpoint=terminal
printf 'operations-scope-compatible-read-branches PASS baseline_as_of=%s compound_as_of=%s reads=%s\n' "$task_baseline_as_of" "$task_compound_as_of" "$task_read_success"
printf '%s\n' 'operations-scope-compatible-read-native PASS product_role_packing_project_baseline_compound_source_queues_copied_null_evidence_no_read_writes_authored_matrix'
