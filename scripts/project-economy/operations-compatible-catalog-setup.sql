-- NEW TEST ONLY. Committed named isolated metadata fixture; no product or financial changes.
begin;
set local search_path=pg_catalog;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('server_version_num')<>'150019'
 or current_setting('server_encoding')<>'UTF8'
 or session_user<>'postgres' or current_user<>'postgres'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.compatible_catalog_isolated',true) is distinct from 'synthetic-disposable'
 or to_regnamespace('operations_compatible_catalog_native') is not null
 or exists(select 1 from pg_roles where rolname like 'operations_compatible_catalog_%')
 or to_regclass('operations_scope_compatible_read_native.requests') is null
 or (select count(*) from operations_scope_compatible_read_native.requests)<>2
 or to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is null
 or to_regprocedure('public.read_operations_scope_invoice_capture_admin_v1(jsonb)') is null
 or not exists(select 1 from public.profiles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111')
 or exists(select 1 from public.profiles p where p.organization_id is null or (p.user_id,p.organization_id) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
 or (select count(*) from public.profiles)<>4
 or (select count(*) from auth.users)<>4
 or to_regprocedure('operations_whole_scope_publication_private.publish_v1(jsonb)') is not null
 then raise exception 'exact_selected_catalog_disposable_required' using errcode='22023';end if;
 if has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','EXECUTE')
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','EXECUTE')
 or not has_function_privilege('service_role','public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.read_operations_scope_invoice_capture_admin_v1(jsonb)','EXECUTE')
 then raise exception 'exact_selected_candidate_roles_required' using errcode='55000';end if;
end;$$;
create schema operations_compatible_catalog_native;
revoke all on schema operations_compatible_catalog_native from public,anon,authenticated,service_role;
create table operations_compatible_catalog_native.fixture(
 purpose text primary key check(purpose='selected_metadata_only'),
 full_certificate boolean not null check(full_certificate=false)
);
insert into operations_compatible_catalog_native.fixture values('selected_metadata_only',false);
revoke all on all tables in schema operations_compatible_catalog_native from public,anon,authenticated,service_role;
commit;
