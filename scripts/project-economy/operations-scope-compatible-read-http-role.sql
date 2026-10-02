-- TEST ONLY: isolated PostgREST connection role and hash-only state proof.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_compatible_read_native.requests') is null
 or (select count(*) from operations_scope_compatible_read_native.requests)<>2
 or (select count(*) from public.operations_project_scope_heads)<>2
 or exists(select 1 from public.operations_project_scope_heads where current_revision<>1)
 or (select count(*) from public.operations_scope_obligation_composition_heads)<>2
 or exists(select 1 from public.operations_scope_obligation_composition_heads where current_revision<>1)
 or (select count(*) from public.operations_project_obligation_heads)<>4
 or exists(select 1 from public.operations_project_obligation_heads where current_revision<>1)
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from pg_roles where rolname='scope_compatible_read_http_authenticator')
 or to_regprocedure('public.operations_scope_compatible_read_http_state_v1()') is not null
 then raise exception 'fresh_exact_disposable_compatible_http_required' using errcode='22023';end if;
end;$$;
create role scope_compatible_read_http_authenticator login noinherit nosuperuser nocreatedb nocreaterole password 'synthetic-compatible-read-http-only';
grant anon,authenticated,service_role to scope_compatible_read_http_authenticator;
do $$begin execute format('grant connect on database %I to scope_compatible_read_http_authenticator',current_database());end;$$;
create function public.operations_scope_compatible_read_http_state_v1() returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or session_user<>'scope_compatible_read_http_authenticator'
 or auth.uid() is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 or operations_economy_private.authorize_scope_read_nowait_v1() is distinct from '11111111-1111-4111-8111-111111111111'::uuid
 or (select count(*) from operations_scope_compatible_read_native.requests)<>2
 then raise exception 'exact_isolated_compatible_http_actor_required' using errcode='42501';end if;
 return jsonb_build_object('schema','operations-scope-compatible-read-http-state.v1','database',current_database(),
 'state_sha256',operations_scope_compatible_read_native.state_sha256(),
 'old_service_core_role_execute',has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','execute'),
 'old_admin_core_role_execute',has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','execute'),
 'baselines',(select count(*) from public.operations_project_obligation_baselines),
 'invoice_heads',(select count(*) from public.operations_finance_invoice_streams),
 'credit_heads',(select count(*) from public.operations_finance_credit_v2_streams));
end;$$;
revoke all on function public.operations_scope_compatible_read_http_state_v1() from public,anon,authenticated,service_role;
grant execute on function public.operations_scope_compatible_read_http_state_v1() to authenticated;
commit;
