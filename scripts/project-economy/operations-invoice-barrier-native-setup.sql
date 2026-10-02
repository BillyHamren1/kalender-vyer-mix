-- ISOLATED native concurrency database ONLY. Never apply to hosted product data.
-- Requires the exact Ops foundation/review/scope/local-authority/v1/v2/barrier migrations.
\set ON_ERROR_STOP on
begin;
-- Caller must explicitly set PGOPTIONS='-c eventflow.invoice_barrier_isolated=synthetic-disposable'.
-- This guard runs before CREATE/INSERT and fails closed on any non-fixture state.
do $$begin
 if current_database() !~ '^eventflow_invoice_barrier_[a-z0-9_]+$'
  or current_setting('eventflow.invoice_barrier_isolated',true) is distinct from 'synthetic-disposable'
  or current_user <> 'postgres' or not (select rolsuper from pg_roles where rolname=current_user)
  or to_regclass('public.operations_invoice_barrier_native_fixture') is not null
  or (select count(*) from auth.users) <> 4
  or exists(select 1 from auth.users where id <> all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
  or (select count(*) from public.projects) <> 3
  or exists(select 1 from public.projects where deleted_at is not null or (id,organization_id) not in (
   ('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)))
  or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
  or exists(select 1 from public.operations_finance_invoice_streams)
  or exists(select 1 from public.operations_finance_credit_v2_streams)
  or exists(select 1 from public.operations_finance_invoice_snapshots)
  or exists(select 1 from public.operations_finance_credit_v2_snapshots)
  or exists(select 1 from public.operations_finance_invoice_receipts)
  or exists(select 1 from public.operations_finance_credit_v2_receipts)
  or exists(select 1 from public.operations_finance_invoice_enrollments)
  or exists(select 1 from public.operations_finance_credit_v2_enrollments)
  or exists(select 1 from public.operations_project_obligation_heads)
  or exists(select 1 from public.operations_project_obligation_baselines)
  or exists(select 1 from public.operations_project_obligation_invoice_bindings)
  or exists(select 1 from public.operations_project_obligation_source_ownership)
 then raise exception using errcode='22023',message='Dedicated fresh synthetic-only invoice barrier database required';end if;
end;$$;
create table public.operations_invoice_barrier_native_fixture(case_id text primary key,raw_v1 text not null,raw_v2 text not null);
grant select on public.operations_invoice_barrier_native_fixture to service_role,authenticated;
insert into public.operations_finance_invoice_enrollments(key_id,source_organization_id,destination_organization_id,enabled)
values('fixture_barrier_v1','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_invoice_project_scopes values('fixture_barrier_v1','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
insert into public.operations_finance_credit_v2_enrollments(key_id,source_organization_id,destination_organization_id,enabled)
values('fixture_barrier_v2','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_credit_v2_project_scopes values('fixture_barrier_v2','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
do $$declare invoice uuid;case_id text;p jsonb;p2 jsonb;begin
 for case_id,invoice in select * from (values('v1','23232323-2323-4232-8232-232323232323'::uuid),('v2','89898989-8989-4898-8989-898989898989'::uuid)) cases loop
 p:=jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','99999999-9999-4999-8999-999999999999','destination_organization_id','11111111-1111-4111-8111-111111111111','invoice_id',invoice,'source_revision',1,'source_publication_fingerprint',repeat('a',64),'source_observation_id','34343434-3434-4343-8343-343434343434','provider_document_number','ISOLATED-BARRIER-'||case_id,'document_fingerprint',repeat('b',64),'invoice_kind','invoice','currency','SEK','recipient_net_minor',540000,'invoice_status','in_approval','provider_source_changed',false,'accounting_state','booked','settlement_state','paid','provider_approval_state','not_pending','credit_relation_coverage','not_applicable','allocations',jsonb_build_array(jsonb_build_object('allocation_id','45454545-4545-4454-8454-454545454545','project_id','56565656-5656-4565-8565-565656565656','cost_line_id','67676767-6767-4676-8676-676767676767','destination_organization_id','11111111-1111-4111-8111-111111111111','destination_project_id','55555555-5555-4555-8555-555555555555','amount_minor',540000,'consumes_commitment',true,'status','preliminary')));
 perform public.operations_validate_finance_invoice_destination_v1(p);
 p2:=p||jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_revision',1,'source_economic_revision',1,'source_economic_publication_fingerprint',repeat('a',64),'source_publication_fingerprint',repeat('f',64),'credit_relationship_fingerprint',null,'allocations',jsonb_build_array((p#>'{allocations,0}')||jsonb_build_object('credited_source_anchor',null,'source_anchor',operations_economy_private.invoice_source_anchor_v1('99999999-9999-4999-8999-999999999999',invoice,'45454545-4545-4454-8454-454545454545',repeat('b',64),'SEK'))));
 insert into public.operations_invoice_barrier_native_fixture values(case_id,replace(p::text,': ',':'),replace(p2::text,': ',':'));end loop;end;$$;

commit;
