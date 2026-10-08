\set ON_ERROR_STOP on
-- Dedicated guarded disposable native seed; fixture commits only in isolated CI DB.
begin;
do $$begin
 if current_database()<>'operations_hired_authority_runtime'
  or current_setting('test.hired_personnel_isolated',true) is distinct from 'synthetic-disposable'
  or current_user <> 'postgres' or not (select rolsuper from pg_roles where rolname=current_user)
  or to_regclass('public.operations_hired_native_fixture') is not null
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
  or exists(select 1 from public.operations_project_scope_heads) or exists(select 1 from public.operations_scope_obligation_composition_heads) or exists(select 1 from public.operations_obligation_source_policy_heads) or exists(select 1 from public.operations_invoice_obligation_kernel_read_gates)
 or exists(select 1 from public.operations_hired_basis_events) or exists(select 1 from public.operations_hired_assignment_events) or exists(select 1 from public.operations_hired_source_ownership) or exists(select 1 from public.operations_personnel_cost_streams) or exists(select 1 from public.operations_personnel_cost_outbox)
 then raise exception using errcode='22023',message='Dedicated fresh synthetic-only hired database required';end if;
end;$$;
create table public.operations_hired_native_fixture(slot text primary key,personnel jsonb not null,proof jsonb not null,assignment jsonb not null,contender jsonb not null,basis jsonb not null,source_identity text not null);
grant select on public.operations_hired_native_fixture to authenticated,service_role;
create temporary table hired_native_input(data jsonb not null);insert into hired_native_input values(:'fixture'::jsonb);
insert into public.operations_hired_authority_gates values('11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_invoice_enrollments values('fixture_hired_native','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_hired_native','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;p jsonb;invoice jsonb;baseline jsonb;receipt jsonb;binding uuid;basis_event uuid;baseline_event uuid;proof jsonb;command jsonb;basis_command jsonb;commands jsonb:='[]';i int;obligation uuid;snapshot uuid;begin
 select data into strict f from hired_native_input;p:=f->'personnel';
 proof:=jsonb_build_object('schema','operations-personnel-source-evidence-v1','personnel_id','99999999-9999-4999-8999-999999999999','source_system','planning','external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',0,'project_review_status','preliminary','raw_snapshot',(p->'raw')::text,'raw_snapshot_sha256',encode(sha256(convert_to((p->'raw')::text,'UTF8')),'hex'),'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
 execute 'set local role service_role';perform public.publish_operations_personnel_cost_outbox_v1(p->'initial',p->'raw',proof,0,'hired-native-source-initial');execute 'reset role';
 for i in 1..2 loop
 obligation:=case when i=1 then 'abababab-abab-4aba-8aba-abababababab'::uuid else 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd'::uuid end;
 invoice:=f#>'{obligation,invoice}';if i=2 then invoice:=invoice||jsonb_build_object('invoice_id','71717171-7171-4717-8717-717171717171','source_publication_fingerprint',repeat('7',64),'document_fingerprint',repeat('8',64),'allocations',jsonb_build_array(invoice#>'{allocations,0}'||jsonb_build_object('allocation_id','81818181-8181-4818-8818-818181818181')));end if;
 execute 'set local role service_role';receipt:=public.operations_receive_finance_project_invoice_destination_v1('fixture_hired_native',floor(extract(epoch from clock_timestamp()))::bigint::text,'hired_native_invoice_'||i,invoice::text);execute 'reset role';snapshot:=(receipt->>'snapshot_receipt_id')::uuid;
 baseline:=(f#>'{obligation,baseline}')||jsonb_build_object('category','personnel','obligation_id',obligation,'idempotency_key','hired-native-baseline-'||i);
 execute 'set local role authenticated';receipt:=public.append_operations_manual_obligation_baseline_v1(baseline);baseline_event:=(receipt->>'event_id')::uuid;
 receipt:=public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',baseline->'project_id','obligation_id',obligation,'expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id',invoice#>>'{allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',invoice->>'source_publication_fingerprint','idempotency_key','hired-native-binding-'||i,'reason','Actual separate original invoice authority'));binding:=(receipt->>'event_id')::uuid;
 basis_command:=jsonb_build_object('schema_version','operations-hired-basis.v1','project_id',baseline->'project_id','obligation_id',obligation,'baseline_event_id',baseline_event,'expected_obligation_revision',1,'expected_basis_revision',0,'cost_basis','invoice','evidence_sha256',repeat('c',64),'idempotency_key','hired-native-basis-'||i,'reason','Explicit isolated unchanged invoice basis');
 receipt:=public.append_operations_hired_basis_v1(basis_command);basis_event:=(receipt->>'event_id')::uuid;execute 'reset role';
 command:=jsonb_build_object('schema_version','operations-hired-operational-source-assign.v1','project_id',baseline->'project_id','obligation_id',obligation,'basis_event_id',basis_event,'expected_assignment_revision',0,'source_kind','time','source_stream_id',p#>>'{initial,source_time_stream_id}','source_revision',1,'source_line_id',p#>>'{initial,lines,0,source_time_line_id}','expected_source_fingerprint',f#>>'{fingerprints,initial}','invoice_binding_event_id',binding,'replaces_estimate_minor',0,'consumes_commitment_minor',0,'idempotency_key','hired-native-assignment-'||i,'reason','Retain source without second charge');commands:=commands||jsonb_build_array(command);
 if i=1 then insert into public.operations_hired_native_fixture values('only',p,proof,command,command,basis_command,operations_hired_private.source_identity_v1('11111111-1111-4111-8111-111111111111','time',p#>>'{initial,source_time_stream_id}',p#>>'{initial,lines,0,source_time_line_id}'));end if;
 end loop;
 update public.operations_hired_native_fixture set contender=commands->1;
end;$$;
commit;
