\set ON_ERROR_STOP on
-- Read-only boundary checks. Full admin/cross-org/current-head fixtures remain a native runtime gate.
begin;
create function pg_temp.line_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'scope invoice line assertion failed: %',label;end if;
end;$$;
select pg_temp.line_assert(to_regprocedure('public.read_operations_scope_invoice_lines_admin_v1(jsonb)') is not null,'public rpc installed');
select pg_temp.line_assert(to_regprocedure('operations_economy_private.read_scope_invoice_lines_admin_v1(jsonb)') is not null,'private rpc installed');
select pg_temp.line_assert(has_function_privilege('authenticated','public.read_operations_scope_invoice_lines_admin_v1(jsonb)','EXECUTE'),'authenticated public execute');
select pg_temp.line_assert(not has_function_privilege('anon','public.read_operations_scope_invoice_lines_admin_v1(jsonb)','EXECUTE'),'anon denied');
select pg_temp.line_assert(not has_function_privilege('service_role','public.read_operations_scope_invoice_lines_admin_v1(jsonb)','EXECUTE'),'service role browser route denied');
select pg_temp.line_assert((select prosecdef and proconfig=array['search_path=""']::text[] from pg_proc where oid='operations_economy_private.read_scope_invoice_lines_admin_v1(jsonb)'::regprocedure),'private definer and empty path');
select pg_temp.line_assert((select not prosecdef and proconfig=array['search_path=""']::text[] from pg_proc where oid='public.read_operations_scope_invoice_lines_admin_v1(jsonb)'::regprocedure),'public invoker and empty path');

set local role authenticated;
do $$begin
 perform public.read_operations_scope_invoice_lines_admin_v1('{"schema_version":"operations-scope-invoice-line-admin-read.v1","root_kind":"project","root_id":"00000000-0000-4000-8000-000000000001","expected_composition_snapshot_id":"00000000-0000-4000-8000-000000000002","amount_minor":0}'::jsonb);
 raise exception 'caller money accepted';
exception when sqlstate '22023' then
 if sqlerrm<>'exact_scope_invoice_line_admin_request_required' then raise;end if;
end$$;
do $$begin
 perform public.read_operations_scope_invoice_lines_admin_v1('{"schema_version":"operations-scope-invoice-line-admin-read.v1","root_kind":"project","root_id":"00000000-0000-4000-8000-000000000001","expected_composition_snapshot_id":"00000000-0000-4000-8000-000000000002"}'::jsonb);
 raise exception 'unknown authenticated actor accepted';
exception when insufficient_privilege then
 if sqlerrm<>'authenticated_scope_admin_required' then raise;end if;
end$$;
reset role;
rollback;
select 'operations-scope-invoice-line-admin boundary PASS' as result;
