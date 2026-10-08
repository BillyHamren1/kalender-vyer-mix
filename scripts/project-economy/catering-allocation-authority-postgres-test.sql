-- Isolated actual RPC/SQL contract controls. JWT claims here are fixture controls,
-- not proof of a hosted authenticated human action or real Catering response.
begin;
insert into auth.users(id) values('96000000-0000-4000-8000-000000000013');
insert into public.profiles(user_id,organization_id) values('96000000-0000-4000-8000-000000000013','96000000-0000-4000-8000-000000000001');
insert into public.user_roles(user_id,organization_id,role) values('96000000-0000-4000-8000-000000000013','96000000-0000-4000-8000-000000000001','admin');

insert into public.projects(id,organization_id,deleted_at) values
 ('96000000-0000-4000-8000-000000000007','96000000-0000-4000-8000-000000000001',null),
 ('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000001',null);
set local role service_role;
do $$declare f jsonb:=current_setting('test.catering_allocation_fixture')::jsonb;s jsonb:=f->'saved'->'snapshot';begin
 insert into public.operations_catering_publish_gates values((s->>'organization_id')::uuid,true);
 insert into public.operations_catering_source_bindings values((s->>'organization_id')::uuid,(s->>'worker_id')::uuid,(s->>'source_organization_id')::uuid,(s->>'source_person_id')::uuid,'https://catering.example/api/project-economy-read','allocation-fixture-key',true);
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values((f->'saved'->>'mapping_id')::uuid,(s->>'organization_id')::uuid,(s->>'worker_id')::uuid,(s->>'source_organization_id')::uuid,(s->>'source_person_id')::uuid,(s->>'source_time_entry_id')::uuid,
 '96000000-0000-4000-8000-000000000006',(s->>'work_date')::date,s->>'time_zone',(s->>'project_id')::uuid,(s->>'obligation_id')::uuid,s->>'currency',s->>'mapping_revision',true);
 insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
 values((s->>'organization_id')::uuid,(s->>'worker_id')::uuid,s->>'rate_revision','work',s->>'currency',(s->>'hourly_rate_minor')::bigint,'2026-09-01','2026-10-01','isolated-allocation-control');
 perform public.publish_operations_catering_cost_v1(jsonb_set(s,'{publication_revision}','1'),f->>'raw_entry',null,(f->'saved'->>'mapping_id')::uuid,f->'saved'->>'raw_entry_sha256',0,'allocation-control-publication-1');
 perform public.publish_operations_catering_cost_v1(s,f->>'raw_entry',null,(f->'saved'->>'mapping_id')::uuid,f->'saved'->>'raw_entry_sha256',1,'allocation-control-publication-2');
 insert into operations_catering_allocation_private.gates values((s->>'organization_id')::uuid,false);
 insert into operations_catering_private.finance_delivery_maps values
 ('96000000-0000-4000-8000-000000000020',(s->>'organization_id')::uuid,(s->>'project_id')::uuid,(s->>'obligation_id')::uuid,'96000000-0000-4000-8000-000000000030','96000000-0000-4000-8000-000000000031','isolated-old-finance-target','SEK',true),
 ('96000000-0000-4000-8000-000000000021',(s->>'organization_id')::uuid,'96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000030','96000000-0000-4000-8000-000000000032','isolated-new-finance-target','SEK',true);
end;$$;
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000013',true);
set local role authenticated;
select public.append_operations_manual_obligation_baseline_v1(jsonb_build_object(
 'schema_version','operations-obligation-manual-baseline.v1','project_id','96000000-0000-4000-8000-000000000011',
 'obligation_id','96000000-0000-4000-8000-000000000012','expected_revision',0,'currency','SEK','category','personnel','cost_basis','time',
 'estimate_minor',null,'committed_minor',null,'idempotency_key','allocation-target-baseline-1','reason','Explicit isolated target obligation'));
select public.append_operations_manual_obligation_baseline_v1(jsonb_build_object(
 'schema_version','operations-obligation-manual-baseline.v1','project_id','96000000-0000-4000-8000-000000000011',
 'obligation_id','96000000-0000-4000-8000-000000000016','expected_revision',0,'currency','SEK','category','personnel','cost_basis','invoice',
 'estimate_minor',null,'committed_minor',null,'idempotency_key','allocation-invoice-baseline-1','reason','Explicit wrong cost basis control'));
