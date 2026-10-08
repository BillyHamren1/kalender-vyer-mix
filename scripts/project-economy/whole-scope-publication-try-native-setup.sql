-- TEST ONLY adjunct to actual frozen native setup; no baseline/source rewrite.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_scope_publication_try_native') is not null
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
 or exists(select 1 from operations_scope_publication_native.gates where organization_id<>'11111111-1111-4111-8111-111111111111' or economic_scope_id<>'90909090-9090-4909-8909-909090909090' or enabled or fault_after_publication or pause_after_barriers)
 then raise exception 'fresh_disposable_try_fixture_required' using errcode='22023';end if;
end;$$;
create schema operations_scope_publication_try_native;
revoke all on schema operations_scope_publication_try_native from public,anon,authenticated,service_role;
create table operations_scope_publication_try_native.controls(slot text primary key check(slot='only'),pause_stage text not null default 'none' check(pause_stage in ('none','after_barriers')));
insert into operations_scope_publication_try_native.controls values('only','none');
revoke all on all tables in schema operations_scope_publication_try_native from public,anon,authenticated,service_role;
update operations_scope_publication_native.gates set enabled=true;
commit;
