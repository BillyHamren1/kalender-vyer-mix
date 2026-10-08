\set ON_ERROR_STOP on
-- Disposable CI connection role only. No economic source or authority mutation.
begin;
do $$begin
 if current_database() !~ '^eventflow_scope_invoice_kernel_[a-z0-9_]+$'
 or current_setting('eventflow.scope_invoice_kernel_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('public.operations_scope_invoice_kernel_native_fixture') is null
 or (select count(*) from public.operations_scope_invoice_kernel_native_fixture)<>1
 or (select count(*) from public.operations_finance_invoice_streams)<>2
 or exists(select 1 from public.operations_finance_invoice_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 or (select count(*) from public.operations_scope_obligation_compositions)<>1
 or (select count(*) from public.operations_project_obligation_baselines)<>3
 or (select count(*) from public.operations_project_obligation_invoice_bindings)<>3
 or (select count(*) from public.operations_obligation_source_policies)<>2
 or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 or exists(select 1 from pg_roles where rolname='scope_invoice_admin_http_authenticator')
 then raise exception 'fresh_exact_isolated_scope_invoice_http_required' using errcode='22023';end if;
end;$$;
create role scope_invoice_admin_http_authenticator login noinherit nosuperuser nocreatedb nocreaterole
 password 'synthetic-scope-invoice-http-only';
grant anon,authenticated,service_role to scope_invoice_admin_http_authenticator;
do $$begin execute format('grant connect on database %I to scope_invoice_admin_http_authenticator',current_database());end;$$;
-- Test-only read proof. Never included in a product migration or hosted schema.
create function public.operations_scope_invoice_admin_http_test_state_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare state jsonb;begin
 if current_database() !~ '^eventflow_scope_invoice_kernel_[a-z0-9_]+$'
 or auth.uid() is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 or operations_economy_private.authorize_scope_admin_v1() is distinct from '11111111-1111-4111-8111-111111111111'::uuid
 or (select count(*) from public.operations_scope_invoice_kernel_native_fixture)<>1
 then raise exception 'exact_isolated_http_test_actor_required' using errcode='42501';end if;
 state:=jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by id) from auth.users x),
 (select jsonb_agg(to_jsonb(x) order by user_id) from public.profiles x),
 (select jsonb_agg(to_jsonb(x) order by user_id,organization_id,role) from public.user_roles x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.projects x),
 (select jsonb_agg(to_jsonb(x) order by id collate "C") from public.bookings x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.large_projects x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.large_project_bookings x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.packing_projects x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.packing_project_bookings x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,status) from public.operations_project_scope_packing_policies x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,source_organization_id,invoice_id) from public.operations_finance_invoice_streams x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.operations_finance_invoice_snapshots x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.operations_finance_invoice_receipts x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,source_organization_id,invoice_id) from public.operations_finance_credit_v2_streams x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.operations_finance_credit_v2_snapshots x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.operations_finance_credit_v2_receipts x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,project_id,obligation_id) from public.operations_project_obligation_heads x),
 (select jsonb_agg(to_jsonb(x) order by event_id) from public.operations_project_obligation_baselines x),
 (select jsonb_agg(to_jsonb(x) order by event_id) from public.operations_project_obligation_invoice_bindings x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,source_anchor) from public.operations_project_obligation_source_ownership x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,source_anchor) from public.operations_obligation_source_policy_heads x),
 (select jsonb_agg(to_jsonb(x) order by event_id) from public.operations_obligation_source_policies x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,economic_scope_id) from public.operations_project_scope_heads x),
 (select jsonb_agg(to_jsonb(x) order by snapshot_id) from public.operations_project_scope_snapshots x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,economic_scope_id) from public.operations_scope_obligation_composition_heads x),
 (select jsonb_agg(to_jsonb(x) order by snapshot_id) from public.operations_scope_obligation_compositions x),
 (select jsonb_agg(to_jsonb(x) order by organization_id,obligation_id) from public.operations_scope_obligation_ownership x),
 (select jsonb_agg(to_jsonb(x) order by composition_snapshot_id,baseline_event_id) from public.operations_scope_obligation_baseline_captures x),
 (select jsonb_agg(to_jsonb(x) order by organization_id) from public.operations_scope_invoice_kernel_read_gates x),
 (select jsonb_agg(to_jsonb(x) order by organization_id) from public.operations_invoice_obligation_kernel_read_gates x),
 (select jsonb_agg(to_jsonb(x) order by slot) from public.operations_scope_invoice_kernel_native_fixture x));
 return jsonb_build_object('schema','operations-scope-invoice-admin-http-test-state.v1','database_name',current_database(),
 'state_fingerprint',encode(sha256(convert_to(state::text,'UTF8')),'hex'),
 'invoice_heads',(select count(*) from public.operations_finance_invoice_streams),
 'credit_heads',(select count(*) from public.operations_finance_credit_v2_streams),
 'baselines',(select count(*) from public.operations_project_obligation_baselines),
 'bindings',(select count(*) from public.operations_project_obligation_invoice_bindings),
 'policies',(select count(*) from public.operations_obligation_source_policies),
 'compositions',(select count(*) from public.operations_scope_obligation_compositions));
end;$$;
revoke all on function public.operations_scope_invoice_admin_http_test_state_v1() from public,anon,authenticated,service_role;
grant execute on function public.operations_scope_invoice_admin_http_test_state_v1() to authenticated;
select 'operations-scope-invoice-capture-admin-http-role PASS' as result;
commit;