select public.append_operations_manual_obligation_baseline_v1(jsonb_build_object(
 'schema_version','operations-obligation-manual-baseline.v1','project_id','96000000-0000-4000-8000-000000000011',
 'obligation_id','96000000-0000-4000-8000-000000000017','expected_revision',0,'currency','USD','category','personnel','cost_basis','time',
 'estimate_minor',null,'committed_minor',null,'idempotency_key','allocation-currency-baseline-1','reason','Explicit wrong currency control'));
reset role;
do $$declare f jsonb:=current_setting('test.catering_allocation_fixture')::jsonb;c jsonb:=f->'command';obs uuid;begin
 select observation_id into obs from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=2;
 c:=jsonb_set(c,'{expected_observation_id}',to_jsonb(obs::text));
 perform set_config('test.catering_allocation_command',c::text,true);
end;$$;
set local role authenticated;
do $$begin
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'default-off reassignment accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local role service_role;
update operations_catering_allocation_private.gates set enabled=true where organization_id='96000000-0000-4000-8000-000000000001';
update operations_catering_private.finance_delivery_maps set enabled=false where mapping_id='96000000-0000-4000-8000-000000000020';
reset role;
set local role authenticated;
do $$begin
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'revoked old retirement capability accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local role service_role;
update operations_catering_private.finance_delivery_maps set enabled=true where mapping_id='96000000-0000-4000-8000-000000000020';
-- Internal service credentials cannot impersonate the authenticated authority.
do $$begin
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'service reassignment accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
set local role authenticated;
do $$begin
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'foreign authenticated admin accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000013',true);
update public.projects set deleted_at=now() where id='96000000-0000-4000-8000-000000000007';
set local role authenticated;
do $$begin begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'deleted predecessor project accepted';exception when insufficient_privilege then null;end;end;$$;
reset role;
update public.projects set deleted_at=null where id='96000000-0000-4000-8000-000000000007';
update public.projects set organization_id='88888888-8888-4888-8888-888888888888' where id='96000000-0000-4000-8000-000000000011';
set local role authenticated;
do $$begin begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'foreign target project accepted';exception when insufficient_privilege then null;end;end;$$;
reset role;
update public.projects set organization_id='96000000-0000-4000-8000-000000000001' where id='96000000-0000-4000-8000-000000000011';
update public.projects set deleted_at=now() where id='96000000-0000-4000-8000-000000000011';
set local role authenticated;
do $$begin begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'deleted target project accepted';exception when insufficient_privilege then null;end;end;$$;
reset role;
update public.projects set deleted_at=null where id='96000000-0000-4000-8000-000000000011';
delete from public.user_roles where user_id='96000000-0000-4000-8000-000000000013';
set local role authenticated;
do $$begin begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'revoked live administrator accepted';exception when insufficient_privilege then null;end;end;$$;
reset role;
insert into public.user_roles(user_id,organization_id,role) values('96000000-0000-4000-8000-000000000013','96000000-0000-4000-8000-000000000001','admin');
update public.user_roles set role='projekt' where user_id='96000000-0000-4000-8000-000000000013';
set local role authenticated;
do $$begin begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);raise exception 'same-org nonadmin authority accepted';exception when insufficient_privilege then null;end;end;$$;
reset role;
update public.user_roles set role='admin' where user_id='96000000-0000-4000-8000-000000000013';
set local role authenticated;
do $$declare r jsonb;again jsonb;begin
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"from_project_id":"96000000-0000-4000-8000-000000000098"}');raise exception 'missing predecessor project accepted';exception when insufficient_privilege then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"target_project_id":"96000000-0000-4000-8000-000000000098"}');raise exception 'missing target project accepted';exception when insufficient_privilege then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"target_obligation_id":"96000000-0000-4000-8000-000000000016"}');raise exception 'invoice target obligation accepted';exception when insufficient_privilege then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"target_obligation_id":"96000000-0000-4000-8000-000000000017"}');raise exception 'wrong currency obligation accepted';exception when insufficient_privilege then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"target_obligation_id":"96000000-0000-4000-8000-000000000018"}');raise exception 'invented target obligation accepted';exception when insufficient_privilege then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"expected_source_revision":null}');raise exception 'null revision accepted';exception when invalid_parameter_value then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"actor_system_user_id":null}');raise exception 'client actor accepted';exception when invalid_parameter_value then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||jsonb_build_object('reason',E'\tLeading tab reason'));raise exception 'SQL/JS trim mismatch';exception when invalid_parameter_value then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||jsonb_build_object('reason',U&'\00A0Leading NBSP reason'));raise exception 'SQL/JS NBSP mismatch';exception when invalid_parameter_value then null;end;
 begin perform public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||jsonb_build_object('idempotency_key',E'new-command-idempotency\n'));raise exception 'SQL/JS newline key mismatch';exception when invalid_parameter_value then null;end;
 r:=public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb||'{"expected_target_obligation_revision":2}');
 if r->>'outcome'<>'stale_obligation' then raise exception 'stale real obligation accepted';end if;
 r:=public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);
 again:=public.reassign_operations_catering_project_v2(current_setting('test.catering_allocation_command')::jsonb);
 if r->>'outcome'<>'accepted' or again->>'outcome'<>'replayed' then raise exception 'allocation acceptance/replay missing';end if;
