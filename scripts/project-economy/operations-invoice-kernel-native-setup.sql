\set ON_ERROR_STOP on
-- ONLY after guarded own-credit native seed on a fresh disposable kernel-read DB.
begin;
do $$begin
 if current_database() !~ '^eventflow_own_credit_kernel_[a-z0-9_]+$' or current_setting('eventflow.invoice_kernel_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('public.operations_invoice_kernel_native_fixture') is not null
 or (select count(*) from auth.users)<>4 or exists(select 1 from auth.users where id<>all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
 or (select count(*) from public.projects)<>3 or exists(select 1 from public.projects where deleted_at is not null or (id,organization_id) not in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)))
 or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 or (select count(*) from public.operations_own_credit_native_fixture)<>1
 or (select count(*) from public.operations_finance_invoice_streams)<>1 or exists(select 1 from public.operations_finance_invoice_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or source_organization_id<>'99999999-9999-4999-8999-999999999999' or invoice_id<>'23232323-2323-4232-8232-232323232323' or current_revision<>1)
 or (select count(*) from public.operations_finance_credit_v2_streams)<>1 or exists(select 1 from public.operations_finance_credit_v2_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or source_organization_id<>'99999999-9999-4999-8999-999999999999' or invoice_id<>'89898989-8989-4898-8989-898989898989' or current_revision<>1)
 or (select count(*) from public.operations_project_obligation_heads)<>1 or (select count(*) from public.operations_project_obligation_baselines)<>1 or (select count(*) from public.operations_project_obligation_invoice_bindings)<>1
 or exists(select 1 from public.operations_obligation_credit_assignments) or exists(select 1 from public.operations_obligation_source_policy_heads) or exists(select 1 from public.operations_obligation_source_policies) or exists(select 1 from public.operations_invoice_obligation_kernel_read_gates)
 then raise exception 'Fresh dedicated synthetic kernel read seed required' using errcode='22023';end if;
end;$$;
create table public.operations_invoice_kernel_native_fixture(slot text primary key,read_request jsonb not null,policy_command jsonb not null,baseline_command jsonb not null,raw_source_correction text not null);
grant select on public.operations_invoice_kernel_native_fixture to authenticated,service_role;
insert into public.operations_invoice_obligation_kernel_read_gates values('11111111-1111-4111-8111-111111111111',true);
do $$declare b public.operations_project_obligation_baselines%rowtype;binding public.operations_project_obligation_invoice_bindings%rowtype;source jsonb;begin
 select * into strict b from public.operations_project_obligation_baselines;
 select * into strict binding from public.operations_project_obligation_invoice_bindings;
 select envelope into strict source from public.operations_finance_invoice_snapshots where invoice_id='23232323-2323-4232-8232-232323232323';
 source:=jsonb_set(source||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('6',64),'recipient_net_minor',450000),'{allocations,0,amount_minor}','450000');
 insert into public.operations_invoice_kernel_native_fixture values('only',
 jsonb_build_object('schema_version','operations-invoice-obligation-kernel-read.v1','organization_id',b.organization_id,'project_id',b.project_id,'obligation_id',b.obligation_id),
 jsonb_build_object('schema_version','operations-obligation-source-policy.v1','project_id',b.project_id,'obligation_id',b.obligation_id,'baseline_event_id',b.event_id,'binding_event_id',binding.event_id,'expected_policy_revision',0,'replaces_estimate_minor',700000,'consumes_commitment_minor',null,'idempotency_key','native-kernel-policy','reason','Actual concurrent explicit kernel policy'),
 b.command||jsonb_build_object('expected_revision',1,'estimate_minor',1100000,'idempotency_key','native-kernel-baseline','reason','Actual concurrent manual baseline correction'),source::text);
end;$$;
commit;
