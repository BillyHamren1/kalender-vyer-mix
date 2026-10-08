#!/usr/bin/env bash
set -euo pipefail
umask 077
# Dedicated disposable CI ONLY; no hosted endpoint or alias product writes.
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2;exit 2; }
[[ ${EVENTFLOW_SCOPE_ALIAS_ISOLATED_DB:-} == true ]] || { echo 'Explicit alias isolated database required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Loopback PostgreSQL required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq overrides forbidden' >&2;exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Explicit postgres port5432 required' >&2;exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_scope_alias_[a-z0-9_]+$ ]] || { echo 'Dedicated eventflow_scope_alias_ database required' >&2;exit 2; }
task_alias_deno=${EVENTFLOW_SCOPE_ALIAS_DENO_BIN:-deno}
command -v "$task_alias_deno" >/dev/null || { echo 'Deno required for unchanged alias validator' >&2;exit 2; }
export PGCONNECT_TIMEOUT=5
task_alias_psql_options='-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_alias_isolated=synthetic-disposable'
task_alias_dir='' # Never use an inherited path for the pre-mktemp guard stderr.
# Every call site redirects BOTH streams to its owned phase log, preserving
# expected SQLSTATE diagnostics for the strict per-case denial assertions.
psql_run(){ PGOPTIONS="$task_alias_psql_options" psql -X --no-password --set ON_ERROR_STOP=1 "$@"; }
observe(){ local error_log=/dev/null;if [[ -n ${task_alias_dir:-} ]];then error_log="$task_alias_dir/observers.log";fi
 PGCONNECT_TIMEOUT=2 PGOPTIONS='-c statement_timeout=1000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=2000 -c eventflow.scope_alias_isolated=synthetic-disposable' psql -X --no-password --set ON_ERROR_STOP=1 -Atqc "$1" 2>>"$error_log";
}
# First database access is bounded and READ ONLY. Reject unrelated or dirty seed.
[[ $(observe "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user)
 and current_database() ~ '^eventflow_scope_alias_[a-z0-9_]+$'
 and (select count(*)=4 from auth.users) and (select count(*)=4 from public.profiles) and (select count(*)=3 from public.user_roles)
 and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.role='admin')
 and (select count(*)=3 and bool_and(deleted_at is null and (id,organization_id) in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid))) from public.projects)
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='90909090-9090-4909-8909-909090909090' and root_kind='large_project' and root_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and current_revision=1) from public.operations_project_scope_heads)
 and (select count(*)=1 from public.operations_project_scope_snapshots) and (select count(*)=4 from public.operations_project_scope_member_ownership)
 and (select count(*)=1 and bool_and(decision='granted' and system_user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and project_id='55555555-5555-4555-8555-555555555555') from public.operations_project_personnel_review_grants)
 and (select count(*)=1 and bool_and(enabled and organization_id='11111111-1111-4111-8111-111111111111' and status='delivered') from public.operations_project_scope_packing_policies)
 and (select count(*)=1 and bool_and(slot='only' and canonical_scope_id='90909090-9090-4909-8909-909090909090' and project_view_id='55555555-5555-4555-8555-555555555555' and packing_view_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') from operations_scope_alias_native.controls)
 and (select count(*)=2 from public.bookings) and (select count(*)=2 from public.large_project_bookings)
 and not exists(select 1 from public.operations_personnel_cost_streams) and not exists(select 1 from public.operations_personnel_cost_publications)
 and not has_schema_privilege('anon','operations_scope_alias_native','USAGE') and not has_function_privilege('service_role','operations_scope_alias_native.capture(text,uuid)','EXECUTE')") == t ]] || { echo 'Exact fresh synthetic alias state required' >&2;exit 2; }
task_alias_dir=$(mktemp -d)
declare -A task_alias_pids=()
wait_owned(){ local pid=$1 result=0;wait "$pid" || result=$?;unset 'task_alias_pids[$pid]';return "$result"; }
owned_live(){ local pid job live;live=$(jobs -rp;jobs -sp);for pid in "${!task_alias_pids[@]}";do while read -r job;do [[ $job == "$pid" ]] && printf '%s\n' "$pid";done <<< "$live";done;return 0; }
cleanup(){
 local pid pending round;pending=$(owned_live)
 while read -r pid;do if [[ -n $pid ]];then kill -CONT "$pid" 2>/dev/null || true;kill -TERM "$pid" 2>/dev/null || true;fi;done <<< "$pending"
 for ((round=0;round<40;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 while read -r pid;do [[ -n $pid ]] && kill -KILL "$pid" 2>/dev/null || true;done <<< "$pending"
 for ((round=0;round<20;round++));do pending=$(owned_live);[[ -z $pending ]] && break;sleep 0.05;done
 if [[ -n $pending ]];then echo 'Owned alias child failed bounded termination; private logs retained' >&2;exit 1;fi
 for pid in "${!task_alias_pids[@]}";do wait "$pid" 2>/dev/null || true;done;rm -rf "$task_alias_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
monotonic_ns(){ python3 -c 'import time;print(time.monotonic_ns())' 2>>"$task_alias_dir/observers.log"; }
wait_query(){ local result now deadline;now=$(monotonic_ns);deadline=$((now+3000000000))
 while :;do
  now=$(monotonic_ns);[[ $now -lt $deadline ]] || break
  result=$(observe "$1") || { echo 'Alias native observer failed' >&2;return 1; }
  now=$(monotonic_ns);[[ $now -lt $deadline ]] || break
  [[ $result == t ]] && return 0;sleep 0.05
 done
 echo 'Alias native observation deadline' >&2;return 1;
}
capture(){ local label=$1 kind=$2 id=$3;psql_run -Atq >"$task_alias_dir/$label.log" 2>&1 <<SQL
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select operations_scope_alias_native.capture('$kind','$id');rollback;
SQL
}
start_reader(){ local label=$1 kind=$2 id=$3;
 PGOPTIONS="$task_alias_psql_options" PGAPPNAME="eventflow_alias_reader_$label" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_alias_dir/$label.log" 2>&1 <<SQL &
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select operations_scope_alias_native.capture('$kind','$id');select pg_sleep(5);commit;
SQL
 task_alias_reader_pid=$!;task_alias_pids["$task_alias_reader_pid"]=1
 wait_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_alias_reader_$label' and wait_event='PgSleep')"
}
deny(){ local label=$1 actor=$2 kind=$3 id=$4 state=$5 message=$6 result=0 claims='{"role":"authenticated"}';
 if [[ -n $actor ]];then claims='{"sub":"'"$actor"'","role":"authenticated"}';fi
 psql_run --set VERBOSITY=verbose -Atq >"$task_alias_dir/$label.log" 2>&1 <<SQL || result=$?
begin;set local role authenticated;
select set_config('request.jwt.claims','$claims',true);
select operations_scope_alias_native.capture('$kind','$id');rollback;
SQL
 [[ $result != 0 ]] || { echo "Denied alias case succeeded: $label" >&2;exit 1; }
 grep -Fq "$state: $message" "$task_alias_dir/$label.log"
}
reenroll(){ local label=$1 expected=$2;
 psql_run -Atq >"$task_alias_dir/$label.log" 2>&1 <<SQL
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do \$\$declare preview jsonb;receipt jsonb;begin
preview:=public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
receipt:=public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','90909090-9090-4909-8909-909090909090','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_revision',$expected,'expected_membership_fingerprint',preview->'membership_fingerprint','idempotency_key','native-alias-$label','reason','Explicit genuine canonical membership refresh after legacy writer'));
if receipt->>'outcome'<>'accepted' or (receipt->>'scope_revision')::bigint<>$expected+1 then raise exception 'Real canonical refresh receipt required';end if;
end;\$\$;commit;
SQL
}
capture initial_project project 55555555-5555-4555-8555-555555555555
capture initial_packing packing_project eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee
deny project_grant_denied bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb project 55555555-5555-4555-8555-555555555555 42501 organization_scope_admin_required
deny foreign_admin_denied cccccccc-cccc-4ccc-8ccc-cccccccccccc project 55555555-5555-4555-8555-555555555555 42501 native_scope_canonical_head_required
deny missing_actor_denied '' project 55555555-5555-4555-8555-555555555555 42501 authenticated_scope_admin_required
deny foreign_root_denied aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa project eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee 42501 native_scope_view_root_denied
# Reader owns real canonical barrier, but a legacy source-join update bypasses it.
start_reader before_legacy_writer project 55555555-5555-4555-8555-555555555555
PGOPTIONS="$task_alias_psql_options" PGAPPNAME=eventflow_alias_legacy_writer psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_alias_dir/legacy_writer.log" 2>&1 <<'SQL' &
begin;
with changed as(update public.large_project_bookings set id='34343434-3434-4343-8343-343434343434' where id='ffffffff-ffff-4fff-8fff-ffffffffffff' returning id)
select jsonb_build_object('mutation','legacy_join_identity','rows',count(*)) from changed;commit;
SQL
writer_pid=$!;task_alias_pids["$writer_pid"]=1;wait_owned "$writer_pid"
[[ $(observe "select exists(select 1 from pg_stat_activity where application_name='eventflow_alias_reader_before_legacy_writer' and wait_event='PgSleep') and exists(select 1 from public.large_project_bookings where id='34343434-3434-4343-8343-343434343434')") == t ]] || { echo 'Legacy writer did not commit while original capture remained open' >&2;exit 1; }
wait_owned "$task_alias_reader_pid"
capture after_legacy_writer project 55555555-5555-4555-8555-555555555555
reenroll first_refresh 1
capture after_reenroll project 55555555-5555-4555-8555-555555555555
# Live packing policy and actual admin role are protected by their row SHARE locks.
for kind in policy admin;do
 if [[ $kind == policy ]];then start_reader policy_before packing_project eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee;sql="update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='delivered' returning jsonb_build_object('mutation','policy_revoked','enabled',enabled)";
 else start_reader admin_before project 55555555-5555-4555-8555-555555555555;sql="delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin' returning jsonb_build_object('mutation','admin_revoked','actor',user_id)";fi
 PGOPTIONS="$task_alias_psql_options" PGAPPNAME="eventflow_alias_revoke_$kind" psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_alias_dir/revoke_$kind.log" 2>&1 <<SQL &
begin;$sql;commit;
SQL
 writer_pid=$!;task_alias_pids["$writer_pid"]=1
 wait_query "select exists(select 1 from pg_stat_activity where application_name='eventflow_alias_revoke_$kind' and wait_event_type='Lock')"
 if [[ $kind == policy ]];then [[ $(observe "select enabled from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status='delivered'") == t ]];
 else [[ $(observe "select exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='admin')") == t ]];fi
 wait_owned "$task_alias_reader_pid";wait_owned "$writer_pid"
 if [[ $kind == policy ]];then
  deny revoked_policy aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa packing_project eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee 42501 native_scope_view_policy_denied
  psql_run -Atqc "update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='delivered'" >"$task_alias_dir/restore_policy.log" 2>&1
  capture policy_restored packing_project eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee
 else
  deny revoked_admin aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa project 55555555-5555-4555-8555-555555555555 42501 organization_scope_admin_required
  psql_run -Atqc "insert into public.user_roles(user_id,organization_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin')" >"$task_alias_dir/restore_admin.log" 2>&1
  capture admin_restored project 55555555-5555-4555-8555-555555555555
 fi
done
# A genuine absent member insert also commits without the canonical barrier.
start_reader legacy_insert_before project 55555555-5555-4555-8555-555555555555
PGOPTIONS="$task_alias_psql_options" PGAPPNAME=eventflow_alias_legacy_insert psql -X --no-password --set ON_ERROR_STOP=1 -Atq >"$task_alias_dir/legacy_insert.log" 2>&1 <<'SQL' &
begin;
insert into public.bookings values('Alias--Order-100','11111111-1111-4111-8111-111111111111',null);
insert into public.projects(id,organization_id,deleted_at,booking_id) values('36363636-3636-4363-8363-363636363636','11111111-1111-4111-8111-111111111111',null,'Alias--Order-100');
insert into public.large_project_bookings values('37373737-3737-4373-8373-373737373737','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Alias--Order-100');
select jsonb_build_object('mutation','legacy_new_member','project_id','36363636-3636-4363-8363-363636363636');commit;
SQL
writer_pid=$!;task_alias_pids["$writer_pid"]=1;wait_owned "$writer_pid"
[[ $(observe "select exists(select 1 from pg_stat_activity where application_name='eventflow_alias_reader_legacy_insert_before' and wait_event='PgSleep') and exists(select 1 from public.projects where id='36363636-3636-4363-8363-363636363636')") == t ]] || { echo 'Legacy insert did not commit during original capture' >&2;exit 1; }
wait_owned "$task_alias_reader_pid"
capture legacy_insert_after project 55555555-5555-4555-8555-555555555555
reenroll second_refresh 2
capture after_second_reenroll project 55555555-5555-4555-8555-555555555555
# Existing canonical view-root reservation conflicts even with compatible graphs.
# This adversarial valid zero-revision head is fixture-only and rolls back on denial.
result=0
psql_run --set VERBOSITY=verbose -Atq >"$task_alias_dir/view_root_conflict.log" 2>&1 <<'SQL' || result=$?
begin;
insert into public.operations_project_scope_heads(organization_id,economic_scope_id,root_kind,root_id) values('11111111-1111-4111-8111-111111111111','38383838-3838-4383-8383-383838383838','packing_project','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select operations_scope_alias_native.capture('packing_project','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');rollback;
SQL
[[ $result != 0 ]] || { echo 'Canonical view root conflict accepted' >&2;exit 1; }
grep -Fq '23505: native_view_canonical_scope_conflict' "$task_alias_dir/view_root_conflict.log"
[[ $(observe "select (select count(*)=1 and bool_and(current_revision=3) from public.operations_project_scope_heads)
 and (select count(*)=3 and count(distinct membership_fingerprint)=3 and bool_and(actor_system_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and integration_state='membership_only' and shadow_only) from public.operations_project_scope_snapshots)
 and (select count(*)=6 and count(*) filter(where first_scope_revision=1)=4 and count(*) filter(where first_scope_revision=3)=2 from public.operations_project_scope_member_ownership)
 and (select count(*)=1 from public.operations_project_personnel_review_grants)
 and not exists(select 1 from public.operations_personnel_cost_streams) and not exists(select 1 from public.operations_personnel_cost_publications)") == t ]] || { echo 'Immutable source membership history/ownership proof failed' >&2;exit 1; }
python3 - "$task_alias_dir" >"$task_alias_dir/vector-preparation.log" 2>&1 <<'PY' || { echo 'Alias native capture preparation failed' >&2;exit 1; }
import json,pathlib,sys
directory=pathlib.Path(sys.argv[1]);labels=['initial_project','initial_packing','before_legacy_writer','after_legacy_writer','after_reenroll','policy_before','policy_restored','admin_before','admin_restored','legacy_insert_before','legacy_insert_after','after_second_reenroll'];vectors=[]
for label in labels:
 captures=[]
 for line in (directory/(label+'.log')).read_text().splitlines():
  try:value=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(value,dict) and value.get('schema_version')=='operations-scope-alias-native-capture.v1':captures.append(value)
 assert len(captures)==1,(label,len(captures));vectors.append({'label':label,'capture':captures[0]})
for label,expected in [('legacy_writer',{'mutation':'legacy_join_identity','rows':1}),('revoke_policy',{'mutation':'policy_revoked','enabled':False}),('revoke_admin',{'mutation':'admin_revoked','actor':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),('legacy_insert',{'mutation':'legacy_new_member','project_id':'36363636-3636-4363-8363-363636363636'})]:
 actual=[]
 for line in (directory/(label+'.log')).read_text().splitlines():
  try:value=json.loads(line)
  except json.JSONDecodeError:continue
  if isinstance(value,dict) and 'mutation' in value:actual.append(value)
 assert actual==[expected],(label,actual)
(directory/'vectors.json').write_text(json.dumps(vectors,ensure_ascii=False))
PY
task_alias_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
"$task_alias_deno" run --allow-read "$task_alias_script_dir/operations-scope-view-alias-native-vector-test.ts" "$task_alias_dir/vectors.json" >"$task_alias_dir/validator.log" 2>&1 || { echo 'Alias native captured evidence validation failed' >&2;exit 1; }
grep -Fxq 'operations-scope-view-alias-native-vectors PASS 12' "$task_alias_dir/validator.log" || { echo 'Alias native exact vector proof marker absent' >&2;exit 1; }
echo 'operations-scope-view-alias-native-vectors PASS 12'
echo 'operations-scope-view-alias-native PASS coherent_as_of_capture_live_authorization_legacy_writer_currentness_no_alias_authority'
