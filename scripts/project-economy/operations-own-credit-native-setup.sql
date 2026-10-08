-- ISOLATED native concurrency database ONLY. Never apply to hosted product data.
-- Requires the exact Ops foundation/review/scope/local-authority/v1/v2/barrier migrations.
\set ON_ERROR_STOP on
begin;
-- Caller must explicitly set PGOPTIONS='-c eventflow.own_credit_isolated=synthetic-disposable'.
-- This guard runs before CREATE/INSERT and fails closed on any non-fixture state.
do $$begin
 if current_database() !~ '^eventflow_own_credit_[a-z0-9_]+$'
  or current_setting('eventflow.own_credit_isolated',true) is distinct from 'synthetic-disposable'
  or current_user <> 'postgres' or not (select rolsuper from pg_roles where rolname=current_user)
  or to_regclass('public.operations_own_credit_native_fixture') is not null
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
  or exists(select 1 from public.operations_obligation_credit_assignment_heads)
  or exists(select 1 from public.operations_obligation_credit_assignments)
 then raise exception using errcode='22023',message='Dedicated fresh synthetic-only own credit database required';end if;
end;$$;
create table public.operations_own_credit_native_fixture(slot text primary key,command jsonb not null,source_anchor text not null,raw_credit_v1 text not null,raw_original_v2 text not null);
grant select on public.operations_own_credit_native_fixture to authenticated,service_role;
create temporary table own_credit_native_input(data jsonb not null);
insert into own_credit_native_input values(:'fixture'::jsonb);
grant select on own_credit_native_input to authenticated,service_role;
insert into public.operations_finance_invoice_enrollments(key_id,source_organization_id,destination_organization_id,enabled) values('fixture_credit_native_v1','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_invoice_project_scopes values('fixture_credit_native_v1','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
insert into public.operations_finance_credit_v2_enrollments(key_id,source_organization_id,destination_organization_id,enabled) values('fixture_credit_native_v2','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_credit_v2_project_scopes values('fixture_credit_native_v2','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;credit jsonb;original_v2 jsonb;r jsonb;baseline jsonb;binding uuid;original_snapshot uuid;credit_snapshot uuid;anchor text;command jsonb;begin
 select data into f from own_credit_native_input;
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_credit_native_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_credit_original_seed',f->>'rawInvoice');execute 'reset role';original_snapshot:=(r->>'snapshot_receipt_id')::uuid;
 credit:=f->'invoice'||jsonb_build_object('schema_version','finance-project-invoice-destination-v2','invoice_id','89898989-8989-4898-8989-898989898989','invoice_kind','credit','document_fingerprint',repeat('c',64),'recipient_net_minor',-50000,'source_revision',1,'source_economic_revision',1,'source_economic_publication_fingerprint',repeat('d',64),'source_publication_fingerprint',repeat('e',64),'credit_relation_coverage','linked','credit_relationship_fingerprint',repeat('f',64));
 anchor:=operations_economy_private.invoice_source_anchor_v1('99999999-9999-4999-8999-999999999999','89898989-8989-4898-8989-898989898989',(f#>>'{invoice,allocations,0,allocation_id}')::uuid,repeat('c',64),'SEK');
 credit:=credit||jsonb_build_object('allocations',jsonb_build_array((f#>'{invoice,allocations,0}')||jsonb_build_object('amount_minor',-50000,'source_anchor',anchor,'credited_source_anchor',f->>'anchor')));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_native_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_credit_negative_seed',credit::text);execute 'reset role';credit_snapshot:=(r->>'snapshot_receipt_id')::uuid;
 execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(f->'baseline');
 r:=public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',f#>>'{baseline,project_id}','obligation_id',f#>>'{baseline,obligation_id}','expected_obligation_revision',1,'source_snapshot_id',original_snapshot,'source_allocation_id',f#>>'{invoice,allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','native-credit-positive-binding','reason','Explicit isolated native original ownership'));execute 'reset role';binding:=(r->>'event_id')::uuid;
 command:=jsonb_build_object('schema_version','operations-obligation-credit-assign.v1','project_id',f#>>'{baseline,project_id}','obligation_id',f#>>'{baseline,obligation_id}','expected_baseline_revision',1,'credit_snapshot_id',credit_snapshot,'credit_allocation_id',f#>>'{invoice,allocations,0,allocation_id}','expected_credit_economic_revision',1,'expected_credit_economic_fingerprint',repeat('d',64),'expected_original_binding_event_id',binding,'expected_assignment_revision',0,'idempotency_key','native-credit-first-assignment','reason','Actual native authenticated own credit ownership');
 original_v2:=f->'invoice'||jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_economic_revision',1,'source_economic_publication_fingerprint',repeat('a',64),'source_publication_fingerprint',repeat('7',64),'credit_relationship_fingerprint',null,'allocations',jsonb_build_array((f#>'{invoice,allocations,0}')||jsonb_build_object('source_anchor',f->>'anchor','credited_source_anchor',null)));
 insert into public.operations_own_credit_native_fixture values('only',command,anchor,(credit-array['source_economic_revision','source_economic_publication_fingerprint','credit_relationship_fingerprint']||jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_publication_fingerprint',repeat('d',64),'credit_relation_coverage','unresolved','allocations',jsonb_build_array((credit#>'{allocations,0}')-array['source_anchor','credited_source_anchor'])))::text,original_v2::text);
end;$$;
commit;
