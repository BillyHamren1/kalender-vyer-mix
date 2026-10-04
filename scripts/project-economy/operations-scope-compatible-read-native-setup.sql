-- TEST ONLY. Committed controlled read requests/state hashes, no cost mutations.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_scope_compatible_read_native') is not null
 or to_regclass('operations_scope_reader_permission_native.fixture') is null
 or to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is null
 or to_regprocedure('operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(jsonb)') is null
 or has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','execute')
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','execute')
 or (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3
 or exists(select 1 from auth.users where id<>all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
 or exists(select 1 from public.user_roles where user_id is null or role is null or organization_id is null or (user_id,organization_id,role::text) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin')))
 or exists(select 1 from public.profiles where user_id is null or organization_id is null or (user_id,organization_id) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
 or (select count(*) from public.projects)<>4
 or exists(select 1 from public.projects where organization_id is null or deleted_at is not null or (id,organization_id) not in (
 ('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
 ('64646464-6464-4646-8646-646464646464'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
 or not exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin')
 or (select count(*) from public.operations_project_scope_heads)<>2
 or exists(select 1 from public.operations_project_scope_heads where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or (select count(*) from public.operations_scope_obligation_composition_heads)<>2
 or exists(select 1 from public.operations_scope_obligation_composition_heads where current_revision<>1)
 or (select count(*) from public.operations_project_obligation_heads)<>4
 or exists(select 1 from public.operations_project_obligation_heads where current_revision<>1)
 or (select count(*) from public.operations_finance_invoice_streams)<>2
 or exists(select 1 from public.operations_finance_invoice_streams where current_revision<>1)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 or not exists(select 1 from public.packing_projects where id='65656565-6565-4656-8656-656565656565' and organization_id='11111111-1111-4111-8111-111111111111' and status='planning')
 or (select count(*) from public.operations_project_scope_packing_policies where organization_id='11111111-1111-4111-8111-111111111111' and status in ('planning','ready') and enabled)<>2
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from operations_scope_publication_native.heads)
 or exists(select 1 from operations_scope_publication_native.blocked_controls)
 then raise exception 'fresh_disposable_product_compatible_read_setup_required' using errcode='22023';end if;
end;$$;
create schema operations_scope_compatible_read_native;
revoke all on schema operations_scope_compatible_read_native from public,anon,authenticated,service_role;
create table operations_scope_compatible_read_native.requests(case_id text primary key check(case_id in ('known','unknown')),service_request jsonb not null,admin_request jsonb not null);
insert into operations_scope_compatible_read_native.requests
 select 'unknown',f.read_request,jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','packing_project','root_id','65656565-6565-4656-8656-656565656565','expected_composition_snapshot_id',c.snapshot_id)
 from operations_scope_reader_permission_native.fixture f join public.operations_scope_obligation_compositions c on c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=1;
insert into operations_scope_compatible_read_native.requests
 select 'known',f.read_request,jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_composition_snapshot_id',c.snapshot_id)
 from public.operations_scope_invoice_kernel_native_fixture f join public.operations_scope_obligation_compositions c on c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=1;
-- Only private synthetic observers can call this hash. It never returns row data.
create function operations_scope_compatible_read_native.state_sha256() returns text
language plpgsql security definer set search_path='' as $$declare inventory jsonb:='[]';r record;rows jsonb;n bigint;begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
 and (c.relname like 'operations\_%' escape '\' or c.relname in ('projects','large_projects','packing_projects','bookings','large_project_bookings','packing_project_bookings','profiles','user_roles'))
 order by c.relname collate "C" loop
 execute format('select count(*) from public.%I',r.relname) into n;
 if n>1000 or jsonb_array_length(inventory)>=100 then raise exception 'bounded_synthetic_state_required' using errcode='22023';end if;
 execute format('select coalesce(jsonb_agg(row_data order by row_data::text collate "C"),''[]''::jsonb) from (select to_jsonb(t) row_data from public.%I t) rows',r.relname) into rows;
 inventory:=inventory||jsonb_build_array(jsonb_build_array(r.relname,rows));
 end loop;
 if (select count(*) from auth.users)<>4 then raise exception 'bounded_synthetic_auth_state_required' using errcode='22023';end if;
 select jsonb_agg(to_jsonb(u) order by u.id) into rows from auth.users u;
 inventory:=inventory||jsonb_build_array(jsonb_build_array('auth.users',rows));
 return encode(sha256(convert_to(inventory::text,'UTF8')),'hex');
end;$$;
revoke all on all tables in schema operations_scope_compatible_read_native from public,anon,authenticated,service_role;
revoke all on function operations_scope_compatible_read_native.state_sha256() from public,anon,authenticated,service_role;
do $$begin
 if (select count(*) from operations_scope_compatible_read_native.requests)<>2
 or has_schema_privilege('authenticated','operations_scope_compatible_read_native','usage')
 or has_schema_privilege('service_role','operations_scope_compatible_read_native','usage')
 or operations_scope_compatible_read_native.state_sha256() !~ '^[0-9a-f]{64}$'
 then raise exception 'private_product_read_fixture_required' using errcode='22023';end if;
end;$$;
commit;
