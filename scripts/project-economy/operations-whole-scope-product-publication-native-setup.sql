\set ON_ERROR_STOP on
-- TEST ONLY NEW PRODUCT FIXTURE: exact production receiver/baseline/binding/
-- policy/enrollment/composition calls derived from genuine 3737655 setup blob
-- 9eef2ae177ad226e96f86bfda53955ba5bc7d0ca. No old guard is altered or loaded.
-- This independent fixture is restricted to the dedicated fresh named database.
begin;
do $$begin
 if current_database() <> 'eventflow_scope_product_publication_runtime'
  or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
  or current_user <> 'postgres' or not (select rolsuper from pg_roles where rolname=current_user)
  or to_regnamespace('operations_whole_scope_product_native') is not null
  or to_regclass('public.operations_scope_invoice_kernel_native_fixture') is not null
  or (select count(*) from auth.users) <> 4
  or (select count(*) from public.profiles) <> 4 or (select count(*) from public.user_roles) <> 3
  or exists(select 1 from public.profiles where organization_id is null or (user_id,organization_id) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
   ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
  or exists(select 1 from public.user_roles where organization_id is null or (user_id,organization_id,role::text) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin')))
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
  or exists(select 1 from operations_whole_scope_publication_private.publications)
  or exists(select 1 from operations_whole_scope_publication_private.receipts)
  or exists(select 1 from operations_whole_scope_publication_private.heads)
  or exists(select 1 from operations_whole_scope_publication_private.gates)
  or exists(select 1 from public.operations_project_scope_heads) or exists(select 1 from public.operations_scope_obligation_composition_heads) or exists(select 1 from public.operations_obligation_source_policy_heads) or exists(select 1 from public.operations_invoice_obligation_kernel_read_gates) or exists(select 1 from public.operations_scope_invoice_kernel_read_gates)
 then raise exception using errcode='22023',message='Dedicated fresh synthetic-only scope invoice database required';end if;
end;$$;
create schema operations_whole_scope_product_native;
revoke all on schema operations_whole_scope_product_native from public,anon,authenticated,service_role;
create table operations_whole_scope_product_native.known_fixture(slot text primary key,read_request jsonb not null,policy_command jsonb not null,baseline_command jsonb not null,compose_command jsonb not null,enroll_command jsonb not null,raw_coequal_v2 text not null,raw_source_correction text not null,raw_second_correction text not null);
revoke all on operations_whole_scope_product_native.known_fixture from public,anon,authenticated,service_role;
create temporary table scope_invoice_input(data jsonb not null);insert into scope_invoice_input values(:'fixture'::jsonb);grant select on scope_invoice_input to authenticated,service_role;
create temporary table scope_invoice_vectors(label text primary key,evidence jsonb not null);
create function pg_temp.scope_invoice_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'scope invoice assertion failed: %',label;end if;end;$$;
insert into public.bookings values('Separate-Order-99','11111111-1111-4111-8111-111111111111',null);
update public.projects set booking_id='Separate-Order-99' where id='77777777-7777-4777-8777-777777777777';
insert into public.large_project_bookings values('14141414-1414-4414-8414-141414141414','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Separate-Order-99');
insert into public.operations_finance_invoice_enrollments values('fixture_scope_kernel','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_scope_kernel','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true),('fixture_scope_kernel','67676767-6767-4676-8676-676767676767','77777777-7777-4777-8777-777777777777',true);
insert into public.operations_finance_credit_v2_enrollments values('fixture_scope_kernel_v2','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_credit_v2_project_scopes values('fixture_scope_kernel_v2','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true),('fixture_scope_kernel_v2','67676767-6767-4676-8676-676767676767','77777777-7777-4777-8777-777777777777',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;body jsonb;r jsonb;preview jsonb;scope_command jsonb;compose jsonb;request jsonb;policies jsonb:='[]';policy jsonb;baseline_ids jsonb:='[]';refs jsonb;baseline uuid;binding uuid;snapshot uuid;allocation jsonb;project uuid;obligation uuid;v2 jsonb;source_anchor text;i int;capture jsonb;empty_request jsonb;begin
 select data into f from scope_invoice_input;
 body:=f->'invoice'||jsonb_build_object('allocations',jsonb_build_array(jsonb_set(f#>'{invoice,allocations,0}','{amount_minor}','270000'),(f#>'{invoice,allocations,0}')||jsonb_build_object('allocation_id','71717171-7171-4717-8717-717171717171','project_id','67676767-6767-4676-8676-676767676767','destination_project_id','77777777-7777-4777-8777-777777777777','cost_line_id','80808080-8080-4808-8808-808080808080','amount_minor',270000)));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_scope_kernel_split',body::text);execute 'reset role';snapshot:=(r->>'snapshot_receipt_id')::uuid;
 execute 'set local role authenticated';preview:=public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc');perform pg_temp.scope_invoice_assert(jsonb_array_length(preview#>'{membership,local_booking_ids}')=2 and jsonb_array_length(preview#>'{membership,source_project_ids}')=2,'two independent real bookings and leaves');
 scope_command:=jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','90909090-9090-4909-8909-909090909090','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint','idempotency_key','native-scope-kernel-enroll','reason','Explicit two-booking canonical owner');perform public.enroll_operations_project_scope_v1(scope_command);
 for allocation in select value from jsonb_array_elements(body->'allocations') loop
 project:=(allocation->>'destination_project_id')::uuid;obligation:=case when project='55555555-5555-4555-8555-555555555555' then 'abababab-abab-4aba-8aba-abababababab'::uuid else 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd'::uuid end;
 r:=public.append_operations_manual_obligation_baseline_v1(f->'baseline'||jsonb_build_object('project_id',project,'obligation_id',obligation,'estimate_minor',case when project='55555555-5555-4555-8555-555555555555' then 1000000 else 500000 end,'committed_minor',case when project='55555555-5555-4555-8555-555555555555' then null else 200000 end,'idempotency_key','native-scope-kernel-baseline-'||project));baseline:=(r->>'event_id')::uuid;baseline_ids:=baseline_ids||jsonb_build_array(baseline);
 r:=public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',project,'obligation_id',obligation,'expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id',allocation->'allocation_id','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','native-scope-kernel-bind-'||project,'reason','Own exact split allocation once'));binding:=(r->>'event_id')::uuid;
 policy:=jsonb_build_object('schema_version','operations-obligation-source-policy.v1','project_id',project,'obligation_id',obligation,'baseline_event_id',baseline,'binding_event_id',binding,'expected_policy_revision',0,'replaces_estimate_minor',300000,'consumes_commitment_minor',case when project='55555555-5555-4555-8555-555555555555' then null else 100000 end,'idempotency_key','native-scope-kernel-policy-'||project,'reason','Explicit planned variance and nullable policy');perform public.append_operations_obligation_source_policy_v1(policy);policies:=policies||jsonb_build_array(policy);
 end loop;
 r:=public.append_operations_manual_obligation_baseline_v1(f->'baseline'||jsonb_build_object('obligation_id','efefefef-efef-4efe-8efe-efefefefefef','category','personnel','cost_basis','time','idempotency_key','native-scope-kernel-unsupported'));baseline_ids:=baseline_ids||jsonb_build_array(r->'event_id');
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope_command->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',baseline_ids,'idempotency_key','native-scope-kernel-compose','reason','Selected current local manual obligations, no whole budget');r:=public.compose_operations_scope_obligations_v1(compose);execute 'reset role';
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id','11111111-1111-4111-8111-111111111111','economic_scope_id',scope_command->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',1,'expected_composition_fingerprint',r->'fingerprint');
 execute 'set local role service_role';begin perform public.read_operations_scope_invoice_kernel_evidence_v1(request);raise exception 'disabled scope read accepted';exception when insufficient_privilege then if sqlerrm<>'scope_invoice_read_gate_disabled' then raise;end if;end;execute 'reset role';
 insert into public.operations_scope_invoice_kernel_read_gates values('11111111-1111-4111-8111-111111111111',true);insert into public.operations_invoice_obligation_kernel_read_gates values('11111111-1111-4111-8111-111111111111',true);
 execute 'set local role service_role';capture:=public.read_operations_scope_invoice_kernel_evidence_v1(request);execute 'reset role';perform pg_temp.scope_invoice_assert(jsonb_array_length(capture->'members')=3 and jsonb_array_length(capture->'source_inventory')=2 and capture->'captured_inventory_matches_current'='true','split allocations and unknown noninvoice member captured once');insert into scope_invoice_vectors values('split_initial',capture);
 -- Add a real separately published invoice to the same selected first
 -- obligation; this gives two distinct protected invoice selectors globally.
 r:=body||jsonb_build_object('invoice_id','13131313-1313-4313-8313-131313131313','recipient_net_minor',1000,'source_publication_fingerprint',repeat('f',64),'allocations',jsonb_build_array(jsonb_set(body#>'{allocations,0}','{amount_minor}','1000')));
 execute 'set local role service_role';capture:=public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_scope_second_invoice',r::text);execute 'reset role';
 execute 'set local role authenticated';perform public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id','55555555-5555-4555-8555-555555555555','obligation_id','abababab-abab-4aba-8aba-abababababab','expected_obligation_revision',1,'source_snapshot_id',capture->'snapshot_receipt_id','source_allocation_id',body#>'{allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',repeat('f',64),'idempotency_key','native-scope-second-source-bind','reason','Actual separate invoice to prove global selector set'));execute 'reset role';
 r:=jsonb_set(r||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('8',64),'recipient_net_minor',900),'{allocations,0,amount_minor}','900');
 v2:=body||jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_economic_revision',1,'source_economic_publication_fingerprint',repeat('a',64),'source_publication_fingerprint',repeat('c',64),'credit_relationship_fingerprint',null);
 allocation:='[]';for capture in select value from jsonb_array_elements(body->'allocations') loop source_anchor:=operations_economy_private.invoice_source_anchor_v1((body->>'source_organization_id')::uuid,(body->>'invoice_id')::uuid,(capture->>'allocation_id')::uuid,body->>'document_fingerprint',body->>'currency');allocation:=allocation||jsonb_build_array(capture||jsonb_build_object('source_anchor',source_anchor,'credited_source_anchor',null));end loop;v2:=v2||jsonb_build_object('allocations',allocation);
 body:=jsonb_set(jsonb_set(body||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('d',64),'recipient_net_minor',450000),'{allocations,0,amount_minor}','200000'),'{allocations,1,amount_minor}','250000');
 insert into operations_whole_scope_product_native.known_fixture values('only',request,policies->0||jsonb_build_object('expected_policy_revision',1,'replaces_estimate_minor',350000,'idempotency_key','native-whole-scope-new-policy'),f->'baseline'||jsonb_build_object('expected_revision',1,'estimate_minor',1100000,'idempotency_key','native-whole-scope-new-baseline'),compose,scope_command,v2::text,body::text,r::text);
end;$$;
commit;

-- Independent unknown manual-baseline fixture, genuine permission setup blob
-- 58133640f070a5536aa94f59e1e660cadfb756a5. No TRY/TEST money ledger is installed.
begin;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or (select count(*) from operations_whole_scope_product_native.known_fixture)<>1
 or (select count(*) from public.operations_project_scope_heads)<>1
 or exists(select 1 from operations_whole_scope_publication_private.publications)
 or exists(select 1 from operations_whole_scope_publication_private.receipts)
 or exists(select 1 from operations_whole_scope_publication_private.heads)
 then raise exception 'fresh_product_unknown_fixture_required' using errcode='22023';end if;
end;$$;
-- The production FK and unique tuple are exact-pin audited, not a new product policy.
-- Exact FK/index prerequisite is installed by the independent guarded
-- native bootstrap before compatible130228 is compiled.
create table operations_whole_scope_product_native.unknown_fixture(
 slot text primary key check(slot='only'),read_request jsonb not null,enroll_command jsonb not null,
 compose_command jsonb not null,baseline_command jsonb not null,baseline_event_id uuid not null
);
revoke all on operations_whole_scope_product_native.unknown_fixture from public,anon,authenticated,service_role;
insert into public.bookings values('native-permission-booking','11111111-1111-4111-8111-111111111111',null);
insert into public.projects(id,organization_id,deleted_at,booking_id) values('64646464-6464-4646-8646-646464646464','11111111-1111-4111-8111-111111111111',null,'native-permission-booking');
insert into public.packing_projects values('65656565-6565-4656-8656-656565656565','11111111-1111-4111-8111-111111111111','native-permission-booking',null,'planning');
insert into public.packing_project_bookings values('69696969-6969-4696-8696-696969696969','11111111-1111-4111-8111-111111111111','65656565-6565-4656-8656-656565656565','native-permission-booking');
insert into public.operations_project_scope_packing_policies values('11111111-1111-4111-8111-111111111111','planning',true),('11111111-1111-4111-8111-111111111111','ready',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare baseline jsonb;enroll jsonb;compose jsonb;preview jsonb;result jsonb;request jsonb;event uuid;capture jsonb;begin
 baseline:=jsonb_build_object('schema_version','operations-obligation-manual-baseline.v1','project_id','64646464-6464-4646-8646-646464646464','obligation_id','68686868-6868-4686-8686-686868686868','expected_revision',0,'currency','SEK','category','supplier','cost_basis','invoice','estimate_minor',null,'committed_minor',null,'idempotency_key','native-permission-unknown-baseline','reason','Explicit unknown manual baseline for isolated permission proof');
 execute 'set local role authenticated';
 result:=public.append_operations_manual_obligation_baseline_v1(baseline);
 if result->>'outcome' is distinct from 'accepted' or result->'revision' is distinct from '1'::jsonb then raise exception 'permission_actual_baseline_required' using errcode='22023';end if;
 event:=(result->>'event_id')::uuid;
 preview:=public.preview_operations_project_scope_v1('packing_project','65656565-6565-4656-8656-656565656565');
 if preview#>'{membership,source_project_ids}' is distinct from '["64646464-6464-4646-8646-646464646464"]'::jsonb
 or preview#>'{membership,local_booking_ids}' is distinct from '["native-permission-booking"]'::jsonb
 or preview#>>'{membership,root_evidence,status}' is distinct from 'planning'
 then raise exception 'permission_independent_packing_graph_required' using errcode='22023';end if;
 enroll:=jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','67676767-6767-4676-8676-676767676767','root_kind','packing_project','root_id','65656565-6565-4656-8656-656565656565','expected_revision',0,'expected_membership_fingerprint',preview->'membership_fingerprint','idempotency_key','native-permission-independent-scope','reason','Explicit independent packing membership without prices');
 result:=public.enroll_operations_project_scope_v1(enroll);
 if result->>'outcome' is distinct from 'accepted' or result->'scope_revision' is distinct from '1'::jsonb then raise exception 'permission_actual_enrollment_required' using errcode='22023';end if;
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',enroll->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(event),'idempotency_key','native-permission-unknown-composition','reason','Capture unknown manual source-free obligation explicitly');
 result:=public.compose_operations_scope_obligations_v1(compose);execute 'reset role';
 if result->>'outcome' is distinct from 'accepted' or result->'composition_revision' is distinct from '1'::jsonb then raise exception 'permission_actual_composition_required' using errcode='22023';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id','11111111-1111-4111-8111-111111111111','economic_scope_id',enroll->'economic_scope_id','expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',1,'expected_composition_fingerprint',result->'fingerprint');
 execute 'set local role service_role';capture:=public.read_operations_scope_invoice_kernel_evidence_v1(request);execute 'reset role';
 if jsonb_array_length(capture->'members')<>1 or capture->'source_inventory' is distinct from '[]'::jsonb
 or capture->'source_coverage' is distinct from '"unavailable"'::jsonb
 or capture->'remaining_minor' is distinct from 'null'::jsonb or capture->'eac_minor' is distinct from 'null'::jsonb
 or capture->'budget_minor' is distinct from 'null'::jsonb or capture->'credit_eligible' is distinct from 'false'::jsonb
 or capture#>'{members,0,kernel_evidence,baseline,estimate_minor}' is distinct from 'null'::jsonb
 or capture#>'{members,0,kernel_evidence,baseline,committed_minor}' is distinct from 'null'::jsonb
 then raise exception 'permission_unknown_cost_must_remain_unavailable' using errcode='22023';end if;
 insert into operations_whole_scope_product_native.unknown_fixture values('only',request,enroll,compose,baseline,event);
end;$$;

-- Fixed read-only TEST selector adapters let the frozen genuine-role fixture
-- consume actual requests without weakening its independent namedDB guard.
create view public.operations_scope_invoice_kernel_native_fixture as
 select * from operations_whole_scope_product_native.known_fixture;
create schema operations_scope_reader_permission_native;
revoke all on schema operations_scope_reader_permission_native from public,anon,authenticated,service_role;
create view operations_scope_reader_permission_native.fixture as
 select * from operations_whole_scope_product_native.unknown_fixture;
revoke all on public.operations_scope_invoice_kernel_native_fixture from public,anon,authenticated,service_role;
revoke all on operations_scope_reader_permission_native.fixture from public,anon,authenticated,service_role;
commit;
