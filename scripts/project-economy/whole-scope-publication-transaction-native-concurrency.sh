#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true ]] || { echo 'Disposable CI only' >&2;exit 2; }
[[ ${EVENTFLOW_SCOPE_PUBLICATION_ISOLATED_DB:-} == true ]] || { echo 'Explicit isolated publication fixture required' >&2;exit 2; }
[[ ${PGHOST:-} == 127.0.0.1 || ${PGHOST:-} == localhost ]] || { echo 'Loopback PostgreSQL required' >&2;exit 2; }
[[ -z ${PGHOSTADDR:-} && -z ${PGSERVICE:-} && -z ${PGSERVICEFILE:-} && -z ${PGOPTIONS:-} ]] || { echo 'Libpq overrides forbidden' >&2;exit 2; }
[[ ${PGPORT:-} == 5432 && ${PGUSER:-} == postgres ]] || { echo 'Explicit postgres port5432 required' >&2;exit 2; }
[[ ${PGDATABASE:-} =~ ^eventflow_scope_publication_[a-z0-9_]+$ ]] || { echo 'Dedicated publication database required' >&2;exit 2; }
task_pub_deno=${EVENTFLOW_SCOPE_PUBLICATION_DENO_BIN:-deno}
command -v "$task_pub_deno" >/dev/null && command -v python3 >/dev/null || { echo 'Exact Deno and monotonic observer runtime required' >&2;exit 2; }
task_pub_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
task_pub_dir='' # Ignore inherited paths before the guarded owned mktemp.
export PGCONNECT_TIMEOUT=5
task_pub_options='-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c eventflow.scope_publication_isolated=synthetic-disposable'
psql_run(){ PGOPTIONS="$task_pub_options" psql -X --no-password --set ON_ERROR_STOP=1 --set VERBOSITY=verbose "$@"; }
observe(){ local private_log=/dev/null;if [[ -n $task_pub_dir ]];then private_log="$task_pub_dir/observers.log";fi
 PGCONNECT_TIMEOUT=2 PGOPTIONS='-c statement_timeout=1000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=2000 -c eventflow.scope_publication_isolated=synthetic-disposable' psql -X --no-password --set ON_ERROR_STOP=1 -Atqc "$1" 2>>"$private_log";
}
[[ $(observe "select current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user)
 and current_database() ~ '^eventflow_scope_publication_[a-z0-9_]+$'
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
 and (select count(*)=1 and bool_and(organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='90909090-9090-4909-8909-909090909090' and not enabled and not fault_after_publication and not pause_after_barriers) from operations_scope_publication_native.gates)
 and not exists(select 1 from operations_scope_publication_native.heads)
 and not exists(select 1 from operations_scope_publication_native.publications)
 and not exists(select 1 from operations_scope_publication_native.receipts)
 and not exists(select 1 from operations_scope_publication_native.blocked_controls)
 and not has_schema_privilege('authenticated','operations_scope_publication_native','USAGE')
 and not has_schema_privilege('service_role','operations_scope_publication_native','USAGE')") == t ]] || { echo 'Exact fresh synthetic publication state required' >&2;exit 2; }
task_pub_dir=$(mktemp -d)
declare -A task_pub_pids=()
task_pub_revision=0
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
trap cleanup EXIT
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
 [[ $status != 0 ]] || { echo 'Native denial unexpectedly succeeded' >&2;return 1; }
 grep -F "$code" "$task_pub_dir/$label.log" >/dev/null && grep -F "$message" "$task_pub_dir/$label.log" >/dev/null || { echo 'Native denial mismatch' >&2;return 1; }
}
start_pub(){ local label=$1 hold=$2 expected=${3:-$task_pub_revision}
 PGAPPNAME="native_atomic_pub_$label" psql_run -Atq -f "$task_pub_root/scripts/project-economy/whole-scope-projection-sql-prototype.sql" -f "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-prototype.sql" -c "begin;set local role authenticated;select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"role\":\"authenticated\"}',true);
 select pg_temp.publish_scope_native((read_request-'organization_id')||jsonb_build_object('schema_version','operations-scope-publication-native.v1','expected_publication_revision',$expected,'idempotency_key','native-atomic-publication-$label','reason','Native atomic source publication')) from public.operations_scope_invoice_kernel_native_fixture;
 select pg_sleep($hold);commit;" >"$task_pub_dir/$label.log" 2>&1 &
 task_pub_active_pid=$!;task_pub_pids["$task_pub_active_pid"]=1
}
finish_pub(){ local label=$1 pid=$2;wait_owned "$pid" || { echo 'Native publication transaction failed' >&2;return 1; }
 task_pub_revision=$((task_pub_revision+1));receipt "$label" accepted publication_revision "$task_pub_revision"
 assert_state "select (select publication_revision=$task_pub_revision from operations_scope_publication_native.heads) and (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls)"
}
publish_now(){ start_pub "$1" 0;finish_pub "$1" "$task_pub_active_pid"; }
start_writer(){ local label=$1;cat >"$task_pub_dir/$label.sql"
 PGAPPNAME="native_atomic_writer_$label" psql_run -Atq -f "$task_pub_dir/$label.sql" >"$task_pub_dir/$label.log" 2>&1 &
 task_pub_writer_pid=$!;task_pub_pids["$task_pub_writer_pid"]=1
}
pub_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_atomic_pub_$1' and wait_event='PgSleep')"; }
writer_wait(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_atomic_writer_$1' and wait_event_type='Lock')"; }
writer_sleep(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_atomic_writer_$1' and wait_event='PgSleep')"; }
pub_wait(){ wait_query "select exists(select 1 from pg_stat_activity where application_name='native_atomic_pub_$1' and wait_event_type='Lock')"; }
psql_run -q -c 'update operations_scope_publication_native.gates set enabled=true' >"$task_pub_dir/enroll.log" 2>&1

# Same real CAS, two simultaneous distinct commands, one committed version.
start_pub cas_first 4;first=$task_pub_active_pid;pub_sleep cas_first
start_pub cas_second 0;second=$task_pub_active_pid;pub_wait cas_second
finish_pub cas_first "$first";status=0;wait_owned "$second" || status=$?;denied "$status" cas_second PT409 native_publication_revision_changed
start_pub cas_first 0 0;retry=$task_pub_active_pid;wait_owned "$retry";receipt cas_first replayed publication_revision 1
assert_state 'select count(*)=1 from operations_scope_publication_native.publications'

# Actual policy writer waits behind publisher; then publisher waits behind
# actual policy writer. Parse accepted policy revisions, not merely row counts.
start_pub policy_before 4;reader=$task_pub_active_pid;pub_sleep policy_before
start_writer policy_after <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_obligation_source_policy_v1(policy_command) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;writer_wait policy_after;finish_pub policy_before "$reader";wait_owned "$writer";receipt policy_after accepted policy_revision 2
publish_now policy_captured
start_writer policy_first <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_obligation_source_policy_v1(policy_command||jsonb_build_object('expected_policy_revision',2,'replaces_estimate_minor',360000,'idempotency_key','native-atomic-reverse-policy')) from public.operations_scope_invoice_kernel_native_fixture;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep policy_first;start_pub policy_reverse 0;reader=$task_pub_active_pid;pub_wait policy_reverse;wait_owned "$writer";receipt policy_first accepted policy_revision 3;finish_pub policy_reverse "$reader"

# Actual first absent V2 counterpart cannot be inserted between capture and
# commit. It enriches the same economic source after the publication completes.
assert_state 'select not exists(select 1 from public.operations_finance_credit_v2_streams)'
start_pub counterpart_before 4;reader=$task_pub_active_pid;pub_sleep counterpart_before
start_writer counterpart_after <<'SQL'
begin;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v2('fixture_scope_kernel_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_atomic_first_counterpart',raw_coequal_v2) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;writer_wait counterpart_after;assert_state 'select not exists(select 1 from public.operations_finance_credit_v2_streams)';finish_pub counterpart_before "$reader";wait_owned "$writer";receipt counterpart_after accepted applied_source_revision 1
publish_now counterpart_captured

# Both globally distinct actual invoice keys are held simultaneously.
start_pub sources_before 4;reader=$task_pub_active_pid;pub_sleep sources_before
start_writer source_a <<'SQL'
begin;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_atomic_source_a',raw_source_correction) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer_a=$task_pub_writer_pid;writer_wait source_a
start_writer source_b <<'SQL'
begin;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_atomic_source_b',raw_second_correction) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer_b=$task_pub_writer_pid;writer_wait source_b;assert_state 'select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams'
finish_pub sources_before "$reader";wait_owned "$writer_a";wait_owned "$writer_b";receipt source_a accepted applied_source_revision 2;receipt source_b accepted applied_source_revision 2
publish_now sources_captured
assert_state "select projection->'known_captured_invoice_cost_minor'='null'::jsonb and jsonb_array_length(projection->'excluded_source_anchors')=3 from operations_scope_publication_native.publications where publication_revision=$task_pub_revision"
start_writer source_first <<'SQL'
begin;set local role service_role;
select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_atomic_reverse_source',((raw_source_correction::jsonb)||jsonb_build_object('source_revision',3,'source_publication_fingerprint',repeat('e',64)))::text) from public.operations_scope_invoice_kernel_native_fixture;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep source_first;start_pub source_reverse 0;reader=$task_pub_active_pid;pub_wait source_reverse;wait_owned "$writer";receipt source_first accepted applied_source_revision 3;finish_pub source_reverse "$reader"

# Baseline correction invalidates saved composition rather than reusing money.
start_pub baseline_before 4;reader=$task_pub_active_pid;pub_sleep baseline_before
start_writer baseline_after <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_manual_obligation_baseline_v1(baseline_command) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;writer_wait baseline_after;finish_pub baseline_before "$reader";wait_owned "$writer";receipt baseline_after accepted revision 2
start_pub baseline_stale 0;status=0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" baseline_stale PT409 native_publication_source_changed

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
recompose

# Legacy edge writer bypasses the canonical barrier and commits while the
# publication is alive. Actual scope reenrollment waits on that barrier.
start_pub graph_before 4;reader=$task_pub_active_pid;pub_sleep graph_before
psql_run -Atq -c "update public.large_project_bookings set id='34343434-3434-4343-8343-343434343434' where id='ffffffff-ffff-4fff-8fff-ffffffffffff' returning id" >"$task_pub_dir/legacy_graph.log" 2>&1
assert_state "select exists(select 1 from public.large_project_bookings where id='34343434-3434-4343-8343-343434343434') and exists(select 1 from pg_stat_activity where application_name='native_atomic_pub_graph_before' and wait_event='PgSleep')"
start_writer graph_enroll <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(enroll_command||jsonb_build_object('expected_revision',1,'expected_membership_fingerprint',public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc')->'membership_fingerprint','idempotency_key','native-atomic-reenroll')) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
writer=$task_pub_writer_pid;writer_wait graph_enroll;finish_pub graph_before "$reader";wait_owned "$writer";receipt graph_enroll accepted scope_revision 2
start_pub graph_stale 0;status=0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" graph_stale PT409 native_publication_source_changed
recompose;publish_now graph_captured

# Reverse canonical enrollment and baseline orders are independent barriers.
start_writer graph_first <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.enroll_operations_project_scope_v1(enroll_command||jsonb_build_object('expected_revision',2,'expected_membership_fingerprint',public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc')->'membership_fingerprint','idempotency_key','native-atomic-reverse-enroll')) from public.operations_scope_invoice_kernel_native_fixture;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep graph_first;start_pub graph_reverse 0;reader=$task_pub_active_pid;pub_wait graph_reverse;wait_owned "$writer";receipt graph_first accepted scope_revision 3
status=0;wait_owned "$reader" || status=$?;denied "$status" graph_reverse PT409 native_publication_source_changed;recompose;publish_now graph_reverse_captured
start_writer baseline_first <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_manual_obligation_baseline_v1(baseline_command||jsonb_build_object('expected_revision',2,'estimate_minor',1200000,'idempotency_key','native-atomic-reverse-baseline')) from public.operations_scope_invoice_kernel_native_fixture;select pg_sleep(4);commit;
SQL
writer=$task_pub_writer_pid;writer_sleep baseline_first;start_pub baseline_reverse 0;reader=$task_pub_active_pid;pub_wait baseline_reverse;wait_owned "$writer";receipt baseline_first accepted revision 3
status=0;wait_owned "$reader" || status=$?;denied "$status" baseline_reverse PT409 native_publication_source_changed;recompose;publish_now baseline_reverse_captured

# Actual live authority controls, both transaction orders. Soft deletion is the
# live member-project revocation; subordinate review grants never elevate it.
for authority in admin gate project;do
 start_pub "${authority}_before" 4;reader=$task_pub_active_pid;pub_sleep "${authority}_before"
 case $authority in
 admin) statement="delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='admin'";code=42501;message=organization_scope_admin_required;restore="insert into public.user_roles select (jsonb_populate_record(null::public.user_roles,admin_role)).* from operations_scope_publication_native.controls";;
 gate) statement='update operations_scope_publication_native.gates set enabled=false';code=42501;message=native_publication_gate_disabled;restore='update operations_scope_publication_native.gates set enabled=true';;
 project) statement="update public.projects set deleted_at=now() where id='55555555-5555-4555-8555-555555555555'";code=42501;message=obligation_project_access_denied;restore="update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555'";;
 esac
 start_writer "${authority}_after" <<SQL
begin;$statement;commit;
SQL
 writer=$task_pub_writer_pid;writer_wait "${authority}_after";finish_pub "${authority}_before" "$reader";wait_owned "$writer"
 start_pub "${authority}_denied" 0;status=0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" "${authority}_denied" "$code" "$message"
 psql_run -q -c "$restore" >"$task_pub_dir/${authority}_restore.log" 2>&1
 start_writer "${authority}_first" <<SQL
begin;$statement;select pg_sleep(4);commit;
SQL
 writer=$task_pub_writer_pid;writer_sleep "${authority}_first";start_pub "${authority}_reverse" 0;reader=$task_pub_active_pid;pub_wait "${authority}_reverse";wait_owned "$writer"
 status=0;wait_owned "$reader" || status=$?
 denied "$status" "${authority}_reverse" "$code" "$message"
 psql_run -q -c "$restore" >"$task_pub_dir/${authority}_reverse_restore.log" 2>&1
 assert_state "select publication_revision=$task_pub_revision from operations_scope_publication_native.heads"
done

# Three-session queued-writer regression. The publisher pauses INSIDE its
# function after all sorted project SHARE locks and org/scope barriers, before
# the unchanged reader's reentrant project checks and before any saved row.
psql_run -q -c 'update operations_scope_publication_native.gates set pause_after_barriers=true' >"$task_pub_dir/queued_pause.log" 2>&1
start_pub queued_project 0;reader=$task_pub_active_pid;pub_sleep queued_project
assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='native_atomic_pub_queued_project' and l.locktype='advisory' and l.granted)"
start_writer queued_baseline <<'SQL'
begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select public.append_operations_manual_obligation_baseline_v1(baseline_command||jsonb_build_object('expected_revision',3,'estimate_minor',1300000,'idempotency_key','native-atomic-queued-baseline')) from public.operations_scope_invoice_kernel_native_fixture;commit;
SQL
baseline=$task_pub_writer_pid;writer_wait queued_baseline
wait_query "select exists(select 1 from pg_stat_activity b join pg_stat_activity p on p.application_name='native_atomic_pub_queued_project' where b.application_name='native_atomic_writer_queued_baseline' and b.wait_event='advisory' and p.pid=any(pg_blocking_pids(b.pid)))"
start_writer queued_project_delete <<'SQL'
begin;update public.projects set deleted_at=now() where id='55555555-5555-4555-8555-555555555555';commit;
SQL
updater=$task_pub_writer_pid;writer_wait queued_project_delete
wait_query "select exists(select 1 from pg_stat_activity u join pg_stat_activity p on p.application_name='native_atomic_pub_queued_project' join pg_stat_activity b on b.application_name='native_atomic_writer_queued_baseline' where u.application_name='native_atomic_writer_queued_project_delete' and u.wait_event_type='Lock' and p.wait_event='PgSleep' and b.wait_event='advisory' and p.pid=any(pg_blocking_pids(b.pid)) and (p.pid=any(pg_blocking_pids(u.pid)) or b.pid=any(pg_blocking_pids(u.pid))))"
finish_pub queued_project "$reader";wait_owned "$baseline";receipt queued_baseline accepted revision 4;wait_owned "$updater"
assert_state "select exists(select 1 from public.projects where id='55555555-5555-4555-8555-555555555555' and deleted_at is not null) and exists(select 1 from public.operations_project_obligation_heads where current_revision=4)"
start_pub queued_project_denied 0;status=0;wait_owned "$task_pub_active_pid" || status=$?;denied "$status" queued_project_denied 42501 obligation_project_access_denied
psql_run -q -c "begin;update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555';update operations_scope_publication_native.gates set pause_after_barriers=false;commit" >"$task_pub_dir/queued_restore.log" 2>&1
recompose
assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select current_revision=6 from public.operations_scope_obligation_composition_heads) and (select count(*)=1 and bool_and(not pause_after_barriers) from operations_scope_publication_native.gates)"

[[ $task_pub_revision == 18 ]] || { echo 'Exact native publication count required' >&2;exit 1; }

# Every immutable saved SQL input/result, including excluded/unknown sources,
# is compared to the frozen strict TypeScript adapter and complete projection.
observe "select jsonb_agg(jsonb_build_object('label','native_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint) order by publication_revision)::text from operations_scope_publication_native.publications" >"$task_pub_dir/vectors.json"
"$task_pub_deno" run --allow-read="$task_pub_dir/vectors.json" "$task_pub_root/scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts" "$task_pub_dir/vectors.json" >"$task_pub_dir/vector_result.log" 2>&1 || { echo 'Native saved publication vector verification failed' >&2;exit 1; }
grep -Fx "whole-scope-publication-transaction-vectors PASS $task_pub_revision actual_saved_sql_to_unchanged_kernel" "$task_pub_dir/vector_result.log"
assert_state "select (select count(*)=$task_pub_revision from operations_scope_publication_native.publications) and (select count(*)=$task_pub_revision from operations_scope_publication_native.receipts) and (select count(*)=$task_pub_revision and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls) and (select count(*)=1 and bool_and(publication_revision=$task_pub_revision) from operations_scope_publication_native.heads) and (select count(*)=2 and bool_and(current_revision=case when invoice_id='23232323-2323-4232-8232-232323232323' then 3 else 2 end) from public.operations_finance_invoice_streams) and (select count(*)=1 and bool_and(current_revision=1) from public.operations_finance_credit_v2_streams) and (select count(*)=1 and bool_and(current_revision=3) from public.operations_project_scope_heads) and (select count(*)=1 and bool_and(current_revision=6) from public.operations_scope_obligation_composition_heads)"
echo 'whole-scope-publication-transaction-native PASS same_transaction_saved_kernel_atomic_history_actual_source_authority_waits_as_of_graph_blocked_delivery'
