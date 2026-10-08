\set ON_ERROR_STOP on
-- ONLY after guarded own-credit native seed on a fresh disposable capacity DB.
begin;
do $$begin
 if current_database() !~ '^eventflow_own_credit_capacity_[a-z0-9_]+$' or current_setting('eventflow.credit_capacity_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('public.operations_credit_capacity_native_fixture') is not null
 or (select count(*) from auth.users)<>4 or exists(select 1 from auth.users where id<>all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
 or (select count(*) from public.projects)<>3 or exists(select 1 from public.projects where deleted_at is not null or (id,organization_id) not in (('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)))
 or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 or (select count(*) from public.operations_own_credit_native_fixture)<>1
 or (select count(*) from public.operations_finance_invoice_streams)<>1 or exists(select 1 from public.operations_finance_invoice_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or source_organization_id<>'99999999-9999-4999-8999-999999999999' or invoice_id<>'23232323-2323-4232-8232-232323232323' or current_revision<>1)
 or (select count(*) from public.operations_finance_credit_v2_streams)<>1 or exists(select 1 from public.operations_finance_credit_v2_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or source_organization_id<>'99999999-9999-4999-8999-999999999999' or invoice_id<>'89898989-8989-4898-8989-898989898989' or current_revision<>1)
 or (select count(*) from public.operations_project_obligation_heads)<>1 or (select count(*) from public.operations_project_obligation_baselines)<>1 or (select count(*) from public.operations_project_obligation_invoice_bindings)<>1
 or exists(select 1 from public.operations_obligation_credit_assignments) or exists(select 1 from public.operations_obligation_credit_capacity_gates) or exists(select 1 from public.operations_obligation_credit_capacity_heads) or exists(select 1 from public.operations_obligation_credit_capacity_events)
 then raise exception 'Fresh dedicated synthetic capacity seed required' using errcode='22023';end if;
end;$$;
create table public.operations_credit_capacity_native_fixture(slot text primary key,command jsonb not null,source_anchor text not null,raw_original_lower text not null);
grant select on public.operations_credit_capacity_native_fixture to authenticated,service_role;
insert into public.operations_obligation_credit_capacity_gates values('11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare source_command jsonb;r jsonb;p jsonb;original jsonb;anchor text;source_snapshot uuid;begin
 select f.command into source_command from public.operations_own_credit_native_fixture f;
 select envelope into original from public.operations_finance_invoice_snapshots where invoice_id='23232323-2323-4232-8232-232323232323';
 original:=jsonb_set(original||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('5',64),'recipient_net_minor',400000),'{allocations,0,amount_minor}','400000');
 execute 'set local role authenticated';r:=public.assign_operations_obligation_own_credit_v1(source_command);execute 'reset role';
 insert into public.operations_credit_capacity_native_fixture select 'first',jsonb_build_object('schema_version','operations-obligation-credit-capacity.v1','project_id',source_command->'project_id','obligation_id',source_command->'obligation_id','assignment_event_id',r->'event_id','expected_capacity_revision',0,'idempotency_key','native-capacity-first-reservation','reason','Actual first credit capacity reservation'),f.source_anchor,original::text from public.operations_own_credit_native_fixture f;
 select envelope into p from public.operations_finance_credit_v2_snapshots where invoice_id='89898989-8989-4898-8989-898989898989';
 anchor:=operations_economy_private.invoice_source_anchor_v1('99999999-9999-4999-8999-999999999999','78787878-7878-4787-8787-787878787878',(p#>>'{allocations,0,allocation_id}')::uuid,p->>'document_fingerprint','SEK');
 p:=jsonb_set(p||jsonb_build_object('invoice_id','78787878-7878-4787-8787-787878787878','recipient_net_minor',-500000),'{allocations,0}',(p#>'{allocations,0}')||jsonb_build_object('source_anchor',anchor,'amount_minor',-500000));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_native_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_capacity_second_source',p::text);execute 'reset role';source_snapshot:=(r->>'snapshot_receipt_id')::uuid;
 execute 'set local role authenticated';r:=public.assign_operations_obligation_own_credit_v1(source_command||jsonb_build_object('credit_snapshot_id',source_snapshot,'idempotency_key','native-capacity-second-assignment'));execute 'reset role';
 insert into public.operations_credit_capacity_native_fixture values('second',jsonb_build_object('schema_version','operations-obligation-credit-capacity.v1','project_id',source_command->'project_id','obligation_id',source_command->'obligation_id','assignment_event_id',r->'event_id','expected_capacity_revision',0,'idempotency_key','native-capacity-second-reservation','reason','Actual second credit capacity reservation'),anchor,original::text);
end;$$;
commit;
