-- Additive read assertions over real native publications from the existing isolated fixture.
create function pg_temp.native_read_assert(expected_amount jsonb,expected_status text,expected_source text,expected_count integer,expected_missing integer default 0)
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
-- Isolated schema-shaped fixture only. No real source/tenant/provider writes.
-- Seeded project decision is NOT authenticated human attest proof.
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
 perform pg_temp.native_read_assert('52502'::jsonb,'preliminary','pending',1);
 r:=public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000010',repeat('a',64),0,'fixture-native-publication-1');
 if r->>'outcome'<>'replayed' then raise exception 'exact idempotency replay failed';end if;
 -- Seed an immutable saved Operations decision, explicitly not a human action proof.
 p:=p||'{"publication_revision":2,"project_review_status":"confirmed"}';
 insert into public.operations_catering_cost_publications values('00000000-0000-4000-8000-000000000001',stream,2,observation,'00000000-0000-4000-8000-000000000010',p,'fixture-seeded-project-decision',now());
 update public.operations_catering_cost_streams set current_revision=2 where organization_id='00000000-0000-4000-8000-000000000001' and source_stream_id=stream;
 perform pg_temp.native_read_assert('52502'::jsonb,'confirmed','pending',1);
 before_entry:=e;e:=e||'{"status":"approved","version":2,"approved_by":"00000000-0000-4000-8000-000000000009","approved_at":"2026-10-01T09:00:01Z"}';
 review:=jsonb_build_object('id','00000000-0000-4000-8000-000000000102','organization_id','00000000-0000-4000-8000-000000000003','time_entry_id','00000000-0000-4000-8000-000000000005','from_status','pending','to_status','approved','before_payload',before_entry,'after_payload',e,'reviewed_by','00000000-0000-4000-8000-000000000009','reviewed_at','2026-10-01T09:00:00Z');
 p:=p||'{"source_status":"approved","source_time_entry_version":2,"source_review_id":"00000000-0000-4000-8000-000000000102","source_review_fingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","source_fingerprint":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","publication_revision":3}';
 p:=p||jsonb_build_object('source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'),'source_review_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(review),'UTF8')),'hex'));
 -- All bad cases recompute valid raw fingerprints: these exercise review semantics,
 -- not incidental hash or mismatched after_payload rejection.
 for r in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_object('entry',e||'{"approved_by":null}','review',review||'{"reviewed_by":null}'),
 jsonb_build_object('entry',e,'review',review||'{"id":"not-a-uuid"}'),
 jsonb_build_object('entry',e||'{"approved_at":"yesterday"}','review',review),
 jsonb_build_object('entry',e,'review',review||'{"reviewed_at":null}'),
 jsonb_build_object('entry',e,'review',review||'{"reviewed_at":"not-an-instant"}'),
 jsonb_build_object('entry',e,'review',review||jsonb_build_object('before_payload',before_entry||'{"version":null}')),
 jsonb_build_object('entry',e-'source','review',review)
 )) loop
 bad_entry:=r->'entry';bad_review:=(r->'review')||jsonb_build_object('after_payload',bad_entry);
 bad_snapshot:=p||jsonb_build_object('source_review_id',bad_review->'id',
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(bad_entry),'UTF8')),'hex'),
 'source_review_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(bad_review),'UTF8')),'hex'));
 caught:=false;begin perform public.publish_operations_catering_cost_v1(bad_snapshot,bad_entry::text,bad_review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),2,'fixture-invalid-native-review');
 exception when invalid_parameter_value then caught:=true;end;
 if not caught then raise exception 'native malformed original review/source accepted';end if;
 end loop;
 r:=public.publish_operations_catering_cost_v1(p,e::text,review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),2,'fixture-native-publication-3');
 perform pg_temp.native_read_assert('52502'::jsonb,'confirmed','approved',1);
 if r->>'source_revision'<>'3' then raise exception 'payroll-only version failed to preserve project decision';end if;
 insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
 values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','new-future-rate','work','SEK',60000,'2026-10-01','2026-11-01','isolated-later-rate');
 before_entry:=e;e:=e||'{"version":3,"break_minutes":30}';
 review:=review||jsonb_build_object('id','00000000-0000-4000-8000-000000000103','from_status','approved','before_payload',before_entry,'after_payload',e);
 p:=p||'{"source_time_entry_version":3,"source_review_id":"00000000-0000-4000-8000-000000000103","source_fingerprint":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","publication_revision":4,"minutes":90,"amount_minor":45002}';
 p:=p||jsonb_build_object('source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'),'source_review_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(review),'UTF8')),'hex'));
 caught:=false;
 begin perform public.publish_operations_catering_cost_v1(p,e::text,review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),3,'fixture-invalid-confirmed-correction');
 exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'changed economics preserved project confirmation';end if;
 p:=p||'{"project_review_status":"preliminary"}';
 r:=public.publish_operations_catering_cost_v1(p,e::text,review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),3,'fixture-native-publication-4');
 perform pg_temp.native_read_assert('45002'::jsonb,'preliminary','approved',1);
 if r->>'source_revision'<>'4' then raise exception 'corrected cost captured original historical rate failed';end if;
 caught:=false;
 begin perform public.publish_operations_catering_cost_v1(p||'{"publication_revision":5}',e::text||' ',review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),4,'fixture-raw-byte-collision');
 exception when invalid_parameter_value then caught:=true;end;
 if not caught then raise exception 'same version raw byte change accepted';end if;
 before_entry:=e;e:=e||'{"version":4,"status":"rejected","approved_by":null,"approved_at":null}';
 review:=review||jsonb_build_object('id','00000000-0000-4000-8000-000000000104','from_status','approved','to_status','rejected','before_payload',before_entry,'after_payload',e);
 p:=p||jsonb_build_object('source_time_entry_version',4,'source_status','rejected','source_review_id','00000000-0000-4000-8000-000000000104','publication_revision',5,
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'),
 'source_review_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(review),'UTF8')),'hex'));
 caught:=false;begin perform public.publish_operations_catering_cost_v1(p,e::text,review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),4,'fixture-invalid-global-rejection');
 exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'source global rejection failed to override project preliminary';end if;
 p:=p||'{"project_review_status":"rejected"}';
 r:=public.publish_operations_catering_cost_v1(p,e::text,review::text,'00000000-0000-4000-8000-000000000010',repeat('a',64),4,'fixture-native-publication-5');
 perform pg_temp.native_read_assert('45002'::jsonb,'rejected','rejected',1);
 if r->>'source_revision'<>'5' then raise exception 'source global rejection not saved';end if;
 if (select count(*) from public.operations_catering_cost_streams)<>1 or (select count(*) from public.operations_catering_source_observations)<>4
 or (select count(*) from public.operations_catering_cost_outbox where status='parked')<>4 then raise exception 'identity/outbox/history counts incorrect';end if;
 -- A second genuine-schema isolated entry before available history stays null.
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values('00000000-0000-4000-8000-000000000089','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000088','00000000-0000-4000-8000-000000000006','2026-08-30','Europe/Stockholm','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','SEK','missing-map-1',true);
 e:=e||'{"id":"00000000-0000-4000-8000-000000000088","version":1,"status":"pending","approved_by":null,"approved_at":null,"started_at":"2026-08-30T08:00:00Z","ended_at":"2026-08-30T10:00:00Z","break_minutes":15}';
 p:=p||jsonb_build_object('source_time_entry_id','00000000-0000-4000-8000-000000000088','source_time_entry_version',1,'source_status','pending','source_review_id',null,'source_review_fingerprint',null,
 'publication_revision',1,'work_date','2026-08-30','mapping_revision','missing-map-1','project_review_status','preliminary','minutes',105,'coverage','missing_rate','rate_revision',null,'hourly_rate_minor',null,'amount_minor',null,
 'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'));
 r:=public.publish_operations_catering_cost_v1(p,e::text,null,'00000000-0000-4000-8000-000000000089',repeat('a',64),0,'fixture-native-missing-rate');
 perform pg_temp.native_read_assert('null'::jsonb,'preliminary','pending',2,1);
 if r->>'outcome'<>'accepted' or exists(select 1 from public.operations_catering_cost_publications where organization_id='00000000-0000-4000-8000-000000000001' and source_stream_id like '%000000000088' and snapshot->'amount_minor' is distinct from 'null'::jsonb)
 then raise exception 'missing native rate fabricated zero';end if;
 caught:=false;begin delete from public.operations_catering_source_observations where id=observation;
 exception when insufficient_privilege or object_not_in_prerequisite_state then caught:=true;end;
 if not caught then raise exception 'observation deletion permitted';end if;
 caught:=false;begin update public.projects set deleted_at=now() where id='00000000-0000-4000-8000-000000000007';
 exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'service role could mutate legacy project';end if;
