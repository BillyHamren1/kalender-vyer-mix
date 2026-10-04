\set ON_ERROR_STOP on
-- Persistent disposable fixture ONLY; consumes the genuine native publisher.
-- The signed HTTP journey rechecks authorization independently of setup claims.
do $$begin
 if current_database()<>'eventflow_project_evidence_http_runtime' or current_setting('test.project_evidence_fixture',true) is distinct from 'true' then raise exception 'isolated_project_evidence_fixture_required' using errcode='42501';end if;
 if exists(select 1 from public.operations_catering_cost_publications) or exists(select 1 from public.operations_finance_invoice_snapshots) or exists(select 1 from public.operations_project_obligation_baselines) or exists(select 1 from public.operations_scope_obligation_compositions) then raise exception 'fresh_project_evidence_domain_required' using errcode='55000';end if;
end;$$;
create function pg_temp.http_native_seed_assert(expected_amount jsonb,expected_status text,expected_source text,expected_count integer,expected_missing integer default 0)
returns void language plpgsql as $$ declare r jsonb;v jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
 execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v2('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');
 if public.read_operations_project_cost_evidence_v1('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007')->>'schema'<>'operations-project-cost-evidence.v1' then raise exception 'v1 compatibility changed';end if;
 execute 'set local role service_role';
 if r->>'schema'<>'operations-project-cost-evidence.v2' or jsonb_array_length(r->'catering')<>expected_count
  or (r->>'missingCateringCostCount')::integer<>expected_missing then raise exception 'native read count/schema mismatch';end if;
 select value into strict v from jsonb_array_elements(r->'catering') where value->>'workDate'=case when expected_amount='null'::jsonb then '2026-08-30' else '2026-09-30' end;
 if v->'amountMinor' is distinct from expected_amount or v->>'status'<>expected_status or v->>'sourceStatus'<>expected_source
  or v->>'streamKey' !~ '^[0-9a-f]{64}$' or (select count(*) from jsonb_object_keys(v))<>12
  or v ?| array['worker_id','person_id','raw_entry','hourly_rate_minor','rate_revision'] then raise exception 'native read money/status/privacy mismatch';end if;
end $$;
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000009');
insert into public.profiles(user_id,organization_id) values('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001');
insert into public.user_roles(user_id,organization_id,role) values('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','admin');
insert into public.projects(id,organization_id,deleted_at) values('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001',null);
set local role service_role;
insert into public.operations_catering_publish_gates values('00000000-0000-4000-8000-000000000001',false);
insert into public.operations_catering_source_bindings values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','https://catering.example/api/project-economy-read','catering-key-1',true);
insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006','2026-09-30','Europe/Stockholm','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','SEK','map-1',true);
insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','rate-september','work','SEK',30001,'2026-09-01','2026-10-01','isolated-native-Catering-fixture');
do $test$
declare e jsonb:=$entry${"id":"00000000-0000-4000-8000-000000000005","organization_id":"00000000-0000-4000-8000-000000000003","person_id":"00000000-0000-4000-8000-000000000004","workplace_id":"00000000-0000-4000-8000-000000000006","started_at":"2026-09-30T08:00:00Z","ended_at":"2026-09-30T10:00:00Z","break_minutes":15,"status":"pending","approved_by":null,"approved_at":null,"version":1,"source":"manual"}$entry$; p jsonb:=$snapshot${"schema_version":"operations-catering-personnel-v1","calculation_version":"operations-personnel-cost.v1.half-up","organization_id":"00000000-0000-4000-8000-000000000001","worker_id":"00000000-0000-4000-8000-000000000002","project_id":"00000000-0000-4000-8000-000000000007","obligation_id":"00000000-0000-4000-8000-000000000008","currency":"SEK","work_date":"2026-09-30","time_zone":"Europe/Stockholm","mapping_revision":"map-1","source_organization_id":"00000000-0000-4000-8000-000000000003","source_person_id":"00000000-0000-4000-8000-000000000004","source_time_entry_id":"00000000-0000-4000-8000-000000000005","source_time_entry_version":1,"source_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source_review_id":null,"source_review_fingerprint":null,"source_status":"pending","publication_revision":1,"project_review_status":"preliminary","minutes":105,"rate_revision":"rate-september","hourly_rate_minor":30001,"amount_minor":52502,"coverage":"complete"}$snapshot$;
 before_entry jsonb; review jsonb;r jsonb;bad_entry jsonb;bad_review jsonb;bad_snapshot jsonb;observation uuid; caught boolean; stream text:='catering:00000000-0000-4000-8000-000000000003:00000000-0000-4000-8000-000000000005';
