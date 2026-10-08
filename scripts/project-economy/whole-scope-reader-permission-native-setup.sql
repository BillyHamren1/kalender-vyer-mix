-- TEST ONLY. Committed fixture in fresh isolated PostgreSQL; not a product migration.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_scope_reader_permission_native') is not null
 or to_regclass('operations_scope_publication_try_native.controls') is null
 or to_regclass('public.operations_scope_invoice_kernel_native_fixture') is null
 or (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4
 or (select count(*) from public.user_roles)<>3
 or (select count(*) from public.projects)<>3
  or exists(select 1 from public.profiles where user_id is null or organization_id is null or (user_id,organization_id) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
   ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
  or exists(select 1 from public.user_roles where user_id is null or role is null or organization_id is null or (user_id,organization_id,role::text) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin')))
  or exists(select 1 from auth.users where id <> all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
  or (select count(*) from public.projects) <> 3
  or exists(select 1 from public.projects where organization_id is null or deleted_at is not null or (id,organization_id) not in (
   ('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)))
  or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 or (select count(*) from public.operations_finance_invoice_streams)<>2
 or exists(select 1 from public.operations_finance_invoice_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 or (select count(*) from public.operations_project_obligation_heads)<>3
 or exists(select 1 from public.operations_project_obligation_heads where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or (select count(*) from public.operations_project_scope_heads)<>1
 or exists(select 1 from public.operations_project_scope_heads where organization_id<>'11111111-1111-4111-8111-111111111111' or economic_scope_id<>'90909090-9090-4909-8909-909090909090' or root_kind<>'large_project' or root_id<>'cccccccc-cccc-4ccc-8ccc-cccccccccccc' or current_revision<>1)
 or (select count(*) from public.operations_project_scope_snapshots)<>1
 or (select count(*) from public.operations_obligation_source_policy_heads)<>2
 or exists(select 1 from public.operations_obligation_source_policy_heads where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or (select count(*) from public.operations_scope_obligation_composition_heads)<>1
 or exists(select 1 from public.operations_scope_obligation_composition_heads where organization_id<>'11111111-1111-4111-8111-111111111111' or economic_scope_id<>'90909090-9090-4909-8909-909090909090' or current_revision<>1)
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from operations_scope_publication_native.heads)
 or exists(select 1 from operations_scope_publication_native.blocked_controls)
 or (select count(*) from operations_scope_publication_native.gates)<>1
 or exists(select 1 from operations_scope_publication_native.gates where organization_id<>'11111111-1111-4111-8111-111111111111' or economic_scope_id<>'90909090-9090-4909-8909-909090909090' or not enabled or fault_after_publication or pause_after_barriers)
 or exists(select 1 from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status in ('planning','ready'))
 or exists(select 1 from pg_constraint where conrelid='public.user_roles'::regclass and contype='f')
 or exists(select 1 from pg_indexes where schemaname='public' and tablename='user_roles' and indexname='user_roles_user_role_org_key')
 or (select count(*) from operations_scope_publication_try_native.controls)<>1
 or exists(select 1 from operations_scope_publication_try_native.controls where slot<>'only' or pause_stage<>'none')
 then raise exception 'fresh_disposable_permission_fixture_required' using errcode='22023';end if;
end;$$;
-- The production FK and unique tuple are exact-pin audited, not a new product policy.
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
create unique index user_roles_user_role_org_key on public.user_roles(user_id,role,organization_id);
create schema operations_scope_reader_permission_native;
revoke all on schema operations_scope_reader_permission_native from public,anon,authenticated,service_role;
create table operations_scope_reader_permission_native.fixture(
 slot text primary key check(slot='only'),read_request jsonb not null,enroll_command jsonb not null,
 compose_command jsonb not null,baseline_command jsonb not null,baseline_event_id uuid not null
);
revoke all on all tables in schema operations_scope_reader_permission_native from public,anon,authenticated,service_role;
insert into public.bookings values('native-permission-booking','11111111-1111-4111-8111-111111111111',null);
insert into public.projects(id,organization_id,deleted_at,booking_id) values('64646464-6464-4646-8646-646464646464','11111111-1111-4111-8111-111111111111',null,'native-permission-booking');
insert into public.packing_projects values('65656565-6565-4656-8656-656565656565','11111111-1111-4111-8111-111111111111','native-permission-booking',null,'planning');
insert into public.packing_project_bookings values('69696969-6969-4696-8696-696969696969','11111111-1111-4111-8111-111111111111','65656565-6565-4656-8656-656565656565','native-permission-booking');
insert into public.operations_project_scope_packing_policies values('11111111-1111-4111-8111-111111111111','planning',true),('11111111-1111-4111-8111-111111111111','ready',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare baseline jsonb;enroll jsonb;compose jsonb;preview jsonb;result jsonb;request jsonb;event uuid;capture jsonb;begin
 baseline:=jsonb_build_object('schema_version','operations-obligation-manual-baseline.v1','project_id','64646464-6464-4646-8646-646464646464','obligation_id','68686868-6868-4686-8686-686868686868','expected_revision',0,'currency','SEK','category','supplier','cost_basis','invoice','estimate_minor',null,'committed_minor',null,'idempotency_key','native-permission-unknown-baseline','reason','Explicit unknown manual baseline for isolated permission proof');
 execute 'set local role authenticated';
 result:=public.append_operations_manual_obligation_baseline_v1(baseline);
 if result->>'outcome' is distinct from 'accepted' or result->'revision' is distinct from '1'::jsonb then raise exception 'permission_actual_baseline_required' using errcode='22023';end if;
 event:=(result->>'event_id')::uuid;
 preview:=public.preview_operations_project_scope_v1('packing_project','65656565-6565-4656-8656-656565656565');
 if preview#>'{membership,source_project_ids}' is distinct from '["64646464-6464-4646-8646-646464646464"]'::jsonb
 or preview#>'{membership,local_booking_ids}' is distinct from '["native-permission-booking"]'::jsonb
 or preview#>>'{membership,root_evidence,status}' is distinct from 'planning'
 then raise exception 'permission_independent_packing_graph_required' using errcode='22023';end if;
 enroll:=jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','67676767-6767-4676-8676-676767676767','root_kind','packing_project','root_id','65656565-6565-4656-8656-656565656565','expected_revision',0,'expected_membership_fingerprint',preview->'membership_fingerprint','idempotency_key','native-permission-independent-scope','reason','Explicit independent packing membership without prices');
 result:=public.enroll_operations_project_scope_v1(enroll);
 if result->>'outcome' is distinct from 'accepted' or result->'scope_revision' is distinct from '1'::jsonb then raise exception 'permission_actual_enrollment_required' using errcode='22023';end if;
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',enroll->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(event),'idempotency_key','native-permission-unknown-composition','reason','Capture unknown manual source-free obligation explicitly');
 result:=public.compose_operations_scope_obligations_v1(compose);execute 'reset role';
 if result->>'outcome' is distinct from 'accepted' or result->'composition_revision' is distinct from '1'::jsonb then raise exception 'permission_actual_composition_required' using errcode='22023';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id','11111111-1111-4111-8111-111111111111','economic_scope_id',enroll->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',1,'expected_composition_fingerprint',result->'fingerprint');
 execute 'set local role service_role';capture:=public.read_operations_scope_invoice_kernel_evidence_v1(request);execute 'reset role';
 if jsonb_array_length(capture->'members')<>1 or capture->'source_inventory' is distinct from '[]'::jsonb
 or capture->'source_coverage' is distinct from '"unavailable"'::jsonb
 or capture->'remaining_minor' is distinct from 'null'::jsonb or capture->'eac_minor' is distinct from 'null'::jsonb
 or capture->'budget_minor' is distinct from 'null'::jsonb or capture->'credit_eligible' is distinct from 'false'::jsonb
 or capture#>'{members,0,kernel_evidence,baseline,estimate_minor}' is distinct from 'null'::jsonb
 or capture#>'{members,0,kernel_evidence,baseline,committed_minor}' is distinct from 'null'::jsonb
 then raise exception 'permission_unknown_cost_must_remain_unavailable' using errcode='22023';end if;
 insert into operations_scope_reader_permission_native.fixture values('only',request,enroll,compose,baseline,event);
end;$$;
insert into operations_scope_publication_native.gates(organization_id,economic_scope_id,enabled) values('11111111-1111-4111-8111-111111111111','67676767-6767-4676-8676-676767676767',true);
-- No financial source/assignment/policy is manufactured. The old original scope
-- and single-slot request fixture remain exactly unchanged for their own jobs.
commit;
