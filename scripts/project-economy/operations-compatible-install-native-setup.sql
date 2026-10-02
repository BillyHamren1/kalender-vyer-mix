-- TEST ONLY. Committed control on a freshly bootstrapped disposable database.
begin;
do $guard$begin
 if current_database()<>'operations_compatible_install_runtime'
 or current_setting('server_version_num')<>'150019'
 or current_setting('eventflow.compatible_install_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_compatible_install_native') is not null
 or to_regnamespace('operations_remaining_reader_private') is not null
 or exists(select 1 from pg_event_trigger)
 or (select count(*) from auth.users)<>4
 or (select count(*) from public.profiles)<>4
 or (select count(*) from public.user_roles)<>3
 or (select count(*) from public.projects)<>3
 or exists(select 1 from public.profiles where user_id is null or organization_id is null or (user_id,organization_id) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
 or exists(select 1 from auth.users where id<>all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
 or exists(select 1 from public.user_roles where user_id is null or organization_id is null or role is null or (user_id,organization_id,role::text) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin')))
 or exists(select 1 from public.projects where organization_id is null or deleted_at is not null or (id,organization_id) not in (
 ('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-888888888888'::uuid)))
 or exists(select 1 from pg_constraint where conrelid='public.user_roles'::regclass and contype='f')
 or to_regclass('public.user_roles_user_role_org_key') is not null
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='operations_economy_private' and p.proname in (
 'authorize_scope_read_nowait_v1','lock_scope_read_root_nowait_v1','prepare_scope_invoice_read_v1',
 'read_scope_invoice_kernel_compatible_v1','read_scope_invoice_capture_admin_compatible_v1'))
 then raise exception 'fresh_compatible_install_fixture_required' using errcode='22023';end if;
end;$guard$;
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
create unique index user_roles_user_role_org_key on public.user_roles(user_id,role,organization_id);
create schema operations_compatible_install_native;
revoke all on schema operations_compatible_install_native from public,anon,authenticated,service_role;
create function operations_compatible_install_native.failpoint_v1() returns event_trigger
language plpgsql security definer set search_path='' as $handler$
declare target text:=pg_catalog.current_setting('eventflow.compatible_install_fault_target',true);item record;ready boolean;begin
 if pg_catalog.current_database()<>'operations_compatible_install_runtime'
 or pg_catalog.current_setting('eventflow.compatible_install_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 then raise exception 'compatible_install_fault_scope_required' using errcode='22023';end if;
 if target is null or target='none' then return;end if;
 if target not in ('first_two','remaining_six') then raise exception 'compatible_install_fault_target_invalid' using errcode='22023';end if;
 for item in select d.objid,p.proname,n.nspname from pg_catalog.pg_event_trigger_ddl_commands() d
 join pg_catalog.pg_proc p on d.classid='pg_catalog.pg_proc'::pg_catalog.regclass and p.oid=d.objid
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace where d.command_tag='CREATE FUNCTION' loop
  if target='first_two' and item.nspname='public' and item.proname='read_operations_scope_invoice_capture_admin_v1' then
   select count(*)=5 and count(*) filter(where p.prosecdef and p.proconfig=array['search_path=""']::text[])=5 into ready
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='operations_economy_private' and p.proname in (
    'authorize_scope_read_nowait_v1','lock_scope_read_root_nowait_v1','prepare_scope_invoice_read_v1',
    'read_scope_invoice_kernel_compatible_v1','read_scope_invoice_capture_admin_compatible_v1');
   if ready is distinct from true
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)')
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='9901a5697bfcb93d4ed8503397b779da7cbfbfa2e3e32b2166f3981af1b0efc1')
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=item.objid
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='88c9de651eeb997b598c3e39ac5565af3cdc6a80834e9e1c88bc4dc6582d820b')
   then raise exception 'compatible_install_fault_prefix_missing' using errcode='22023';end if;
   raise exception 'atomic_install_fault_130228' using errcode='P0001';
  elsif target='remaining_six' and item.nspname='public' and item.proname='read_operations_invoice_obligation_kernel_evidence_v1' then
   select count(*)=13 and count(*) filter(where p.prosecdef and p.proconfig=array['search_path=""']::text[])=13 into ready
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_remaining_reader_private';
   if ready is distinct from true
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid)')
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='4b910da52b618430e6dded7210686d2bf24f97fd9b8feb2fb05d225ac2f62f70')
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.read_operations_scope_obligation_drilldown_v1(jsonb)')
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='b66ba14b5583aab720868ebe6201d4c7d536379391872cc8c0a6f9bbf2827a59')
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.read_operations_scope_obligation_composition_v1(uuid,uuid)')
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='ae15be393483b89d6cccc81a167dc3a9910e754cb8126f16aeb86be846da0dda')
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=item.objid
     and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='9cb921fed2f2fd2ec6e6580bce3aebb8fa6efe2955687d7a514f3d51f5b1cbb4')
   then raise exception 'compatible_install_fault_prefix_missing' using errcode='22023';end if;
   raise exception 'atomic_install_fault_145349' using errcode='P0001';
  end if;
 end loop;
end;$handler$;
revoke all on function operations_compatible_install_native.failpoint_v1() from public,anon,authenticated,service_role;
create event trigger operations_compatible_install_mid_ddl on ddl_command_end when tag in ('CREATE FUNCTION')
execute function operations_compatible_install_native.failpoint_v1();
commit;