end;$$;
reset role;
set constraints all immediate;
do $$declare before_row jsonb;after_row jsonb;e jsonb;begin
 select snapshot into before_row from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=2;
 select snapshot into after_row from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=3;
 select document into e from operations_catering_allocation_private.events where organization_id='96000000-0000-4000-8000-000000000001';
 if before_row->>'project_id'='96000000-0000-4000-8000-000000000011' or after_row->>'project_id'<>'96000000-0000-4000-8000-000000000011'
 or after_row->>'amount_minor'<>'52502' or after_row->>'source_time_entry_version'<>'1' then raise exception 'cost/source identity changed or target not moved';end if;
 if operations_catering_allocation_private.cost_fingerprint_v2(before_row) is distinct from operations_catering_allocation_private.cost_fingerprint_v2(after_row)
 or e->>'source_cost_fingerprint' is distinct from operations_catering_allocation_private.cost_fingerprint_v2(after_row) then raise exception 'historical economic fingerprint changed';end if;
 if (select count(*) from public.operations_catering_source_observations where organization_id='96000000-0000-4000-8000-000000000001')<>1 then raise exception 'allocation forged native observation';end if;
 if exists(select 1 from public.operations_catering_cost_outbox where organization_id='96000000-0000-4000-8000-000000000001' and status<>'parked') then raise exception 'old source delivery activated';end if;
 if (select count(*) from public.operations_project_obligation_baselines where organization_id='96000000-0000-4000-8000-000000000001')<>3
 or exists(select 1 from public.operations_project_obligation_baselines where organization_id='96000000-0000-4000-8000-000000000001' and (estimate_minor is not null or committed_minor is not null)) then raise exception 'allocation transferred forecast baseline';end if;
 if not exists(select 1 from operations_catering_allocation_private.event_finance_capabilities where organization_id='96000000-0000-4000-8000-000000000001'
 and previous_finance_mapping_id='96000000-0000-4000-8000-000000000020' and next_finance_mapping_id='96000000-0000-4000-8000-000000000021'
 and destination_organization_id='96000000-0000-4000-8000-000000000030') then raise exception 'original Finance capabilities not captured';end if;
 begin update operations_catering_allocation_private.event_finance_capabilities set next_finance_mapping_id=previous_finance_mapping_id;raise exception 'captured Finance capability rewritten';exception when object_not_in_prerequisite_state then null;end;
