\set ON_ERROR_STOP on
-- TEST ONLY. Root supplies actual calculator JSON via :'personnel_fixture'.
-- Run after the original genuine mounted bootstrap in a separate fresh native job.
-- Never a migration, hosted operation, arbitrary source payload or browser writer.
begin;
set local statement_timeout='8s';
set local lock_timeout='1s';
do $$begin
 if current_database()<>'eventflow_project_evidence_http_runtime'
 or current_setting('test.project_evidence_fixture',true) is distinct from 'true'
 then raise exception 'exact_disposable_personnel_browser_required' using errcode='42501';end if;
 if not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000001017' and organization_id='00000000-0000-4000-8000-000000000001' and booking_id is null and deleted_at is null and name='Isolerad ekonomiverifiering')
 or not exists(select 1 from public.project_purchases where id='00000000-0000-4000-8000-000000001030' and project_id='00000000-0000-4000-8000-000000001017' and amount=700 and approved)
 or not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='00000000-0000-4000-8000-000000000199' and p.organization_id='00000000-0000-4000-8000-000000000001' and r.role='admin')
 or not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='00000000-0000-4000-8000-000000000292' and p.organization_id='00000000-0000-4000-8000-000000000001' and r.role='projekt')
 then raise exception 'genuine_ui_fixture_and_live_authority_required' using errcode='55000';end if;
 if exists(select 1 from public.operations_personnel_cost_streams where organization_id='00000000-0000-4000-8000-000000000001' and worker_id in('00000000-0000-4000-8000-000000007001','00000000-0000-4000-8000-000000007002'))
 or exists(select 1 from public.operations_project_personnel_review_grants where organization_id='00000000-0000-4000-8000-000000000001' and project_id='00000000-0000-4000-8000-000000001017' and system_user_id='00000000-0000-4000-8000-000000000292')
 then raise exception 'fresh_personnel_stream_and_grant_required' using errcode='55000';end if;
end;$$;
create temporary table project_cost_mounted_input(data jsonb not null);
insert into project_cost_mounted_input values(:'personnel_fixture'::jsonb);
create temporary table project_cost_mounted_selectors(data jsonb not null);
create temporary table project_cost_mounted_grant_sequence(value bigint not null check(value>0));
grant select on project_cost_mounted_input to service_role;
do $$declare f jsonb;s jsonb;r jsonb;reply jsonb;grant_receipt jsonb;k text;
 org uuid:='00000000-0000-4000-8000-000000000001';project uuid:='00000000-0000-4000-8000-000000001017';
begin
 select data into strict f from project_cost_mounted_input;
 if jsonb_typeof(f) is distinct from 'object' or (select count(*) from jsonb_object_keys(f))<>3 or not(f ?& array['schema','known','missing']) or f->>'schema' is distinct from 'operations-project-cost-mounted-fixture.v1' then raise exception 'exact_producer_fixture_required' using errcode='22023';end if;
 foreach k in array array['known','missing'] loop
  if jsonb_typeof(f->k) is distinct from 'object' or (select count(*) from jsonb_object_keys(f->k))<>2 or not(f->k ?& array['raw','snapshot']) then raise exception 'exact_raw_and_calculated_pair_required' using errcode='22023';end if;
  s:=f#>array[k,'snapshot'];
  if s->>'organization_id' is distinct from org::text or s->>'source_revision' is distinct from '1' or s->>'time_snapshot_version' is distinct from '1' or jsonb_array_length(s->'lines')<>1
  or s#>>'{lines,0,source_project_id}' is distinct from project::text or s#>'{lines,0,source_booking_id}' is distinct from 'null'::jsonb
  or s#>>'{lines,0,currency}' is distinct from 'SEK' or s#>>'{lines,0,status}' is distinct from 'preliminary'
  or s->>'worker_id' is distinct from (case when k='known' then '00000000-0000-4000-8000-000000007001' else '00000000-0000-4000-8000-000000007002' end)
  then raise exception 'fixed_personnel_selector_required' using errcode='22023';end if;
  if k='known' and (s#>>'{lines,0,amount_minor}' is distinct from '181' or s#>>'{lines,0,coverage}' is distinct from 'complete' or s#>>'{lines,0,minutes}' is distinct from '1')
  or k='missing' and (s#>'{lines,0,amount_minor}' is distinct from 'null'::jsonb or s#>>'{lines,0,coverage}' is distinct from 'missing_rate' or s#>>'{lines,0,minutes}' is distinct from '15')
  then raise exception 'actual_calculator_fixed_money_and_null_required' using errcode='22023';end if;
  execute 'set local role service_role';
  r:=public.publish_operations_personnel_cost_v1(s,f#>array[k,'raw'],0,'synthetic-mounted-personnel-'||k);
  execute 'reset role';
  if r->>'status' is distinct from 'accepted' then raise exception 'actual_personnel_publication_required' using errcode='55000';end if;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',true);
 execute 'set local role authenticated';
 grant_receipt:=public.grant_operations_project_personnel_review_v1(project,'00000000-0000-4000-8000-000000000292',0,'granted','Isolated explicit project read authority','synthetic-mounted-personnel-project-grant');
 if grant_receipt->>'status' is distinct from 'accepted' or (grant_receipt->>'grant_sequence')::bigint<1 then raise exception 'accepted_real_grant_sequence_required' using errcode='55000';end if;
 reply:=public.read_operations_project_cost_evidence_v1(org,project);
 if jsonb_array_length(reply->'personnel')<>2 or reply->>'missingPersonnelCostCount'<>'1'
 or (select count(*) from jsonb_array_elements(reply->'personnel') AS line_row(value) where line_row.value->>'amountMinor'='181' and line_row.value->>'coverage'='complete')<>1
 or (select count(*) from jsonb_array_elements(reply->'personnel') AS line_row(value) where line_row.value->'amountMinor'='null'::jsonb and line_row.value->>'coverage'='missing_rate')<>1
 then raise exception 'actual_native_reader_copy_and_null_required' using errcode='55000';end if;
 execute 'reset role';
 insert into project_cost_mounted_selectors values(jsonb_build_object('schema','operations-project-cost-mounted-selectors.v1','organizationId',org,'actorId','00000000-0000-4000-8000-000000000199','projectId',project,'knownReportId',f#>>'{known,snapshot,source_time_report_id}','missingReportId',f#>>'{missing,snapshot,source_time_report_id}'));
 -- Root's future fixed revoke control MUST use this accepted sequence, not hardcode1.
 -- Private accepted CAS receipt survives this COMMIT/output; no assumption about a local GUC.
 insert into project_cost_mounted_grant_sequence values((grant_receipt->>'grant_sequence')::bigint);
end;$$;
commit;
select 'PROJECT_COST_MOUNTED_SELECTORS='||data::text as result from project_cost_mounted_selectors;
select 'PROJECT_COST_MOUNTED_GRANT_SEQUENCE='||value::text as result from project_cost_mounted_grant_sequence;
select 'operations-project-cost-mounted-browser-fixture SETUP PASS' as result;