end;$test$;
reset role;
set local role authenticated;
do $test$ begin
 begin perform public.publish_operations_catering_cost_v1('{}',null,null,null,null,0,'unauthorized-test-key');raise exception 'app role published native cost';
 exception when insufficient_privilege then null;end;
end;$test$;
reset role;
do $$ declare denied boolean:=false;begin
 perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
 execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v2('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');exception when insufficient_privilege then denied:=true;end;
 execute 'reset role';if not denied then raise exception 'foreign native project read accepted';end if;
 if has_function_privilege('anon','public.read_operations_project_cost_evidence_v2(uuid,uuid)','execute') or has_function_privilege('service_role','public.read_operations_project_cost_evidence_v2(uuid,uuid)','execute') then raise exception 'native read role leaked';end if;
end $$;
do $$ declare denied boolean:=false;begin
 perform set_config('request.jwt.claims','{}',true);execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v2('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');exception when insufficient_privilege then denied:=true;end;
 execute 'reset role';if not denied then raise exception 'missing actor read accepted';end if;
 update public.projects set deleted_at=now() where id='00000000-0000-4000-8000-000000000007';
 denied:=false;perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v2('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');exception when insufficient_privilege then denied:=true;end;
 execute 'reset role';if not denied then raise exception 'deleted project read accepted';end if;
end $$;
select 'PASS native Catering redacted project read correction/review/null/rejection/privacy/tenant'  as result;
rollback;