end;$$;
-- The original producer must adopt the active allocation map on a distinct new
-- raw entry version, while the old immutable observation retains its provenance.
do $$declare p public.operations_catering_cost_publications%rowtype;oid uuid;begin
 select * into p from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=2;
 begin insert into public.operations_catering_cost_publications values(p.organization_id,p.source_stream_id,4,p.observation_id,p.mapping_id,jsonb_set(p.snapshot,'{publication_revision}','4'),'owner-old-allocation-attack',now());raise exception 'owner append to old assignment accepted';exception when insufficient_privilege then null;end;
 begin update public.operations_catering_cost_streams set current_revision=4 where organization_id=p.organization_id and source_stream_id=p.source_stream_id;raise exception 'owner head advanced without current authority publication';exception when insufficient_privilege then null;end;
 select id into oid from public.operations_catering_cost_outbox where organization_id=p.organization_id and source_revision=3;
 begin insert into operations_catering_private.finance_delivery_queue(source_outbox_id,organization_id,source_stream_id,source_revision,destination_organization_id,route_id,route_revision,key_id,endpoint_url,envelope,raw_body,body_sha256)
 values(oid,p.organization_id,p.source_stream_id,3,'96000000-0000-4000-8000-000000000030','96000000-0000-4000-8000-000000000099','test-only-route','test-only-key','https://finance.example/functions/v1/operations-catering-cost-receive','{}','{}',encode(sha256(convert_to('{}','UTF8')),'hex'));
 raise exception 'allocated native cost entered v1 transport';exception when insufficient_privilege then null;end;
end;$$;
set local role service_role;
do $$declare f jsonb:=current_setting('test.catering_allocation_fixture')::jsonb;s jsonb;map_id uuid;map_rev text;begin
 select mapping_id into map_id from operations_catering_allocation_private.heads where organization_id='96000000-0000-4000-8000-000000000001';
 select mapping_revision into map_rev from public.operations_catering_project_mappings where id=map_id;
 begin update public.operations_catering_project_mappings set enabled=true where id='96000000-0000-4000-8000-000000000010';raise exception 'old map reactivated';exception when insufficient_privilege then null;end;
 begin perform public.publish_operations_catering_cost_v1(f->'correction_snapshot',f->>'corrected_raw_entry',null,'96000000-0000-4000-8000-000000000010',f->'saved'->>'raw_entry_sha256',3,'allocation-old-map-correction');raise exception 'correction reset old assignment';exception when insufficient_privilege then null;end;
 s:=f->'correction_snapshot'||jsonb_build_object('project_id','96000000-0000-4000-8000-000000000011','obligation_id','96000000-0000-4000-8000-000000000012','mapping_revision',map_rev);
 update operations_catering_allocation_private.gates set enabled=false where organization_id='96000000-0000-4000-8000-000000000001';
 begin perform public.publish_operations_catering_cost_v1(s,f->>'corrected_raw_entry',null,map_id,encode(sha256(convert_to(f->>'corrected_raw_entry','UTF8')),'hex'),3,'allocation-revoked-source-correction');raise exception 'revoked allocation published fresh source';exception when insufficient_privilege then null;end;
 update operations_catering_allocation_private.gates set enabled=true where organization_id='96000000-0000-4000-8000-000000000001';
 perform public.publish_operations_catering_cost_v1(s,f->>'corrected_raw_entry',null,map_id,encode(sha256(convert_to(f->>'corrected_raw_entry','UTF8')),'hex'),3,'allocation-current-map-correction');
end;$$;
reset role;
do $$declare s jsonb;begin
 select snapshot into s from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=4;
 if s->>'project_id'<>'96000000-0000-4000-8000-000000000011' or s->>'amount_minor'<>'45002' or s->>'source_time_entry_version'<>'2' then raise exception 'future source lost allocation authority';end if;
 if (select count(*) from operations_catering_allocation_private.events where organization_id='96000000-0000-4000-8000-000000000001')<>1
 or (select count(*) from public.operations_catering_source_observations where organization_id='96000000-0000-4000-8000-000000000001')<>2 then raise exception 'source update forged allocation event or reused old observation';end if;
end;$$;
-- Test runners may capture this row privately for SQL -> JS -> Finance parity;
-- do not print source/reviewer/authority documents into public CI logs.
select e.document as allocation_event,p.snapshot as allocated_snapshot
 from operations_catering_allocation_private.events e join public.operations_catering_cost_publications p
 on p.organization_id=e.organization_id and p.source_stream_id=e.source_stream_id and p.source_revision=e.allocated_publication_revision
 where e.organization_id='96000000-0000-4000-8000-000000000001';
rollback;
