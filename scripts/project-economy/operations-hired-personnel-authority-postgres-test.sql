-- Disposable SQL authority test, not source Auth/UI or human attest proof.
-- Prerequisites: actual audited bootstrap/DDL + operations-transport-seed.sql.
-- test.hired_personnel_fixture JSON {personnel:<actual operations-fixture.ts>,obligation:<actual operations-obligation-fixture.ts>}
begin;
do $$begin if current_database()<>'operations_hired_authority_runtime' or current_setting('test.hired_personnel_isolated',true) is distinct from 'synthetic-disposable' then raise exception 'hired_disposable_fixture_required' using errcode='42501';end if;
 if exists(select 1 from public.operations_hired_basis_events) or exists(select 1 from public.operations_hired_assignment_events) then raise exception 'fresh_hired_domain_required' using errcode='55000';end if;end;$$;
create temporary table hired_fixture(data jsonb not null);
insert into hired_fixture values(current_setting('test.hired_personnel_fixture')::jsonb);
grant select on hired_fixture to authenticated,service_role;
create function pg_temp.hired_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'hired assertion failed: %',label;end if;end;$$;
select pg_temp.hired_assert(operations_hired_private.source_identity_v1('11111111-1111-4111-8111-111111111111','time','stream:a','b')='780d88d0a0f0937c7ec20bf9ca1d2bd48447dbc7b36afa4d55b7114b3de63671','SQL/TS source identity exact purpose vector');
select pg_temp.hired_assert(operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','time','{"😀":2,"":1,"status":"preliminary","amount_minor":60000,"source_revision":1}'::jsonb))='5046393e816c97b803c2d0c92b727666d4b0412ccafcb6117fa21326a0c0232b','SQL/TS full publication UTF8 ordering vector');
insert into public.operations_hired_authority_gates values('11111111-1111-4111-8111-111111111111',false);
insert into public.operations_finance_invoice_enrollments values('fixture_hired_invoice','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_hired_invoice','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;personnel jsonb;invoice jsonb;baseline jsonb;binding jsonb;basis_command jsonb;assignment jsonb;basis jsonb;r jsonb;readback jsonb;proof jsonb;source_fp text;source_identity text;source_line text;baseline_id uuid;binding_id uuid;cost_before jsonb;begin
 select data into strict f from hired_fixture;personnel:=f->'personnel';invoice:=f#>'{obligation,invoice}';baseline:=(f#>'{obligation,baseline}')||'{"category":"personnel","idempotency_key":"hired-native-baseline"}';
 execute 'set local role service_role';
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_hired_invoice',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_hired_original_nonce',invoice::text);
 perform pg_temp.hired_assert(r->>'outcome'='accepted','actual invoice receiver');
 proof:=jsonb_build_object('schema','operations-personnel-source-evidence-v1','personnel_id','99999999-9999-4999-8999-999999999999','source_system','planning','external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',0,'project_review_status','preliminary','raw_snapshot',(personnel->'raw')::text,'raw_snapshot_sha256',encode(sha256(convert_to((personnel->'raw')::text,'UTF8')),'hex'),'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
 perform public.publish_operations_personnel_cost_outbox_v1(personnel->'initial',personnel->'raw',proof,0,'hired-actual-time-initial');
 execute 'reset role';execute 'set local role authenticated';
 r:=public.append_operations_manual_obligation_baseline_v1(baseline);baseline_id:=(r->>'event_id')::uuid;
 -- Snapshot selector is read by the fixture owner; authority still derives actual actor and all money.
 execute 'reset role';select id into binding_id from public.operations_finance_invoice_snapshots where invoice_id=(invoice->>'invoice_id')::uuid;
 execute 'set local role authenticated';
 binding:=jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',baseline->>'project_id','obligation_id',baseline->>'obligation_id','expected_obligation_revision',1,'source_snapshot_id',binding_id,'source_allocation_id',invoice#>>'{allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',invoice->>'source_publication_fingerprint','idempotency_key','hired-actual-invoice-binding','reason','Actual isolated positive original');
 r:=public.bind_operations_invoice_obligation_v1(binding);binding_id:=(r->>'event_id')::uuid;
 basis_command:=jsonb_build_object('schema_version','operations-hired-basis.v1','project_id',baseline->>'project_id','obligation_id',baseline->>'obligation_id','baseline_event_id',baseline_id,'expected_obligation_revision',1,'expected_basis_revision',0,'cost_basis','invoice','evidence_sha256',repeat('c',64),'idempotency_key','hired-basis-invoice-one','reason','Explicit isolated invoice basis');
 begin perform public.append_operations_hired_basis_v1(basis_command);raise exception 'default off accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';update public.operations_hired_authority_gates set enabled=true;execute 'set local role authenticated';
 execute 'reset role';perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.append_operations_hired_basis_v1(basis_command);raise exception 'project-role actor classified hired basis';exception when insufficient_privilege then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.append_operations_hired_basis_v1(basis_command);raise exception 'foreign admin classified hired basis';exception when insufficient_privilege then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.append_operations_hired_basis_v1(basis_command||'{"cost_basis":"time"}');raise exception 'baseline basis overridden';exception when invalid_parameter_value then null;end;
 basis:=public.append_operations_hired_basis_v1(basis_command);perform pg_temp.hired_assert(basis->>'outcome'='accepted','basis actual authenticated actor');
 perform pg_temp.hired_assert(public.append_operations_hired_basis_v1(basis_command)->>'historical_only'='true','basis replay historical only');
 source_line:=personnel#>>'{initial,lines,0,source_time_line_id}';
 execute 'reset role';source_fp:=operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','time',personnel->'initial'));
 source_identity:=operations_hired_private.source_identity_v1('11111111-1111-4111-8111-111111111111','time',personnel#>>'{initial,source_time_stream_id}',source_line);
 select cost_snapshot into cost_before from public.operations_personnel_cost_publications where source_revision=1;
 execute 'set local role authenticated';
 assignment:=jsonb_build_object('schema_version','operations-hired-operational-source-assign.v1','project_id',baseline->>'project_id','obligation_id',baseline->>'obligation_id','basis_event_id',basis->>'event_id','expected_assignment_revision',0,'source_kind','time','source_stream_id',personnel#>>'{initial,source_time_stream_id}','source_revision',1,'source_line_id',source_line,'expected_source_fingerprint',source_fp,'invoice_binding_event_id',binding_id,'replaces_estimate_minor',0,'consumes_commitment_minor',0,'idempotency_key','hired-actual-time-assignment','reason','Retain time evidence without second economic charge');
 for r in select value from jsonb_array_elements(jsonb_build_array(assignment||'{"actor":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',assignment||'{"replaces_estimate_minor":null}',assignment||'{"consumes_commitment_minor":1}')) loop
 begin perform public.assign_operations_hired_operational_source_v1(r);raise exception 'injected policy accepted';exception when invalid_parameter_value then null;end;end loop;
 begin perform public.assign_operations_hired_operational_source_v1(assignment||jsonb_build_object('source_kind','catering','source_line_id',replace('00000000-0000-4000-8000-000000000042','-','')));raise exception 'compact UUID direct RPC accepted';exception when invalid_parameter_value then null;end;
 r:=public.assign_operations_hired_operational_source_v1(assignment);perform pg_temp.hired_assert(r->>'outcome'='accepted','Time source assignment');
 execute 'reset role';update public.projects set deleted_at=clock_timestamp() where id='55555555-5555-4555-8555-555555555555';execute 'set local role authenticated';
 begin perform public.assign_operations_hired_operational_source_v1(assignment);raise exception 'deleted actual project replay authorized';exception when insufficient_privilege then null;end;
 execute 'reset role';update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555';execute 'set local role authenticated';
 perform pg_temp.hired_assert(public.assign_operations_hired_operational_source_v1(assignment)->>'historical_only'='true','assignment exact retry not activation');
 begin perform public.assign_operations_hired_operational_source_v1(assignment||'{"idempotency_key":"hired-new-stale-cas"}');raise exception 'stale CAS accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.assign_operations_hired_operational_source_v1(assignment||'{"reason":"Changed same key audit"}');raise exception 'changed retry accepted';exception when unique_violation then null;end;
 execute 'reset role';execute 'set local role service_role';
 readback:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111',(baseline->>'project_id')::uuid,(baseline->>'obligation_id')::uuid,source_identity);
 perform pg_temp.hired_assert(readback->>'state'='current_operational_only' and readback#>>'{current_source,amount_minor}'='60000' and readback->>'replaces_estimate_minor'='0' and readback->>'consumes_commitment_minor'='0' and readback->'eac_minor'='null'::jsonb,'actual copied metadata and 0/0, no EAC');
 begin perform public.append_operations_hired_basis_v1(basis_command);raise exception 'service actor surrogate accepted';exception when insufficient_privilege then null;end;
 begin insert into public.operations_hired_assignment_heads values('11111111-1111-4111-8111-111111111111',repeat('f',64),1);raise exception 'service direct head write accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';perform pg_temp.hired_assert((select cost_snapshot=cost_before from public.operations_personnel_cost_publications where source_revision=1),'metadata did not change actual cost');
 perform pg_temp.hired_assert((select count(*)=1 from public.operations_finance_invoice_snapshots),'one retained actual invoice');
 -- Actual full stream replacement, not a synthetic head update.
 execute 'set local role service_role';
 proof:=proof||jsonb_build_object('raw_snapshot',(personnel->'rawCorrection')::text,'raw_snapshot_sha256',encode(sha256(convert_to((personnel->'rawCorrection')::text,'UTF8')),'hex'));
 perform public.publish_operations_personnel_cost_outbox_v1((personnel->'corrected')||'{"source_revision":2}',personnel->'rawCorrection',proof,1,'hired-actual-time-correction');
 readback:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111',(baseline->>'project_id')::uuid,(baseline->>'obligation_id')::uuid,source_identity);
 perform pg_temp.hired_assert(readback->>'state'='unresolved' and readback->'current_source'='null'::jsonb and readback#>>'{historical_source,amount_minor}'='60000','actual correction invalidates assignment without erasing historical time');
 execute 'reset role';execute 'set local role authenticated';
 perform pg_temp.hired_assert(public.assign_operations_hired_operational_source_v1(assignment)->>'historical_only'='true','stale replay cannot reactivate');
 execute 'reset role';source_fp:=operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','time',(personnel->'corrected')||'{"source_revision":2}'));
 execute 'set local role authenticated';
 assignment:=assignment||jsonb_build_object('expected_assignment_revision',1,'source_revision',2,'expected_source_fingerprint',source_fp,'idempotency_key','hired-correction-revalidation');
 r:=public.assign_operations_hired_operational_source_v1(assignment);perform pg_temp.hired_assert(r->>'revision'='2','explicit current correction revalidation');
 execute 'reset role';execute 'set local role service_role';
 readback:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111',(baseline->>'project_id')::uuid,(baseline->>'obligation_id')::uuid,source_identity);
 perform pg_temp.hired_assert(readback#>>'{current_source,amount_minor}'='45000' and readback->>'state'='current_operational_only','corrected amount copied only after explicit revalidation');
 execute 'reset role';
end;$$;
reset role;
-- Actual native Catering publisher, including an unpriced historical interval.
insert into public.operations_catering_publish_gates values('11111111-1111-4111-8111-111111111111',true);
insert into public.operations_catering_source_bindings values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','00000000-0000-4000-8000-000000000039','00000000-0000-4000-8000-000000000040','https://catering.example/api/project-economy-read','hired-catering-fixture',true);
insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
values('00000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','00000000-0000-4000-8000-000000000039','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000043','2026-08-30','Europe/Stockholm','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab','SEK','hired-catering-map',true);
do $$declare entry jsonb:=jsonb_build_object('id','00000000-0000-4000-8000-000000000042','organization_id','00000000-0000-4000-8000-000000000039','person_id','00000000-0000-4000-8000-000000000040','workplace_id','00000000-0000-4000-8000-000000000043','started_at','2026-08-30T08:00:00Z','ended_at','2026-08-30T10:00:00Z','break_minutes',0,'status','pending','approved_by',null,'approved_at',null,'version',1,'source','manual');
 snapshot jsonb;fp text;identity text;assignment jsonb;basis uuid;binding uuid;r jsonb;begin
 snapshot:=jsonb_build_object('schema_version','operations-catering-personnel-v1','calculation_version','operations-personnel-cost.v1.half-up','organization_id','11111111-1111-4111-8111-111111111111','worker_id','44444444-4444-4444-8444-444444444444','project_id','55555555-5555-4555-8555-555555555555','obligation_id','abababab-abab-4aba-8aba-abababababab','currency','SEK','work_date','2026-08-30','time_zone','Europe/Stockholm','mapping_revision','hired-catering-map','source_organization_id','00000000-0000-4000-8000-000000000039','source_person_id','00000000-0000-4000-8000-000000000040','source_time_entry_id',entry->>'id','source_time_entry_version',1,'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(entry),'UTF8')),'hex'),'source_review_id',null,'source_review_fingerprint',null,'source_status','pending','publication_revision',1,'project_review_status','preliminary','minutes',120,'rate_revision',null,'hourly_rate_minor',null,'amount_minor',null,'coverage','missing_rate');
 execute 'set local role service_role';r:=public.publish_operations_catering_cost_v1(snapshot,entry::text,null,'00000000-0000-4000-8000-000000000041',repeat('d',64),0,'hired-actual-catering-source');
 perform pg_temp.hired_assert(r->>'outcome'='accepted','actual Catering publisher preserves missing rate');execute 'reset role';
 fp:=operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','catering',snapshot));
 identity:=operations_hired_private.source_identity_v1('11111111-1111-4111-8111-111111111111','catering','catering:00000000-0000-4000-8000-000000000039:00000000-0000-4000-8000-000000000042',entry->>'id');
 select event_id into strict basis from public.operations_hired_basis_events;select event_id into strict binding from public.operations_project_obligation_invoice_bindings;
 assignment:=jsonb_build_object('schema_version','operations-hired-operational-source-assign.v1','project_id','55555555-5555-4555-8555-555555555555','obligation_id','abababab-abab-4aba-8aba-abababababab','basis_event_id',basis,'expected_assignment_revision',0,'source_kind','catering','source_stream_id','catering:00000000-0000-4000-8000-000000000039:00000000-0000-4000-8000-000000000042','source_revision',1,'source_line_id',entry->>'id','expected_source_fingerprint',fp,'invoice_binding_event_id',binding,'replaces_estimate_minor',0,'consumes_commitment_minor',0,'idempotency_key','hired-catering-assignment','reason','Explicit operational-only missing-rate evidence');
 execute 'set local role authenticated';perform public.assign_operations_hired_operational_source_v1(assignment);execute 'reset role';execute 'set local role service_role';
 r:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',identity);
 perform pg_temp.hired_assert(r->>'state'='current_operational_only' and r#>'{current_source,amount_minor}'='null'::jsonb and r#>>'{current_source,coverage}'='missing_rate' and r->'eac_minor'='null'::jsonb,'missing monetary evidence never becomes zero');
 entry:=entry||'{"status":"rejected","version":2}';snapshot:=snapshot||jsonb_build_object('source_status','rejected','project_review_status','rejected','source_time_entry_version',2,'publication_revision',2,'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(entry),'UTF8')),'hex'));
 perform public.publish_operations_catering_cost_v1(snapshot,entry::text,null,'00000000-0000-4000-8000-000000000041',repeat('d',64),1,'hired-catering-rejected-source');
 r:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',identity);
 perform pg_temp.hired_assert(r->>'state'='unresolved' and r->'current_source'='null'::jsonb,'actual globally rejected Catering cannot remain current');execute 'reset role';
 fp:=operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1','catering',snapshot));assignment:=assignment||jsonb_build_object('source_revision',2,'expected_assignment_revision',1,'expected_source_fingerprint',fp,'idempotency_key','hired-catering-rejected-denial');
 execute 'set local role authenticated';begin perform public.assign_operations_hired_operational_source_v1(assignment);raise exception 'globally rejected Catering assigned';exception when insufficient_privilege then null;end;execute 'reset role';
end;$$;
-- A genuine new manual baseline invalidates prior metadata, without changing basis.
do $$declare f jsonb;r jsonb;identity text;baseline jsonb;begin
 select data into strict f from hired_fixture;baseline:=(f#>'{obligation,baseline}')||'{"category":"personnel","expected_revision":1,"estimate_minor":900000,"idempotency_key":"hired-actual-baseline-correction"}';
 execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(baseline);execute 'reset role';
 select source_identity into identity from public.operations_hired_source_ownership where source_kind='time';execute 'set local role service_role';
 r:=public.read_operations_hired_operational_source_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','abababab-abab-4aba-8aba-abababababab',identity);
 perform pg_temp.hired_assert(r->>'state'='unresolved' and r->'current_source'='null'::jsonb and r->'remaining_minor'='null'::jsonb,'actual baseline correction invalidates prior source relations');execute 'reset role';
end;$$;
do $$declare t text;begin
 foreach t in array array['operations_hired_basis_events','operations_hired_assignment_events','operations_hired_source_ownership'] loop
 begin execute format('delete from public.%I',t);raise exception 'owner deletion accepted';exception when sqlstate '55000' then null;end;
 begin execute format('truncate public.%I cascade',t);raise exception 'owner truncation accepted';exception when sqlstate '55000' then null;end;end loop;
 if has_table_privilege('service_role','public.operations_hired_assignment_events','INSERT') or has_table_privilege('service_role','public.operations_hired_basis_events','UPDATE') then raise exception 'inherited service write grants';end if;
end;$$;
select 'PASS hired personnel actual invoice/Time metadata authority and correction; native concurrency/currentness/EAC gates open' as result;
rollback;
