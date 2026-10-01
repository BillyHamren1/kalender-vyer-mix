\set ON_ERROR_STOP on
begin;
create temporary table synthetic_operations_fixture (data jsonb not null);
insert into synthetic_operations_fixture values (:'fixture'::jsonb);

create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'assertion failed: %',label; end if; end; $$;
create function pg_temp.assert_rejected(body jsonb, raw_snapshot jsonb, expected bigint, label text)
returns void language plpgsql as $$
begin
  begin
    perform public.publish_operations_personnel_cost_v1(body,raw_snapshot,expected,'synthetic-invalid-'||label);
  exception when sqlstate '22023' or sqlstate '22P02' or sqlstate '23505' or sqlstate '22008' then return; end;
  raise exception 'invalid payload accepted: %',label;
end; $$;

do $$
declare
 f jsonb; receipt jsonb; body jsonb; malformed jsonb; line jsonb;
begin
 select data into strict f from synthetic_operations_fixture;
 execute 'set local role service_role';
 receipt:=public.publish_operations_personnel_cost_v1(f->'initial',f->'raw',0,'synthetic-initial-key');
 execute 'reset role';
 perform pg_temp.assert_true(receipt->>'status'='accepted','initial accepted');
 perform pg_temp.assert_true((select cost_snapshot#>>'{lines,0,amount_minor}'='60000'
   from public.operations_personnel_cost_current),'120min x 300SEK equals 600SEK');
 receipt:=public.publish_operations_personnel_cost_v1(f->'initial',f->'raw',0,'synthetic-initial-key');
 perform pg_temp.assert_true(receipt->>'status'='duplicate','exact duplicate');
 perform pg_temp.assert_true((select count(*)=1 from public.operations_personnel_cost_publications),'retry did not append');
 receipt:=public.publish_operations_personnel_cost_v1(f->'confirmed',f->'raw',1,'synthetic-review-key');
 perform pg_temp.assert_true(receipt->>'status'='accepted','review accepted');
 perform pg_temp.assert_true((select cost_snapshot#>>'{lines,0,status}'='confirmed'
   and cost_snapshot#>>'{lines,0,amount_minor}'='60000' from public.operations_personnel_cost_current),'review same saved cost');

 -- Malformed envelopes fail before CAS stale handling, even after head advanced.
 body:=f->'initial'; line:=body#>'{lines,0}';
 perform pg_temp.assert_rejected(body||'{"extra":true}',f->'raw',0,'extra-envelope');
 begin
   perform public.publish_operations_personnel_cost_v1(jsonb_set(body,'{lines,0,amount_minor}','99999'),
     f->'raw',0,'synthetic-initial-key');
   raise exception 'changed exact-key retry was accepted';
 exception when sqlstate '23505' then null; end;
 perform pg_temp.assert_rejected(body-'worker_id',f->'raw',0,'missing-envelope');
 perform pg_temp.assert_rejected(jsonb_set(body,'{source_revision}','"1"'),f->'raw',0,'string-revision');
 perform pg_temp.assert_rejected(jsonb_set(body,'{time_snapshot_version}','1.5'),f->'raw',0,'fraction-version');
 perform pg_temp.assert_rejected(jsonb_set(body,'{source_time_report_id}','"not-uuid"'),f->'raw',0,'report-uuid');
 perform pg_temp.assert_rejected(jsonb_set(body,'{worker_id}','"not-uuid"'),f->'raw',0,'worker-uuid');
 perform pg_temp.assert_rejected(jsonb_set(body,'{work_date}','"2026-02-30"'),f->'raw',0,'invalid-date');
 perform pg_temp.assert_rejected(jsonb_set(body,'{source_time_stream_id}',to_jsonb(repeat('x',257))),f->'raw',0,'long-stream');
 perform pg_temp.assert_rejected(jsonb_set(body,'{source_time_stream_id}',to_jsonb(' '||(body->>'source_time_stream_id'))),f->'raw',0,'space-stream');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0}',line||'{"extra":true}'),f->'raw',0,'extra-line');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0}',line-'source_booking_id'),f->'raw',0,'missing-line');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,minutes}','"120"'),f->'raw',0,'string-minutes');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,minutes}','1.5'),f->'raw',0,'fraction-minutes');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,amount_minor}','"60000"'),f->'raw',0,'string-amount');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,hourly_rate_minor}','"30000"'),f->'raw',0,'string-rate');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,source_project_id}','"invalid"'),f->'raw',0,'project-uuid');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,source_booking_id}','"invalid"'),f->'raw',0,'booking-uuid');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,status}','null'),f->'raw',0,'null-status');
 perform pg_temp.assert_rejected(jsonb_set(body,'{lines,0,coverage}','"missing_rate"'),f->'raw',0,'missing-rate-nonnull');
 perform pg_temp.assert_rejected(body,jsonb_set(f->'raw','{version}','"1"'),0,'raw-string-version');
 perform pg_temp.assert_rejected(body,jsonb_set(f->'raw','{version}','1.5'),0,'raw-fraction-version');
 perform pg_temp.assert_rejected(body,jsonb_set(f->'raw','{workDate}','"today"'),0,'raw-date-keyword');
 perform pg_temp.assert_rejected(jsonb_set(f->'confirmed','{source_revision}','3')||
   jsonb_build_object('lines',jsonb_build_array(line||'{"amount_minor":99999}')),f->'raw',2,'review-recalculation');

 receipt:=public.publish_operations_personnel_cost_v1(f->'corrected',f->'rawCorrection',2,'synthetic-correction-key');
 perform pg_temp.assert_true(receipt->>'status'='accepted','correction accepted');
 perform pg_temp.assert_true((select cost_snapshot#>>'{lines,0,amount_minor}'='45000'
   from public.operations_personnel_cost_current),'correction replaces 600 with 450');
 receipt:=public.publish_operations_personnel_cost_v1(f->'initial',f->'raw',0,'synthetic-old-delivery');
 perform pg_temp.assert_true(receipt->>'status'='stale','stale CAS cannot overwrite');
 receipt:=public.publish_operations_personnel_cost_v1(jsonb_set(f->'confirmed','{source_revision}','4'),f->'raw',3,'synthetic-stale-time');
 perform pg_temp.assert_true(receipt->>'status'='stale_time_snapshot','old Time cannot advance');
 receipt:=public.publish_operations_personnel_cost_v1(f->'empty',f->'rawEmpty',3,'synthetic-empty-key');
 perform pg_temp.assert_true(receipt->>'status'='accepted','empty correction accepted');
 perform pg_temp.assert_true((select cost_snapshot->'lines'='[]'::jsonb from public.operations_personnel_cost_current),'empty reverses all prior costs');
 perform pg_temp.assert_true((select count(*)=4 from public.operations_personnel_cost_publications),'history retained');

 begin update public.operations_personnel_cost_publications set idempotency_key='changed';
   raise exception 'immutable update allowed'; exception when sqlstate '55000' then null; end;
 begin delete from public.operations_personnel_cost_publications;
   raise exception 'immutable delete allowed'; exception when sqlstate '55000' then null; end;
 begin truncate public.operations_personnel_cost_publications;
   raise exception 'immutable truncate allowed'; exception when sqlstate '55000' then null; end;
 begin truncate public.operations_personnel_rate_history;
   raise exception 'immutable rate truncate allowed'; exception when sqlstate '55000' then null; end;
 perform pg_temp.assert_true(not has_function_privilege('anon','public.publish_operations_personnel_cost_v1(jsonb,jsonb,bigint,text)','execute'),'anon RPC denied');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.publish_operations_personnel_cost_v1(jsonb,jsonb,bigint,text)','execute'),'authenticated RPC denied');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','public.operations_personnel_cost_current','select'),'sensitive current denied');
 begin
   execute 'set local role authenticated';
   perform public.publish_operations_personnel_cost_v1(f->'initial',f->'raw',0,'unauthorized-synthetic-key');
   raise exception 'authenticated direct RPC allowed';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 begin
   execute 'set local role anon';
   perform count(*) from public.operations_personnel_cost_current;
   raise exception 'anon sensitive read allowed';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 perform pg_temp.assert_true(has_function_privilege('service_role','public.publish_operations_personnel_cost_v1(jsonb,jsonb,bigint,text)','execute'),'service RPC allowed');
 perform pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in
   ('public.operations_personnel_cost_streams'::regclass,'public.operations_personnel_cost_publications'::regclass,
    'public.operations_personnel_rate_history'::regclass)),'RLS all tables');
end; $$;
rollback;
\echo 'Operations personnel PostgreSQL synthetic runtime checks passed'