begin
 p:=jsonb_set(p,'{source_fingerprint}',to_jsonb(encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex')));
 if p->>'source_fingerprint'<>'707c0e992a6b4afc373b71e7cf26b77c3b5da9b4ae7072c4fac1fb36664eb137' then raise exception 'actual JS/SQL native canonical parity failed';end if;

 caught:=false;
 begin perform public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000010',repeat('a',64),0,'fixture-native-publication-1');
 exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'default-off gate failed';end if;
 update public.operations_catering_publish_gates set enabled=true where organization_id='00000000-0000-4000-8000-000000000001';
 for r in select value from jsonb_array_elements(jsonb_build_array(p||'{"schema_version":null}',p||'{"calculation_version":null}',p||jsonb_build_object('source_fingerprint',repeat('f',64)))) loop
 caught:=false;begin perform public.publish_operations_catering_cost_v1(r,e::text,null,'00000000-0000-4000-8000-000000000010',repeat('a',64),0,'fixture-invalid-shape-key');
 exception when invalid_parameter_value then caught:=true;end;
 if not caught then raise exception 'null schema or fabricated fingerprint accepted';end if;end loop;
 r:=public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000010',repeat('a',64),0,'fixture-native-publication-1');
 if r->>'outcome'<>'accepted' or r->>'delivery_status'<>'parked' then raise exception 'first native publication failed';end if;
 observation:=(r->>'observation_id')::uuid;
 perform pg_temp.http_native_seed_assert('52502'::jsonb,'preliminary','pending',1);
 r:=public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000010',repeat('a',64),0,'fixture-native-publication-1');
 if r->>'outcome'<>'replayed' then raise exception 'exact idempotency replay failed';end if;
 -- A second genuine-schema isolated entry before available history stays null.
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values('00000000-0000-4000-8000-000000000089','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000088','00000000-0000-4000-8000-000000000006','2026-08-30','Europe/Stockholm','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','SEK','missing-map-1',true);
 e:=e||'{"id":"00000000-0000-4000-8000-000000000088","version":1,"status":"pending","approved_by":null,"approved_at":null,"started_at":"2026-08-30T08:00:00Z","ended_at":"2026-08-30T10:00:00Z","break_minutes":15}';
 p:=p||jsonb_build_object('source_time_entry_id','00000000-0000-4000-8000-000000000088','source_time_entry_version',1,'source_status','pending','source_review_id',null,'source_review_fingerprint',null,
 'publication_revision',1,'work_date','2026-08-30','mapping_revision','missing-map-1','project_review_status','preliminary','minutes',105,'coverage','missing_rate','rate_revision',null,'hourly_rate_minor',null,'amount_minor',null,
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'));
 r:=public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000089',repeat('a',64),0,'fixture-native-missing-rate');

end;$test$;
reset role;
insert into public.projects(id,organization_id,deleted_at) values('00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000001',null);
insert into auth.users(id) values('00000000-0000-4000-8000-000000000092');
insert into public.profiles(user_id,organization_id) values('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001');
insert into public.user_roles(user_id,organization_id,role) values('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','projekt');
insert into auth.users(id) values('00000000-0000-4000-8000-000000000093');
insert into public.profiles(user_id,organization_id) values('00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000099');
insert into public.user_roles(user_id,organization_id,role) values('00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000099','admin');
insert into public.projects(id,organization_id,deleted_at) values('00000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000099',null);
set local role service_role;
do $$declare p jsonb;e jsonb;v_stream text:='catering:00000000-0000-4000-8000-000000000003:00000000-0000-4000-8000-000000000088';begin
 select s.snapshot,o.raw_entry::jsonb into strict p,e from public.operations_catering_cost_publications s
 join public.operations_catering_source_observations o on o.organization_id=s.organization_id and o.id=s.observation_id
 where s.organization_id='00000000-0000-4000-8000-000000000001' and s.source_stream_id=v_stream and s.source_revision=1;
 update public.operations_catering_project_mappings set enabled=false where id='00000000-0000-4000-8000-000000000089';
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values('00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000088','00000000-0000-4000-8000-000000000006','2026-08-30','Europe/Stockholm','00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000071','SEK','map-b-1',true);
 e:=e||'{"version":2}';
 p:=p||jsonb_build_object('source_time_entry_version',2,'publication_revision',2,'project_id','00000000-0000-4000-8000-000000000070',
 'obligation_id','00000000-0000-4000-8000-000000000071','mapping_revision','map-b-1',
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'));
 perform public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000090',repeat('a',64),1,'catering-v3-move-to-b');
 e:=e||'{"version":3}';p:=p||jsonb_build_object('source_time_entry_version',3,'publication_revision',3,
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'));
 perform public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000090',repeat('a',64),2,'catering-v3-b-correction');
 -- Saved publication controls affinity even if the current enrollment is revoked.
 update public.operations_catering_project_mappings set enabled=false where id='00000000-0000-4000-8000-000000000090';
end;$$;
reset role;

create temporary table http_obligation_fixture(data jsonb not null);
insert into http_obligation_fixture values(:'fixture'::jsonb);
grant select on http_obligation_fixture to service_role,authenticated;
insert into public.operations_finance_invoice_enrollments values('fixture_http_source','99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-000000000001',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_http_source','56565656-5656-4565-8565-565656565656','00000000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$declare f jsonb;invoice jsonb;allocation jsonb;r jsonb;snapshot uuid;preview jsonb;baseline jsonb;baseline_event uuid;begin
 select data into f from http_obligation_fixture;
 allocation:=(f#>'{invoice,allocations,0}')||'{"destination_organization_id":"00000000-0000-4000-8000-000000000001","destination_project_id":"00000000-0000-4000-8000-000000000007"}';
 invoice:=(f->'invoice')||jsonb_build_object('destination_organization_id','00000000-0000-4000-8000-000000000001','allocations',jsonb_build_array(allocation));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_http_source',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_http_original_nonce',invoice::text);snapshot:=(r->>'snapshot_receipt_id')::uuid;if r->>'outcome' is distinct from 'accepted' then raise exception 'fixture_http_original_not_accepted';end if;execute 'reset role';execute 'set local role authenticated';
 preview:=public.preview_operations_project_scope_v1('project','00000000-0000-4000-8000-000000000007');
 perform public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','00000000-0000-4000-8000-000000000095','root_kind','project','root_id','00000000-0000-4000-8000-000000000007','expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint','idempotency_key','synthetic-http-scope-enrollment','reason','Capture actual project scope for isolated HTTP'));
 baseline:=(f->'baseline')||'{"project_id":"00000000-0000-4000-8000-000000000007","idempotency_key":"synthetic-http-manual-baseline"}';r:=public.append_operations_manual_obligation_baseline_v1(baseline);baseline_event:=(r->>'event_id')::uuid;
 perform public.bind_operations_invoice_obligation_v1(jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id','00000000-0000-4000-8000-000000000007','obligation_id',baseline->>'obligation_id','expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id',allocation->>'allocation_id','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','synthetic-http-invoice-binding','reason','Bind received original in the isolated fixture'));
 perform public.compose_operations_scope_obligations_v1(jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id','00000000-0000-4000-8000-000000000095','expected_scope_revision',1,'expected_membership_fingerprint',preview->>'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(baseline_event),'idempotency_key','synthetic-http-cost-composition','reason','Capture partial manual evidence without EAC'));
 execute 'reset role';
end;$$;
-- All source/delivery gates end disabled. No worker/provider is dispatched.
set local role service_role;
update public.operations_catering_publish_gates set enabled=false where organization_id='00000000-0000-4000-8000-000000000001';
update public.operations_finance_invoice_enrollments set enabled=false where key_id='fixture_http_source';
reset role;
commit;
select 'project-evidence-http-fixture SETUP PASS' as result;
