-- Append after frozen authority+capture fixtures in their existing rollback transaction.
-- Receipt controls are synthetic shape/lease tests, not actual Finance delivery.
set local role service_role;
do $$declare org uuid:='96000000-0000-4000-8000-000000000001';delivery_uuid uuid;claim jsonb;old_token uuid;r jsonb;receipt jsonb;outbox uuid;q jsonb;begin
 select d.id into delivery_uuid from operations_catering_allocation_private.delivery_queue d where d.organization_id=org and source_revision=3;
 begin perform public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner');raise exception 'captured replay bypassed revoked fresh dispatch mapping';exception when insufficient_privilege then null;end;
 if exists(select 1 from operations_catering_allocation_private.delivery_queue d where d.id=delivery_uuid and status<>'pending') then raise exception 'revoked claim mutated lease';end if;
 update operations_catering_private.finance_delivery_maps set enabled=true where mapping_id='96000000-0000-4000-8000-000000000021';
 update operations_catering_allocation_private.delivery_gates set enabled=false;
 begin perform public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner');raise exception 'default-off claim ignored';exception when insufficient_privilege then null;end;
 update operations_catering_allocation_private.delivery_gates set enabled=true;
 begin perform public.claim_operations_catering_allocation_delivery_v2('96000000-0000-4000-8000-000000000099',delivery_uuid,'isolated-v2-lease-owner');raise exception 'foreign queue scope accepted';exception when insufficient_privilege then null;end;
 claim:=public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner');
 if claim is null or (select count(*) from jsonb_object_keys(claim))<>15 or claim->>'source_revision'<>'3'
 or claim->>'allocation_event_id' is distinct from ((claim->>'raw_body')::jsonb->'allocation_event'->>'event_id') then raise exception 'v2 immutable claimed tuple mismatch';end if;
 if public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-second-owner') is not null then raise exception 'active lease stolen';end if;
 old_token:=(claim->>'lease_token')::uuid;
 receipt:=jsonb_build_object('schema','operations-catering-receipt.v2','outcome','accepted','source_organization_id',org,
 'source_stream_id',claim->>'source_stream_id','requested_source_revision',3,'applied_source_revision',3,'current_source_revision',3,
 'request_body_sha256',claim->>'body_sha256','snapshot_receipt_id','96000000-0000-4000-8000-000000000043',
 'snapshot_fingerprint',claim->>'body_sha256','receipt_id','96000000-0000-4000-8000-000000000044',
 'destination_organization_id',claim->>'destination_organization_id','shadow_only',true);
 begin perform public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',old_token,'delivered',receipt||'{"current_source_revision":4}',null);
 raise exception 'accepted claimed different current revision';exception when invalid_parameter_value then null;end;
 begin perform public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',old_token,'delivered',receipt||jsonb_build_object('snapshot_fingerprint',repeat('a',64)),null);
 raise exception 'unbound saved raw hash accepted';exception when invalid_parameter_value then null;end;
 r:=public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',old_token,'retry',null,'catering_allocation_finance_ack_unknown');
 if r->>'status'<>'pending' then raise exception 'lost acknowledgement cannot retry';end if;
 claim:=public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner');
 if claim->>'lease_token'=old_token::text then raise exception 'retry reused lease token';end if;
 begin perform public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',old_token,'delivered',receipt,null);
 raise exception 'old lease finished new attempt';exception when insufficient_privilege then null;end;
 r:=public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',(claim->>'lease_token')::uuid,'delivered',receipt,null);
 if r->>'status'<>'delivered' or r->>'source_outbox_status'<>'parked' then raise exception 'v2 finish modified original source outbox';end if;
 select o.id into outbox from public.operations_catering_cost_outbox o where o.organization_id=org and source_revision=4;
 q:=public.prepare_operations_catering_allocation_delivery_v2(outbox,'96000000-0000-4000-8000-000000000042');
 delivery_uuid:=(q->>'delivery_id')::uuid;
 claim:=public.claim_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner');
 receipt:=receipt||jsonb_build_object('outcome','stale','requested_source_revision',4,'applied_source_revision',5,'current_source_revision',5,
 'request_body_sha256',claim->>'body_sha256','snapshot_fingerprint',repeat('b',64));
 r:=public.finish_operations_catering_allocation_delivery_v2(org,delivery_uuid,'isolated-v2-lease-owner',(claim->>'lease_token')::uuid,'superseded',receipt,null);
 if r->>'status'<>'superseded' then raise exception 'bound newer Finance receipt did not supersede';end if;
 begin update operations_catering_allocation_private.delivery_queue set last_receipt='{}';raise exception 'service bypassed public lease finish';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.operations_catering_cost_outbox where status<>'parked') then raise exception 'v2 activated original source outbox';end if;
end;$$;
reset role;
-- Explicitly unsupported backlog: fresh old-event work never borrows saved replay authority.
-- Use the actual same-source producer/capture and actual authenticated allocation RPC.
set local role service_role;
do $$declare p public.operations_catering_cost_publications%rowtype;o public.operations_catering_source_observations%rowtype;outbox uuid;q jsonb;begin
 select * into strict p from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=4;
 select * into strict o from public.operations_catering_source_observations where organization_id=p.organization_id and id=p.observation_id;
 perform public.publish_operations_catering_cost_v1(jsonb_set(p.snapshot,'{publication_revision}','5'),o.raw_entry,o.raw_review,p.mapping_id,o.source_request_hash,4,'allocation-backlog-source-publication-5');
 select id into strict outbox from public.operations_catering_cost_outbox where organization_id=p.organization_id and source_revision=5;
 q:=public.prepare_operations_catering_allocation_delivery_v2(outbox,'96000000-0000-4000-8000-000000000042');
 perform set_config('test.allocation_backlog_delivery',q->>'delivery_id',true);
end;$$;
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000013',true);
set local role authenticated;
select public.append_operations_manual_obligation_baseline_v1(jsonb_build_object(
 'schema_version','operations-obligation-manual-baseline.v1','project_id','96000000-0000-4000-8000-000000000007',
 'obligation_id','96000000-0000-4000-8000-000000000008','expected_revision',0,'currency','SEK','category','personnel','cost_basis','time',
 'estimate_minor',null,'committed_minor',null,'idempotency_key','allocation-backlog-return-baseline','reason','Explicit isolated return target obligation'));
reset role;
do $$declare p public.operations_catering_cost_publications%rowtype;e operations_catering_allocation_private.events%rowtype;begin
 select * into strict p from public.operations_catering_cost_publications where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=5;
 select ev.* into strict e from operations_catering_allocation_private.heads h join operations_catering_allocation_private.events ev on ev.organization_id=h.organization_id and ev.event_id=h.current_event_id
 where h.organization_id=p.organization_id and h.source_stream_id=p.source_stream_id;
 perform set_config('test.allocation_backlog_command',jsonb_build_object('schema_version','operations-catering-reassignment-command.v2',
 'source_stream_id',p.source_stream_id,'expected_source_revision',5,'expected_allocation_revision',e.allocation_revision,
 'expected_observation_id',p.observation_id,'expected_source_fingerprint',p.snapshot->>'source_fingerprint',
 'from_project_id',p.snapshot->>'project_id','from_obligation_id',p.snapshot->>'obligation_id',
 'target_project_id','96000000-0000-4000-8000-000000000007','target_obligation_id','96000000-0000-4000-8000-000000000008',
 'expected_target_obligation_revision',1,'idempotency_key','allocation-backlog-second-authority','reason','Explicit isolated superseding assignment before dispatch')::text,true);
end;$$;
-- Frozen authority fixture forced deferred lineage FKs IMMEDIATE to assert its first event.
-- Restore their normal transaction mode for this new real event→publication operation.
set constraints all deferred;
set local role authenticated;
select public.reassign_operations_catering_project_v2(current_setting('test.allocation_backlog_command')::jsonb);
reset role;
set constraints all immediate;
set local role service_role;
do $$declare q operations_catering_allocation_private.delivery_queue%rowtype;outbox uuid;begin
 select * into strict q from operations_catering_allocation_private.delivery_queue where id=current_setting('test.allocation_backlog_delivery')::uuid;
 begin perform public.claim_operations_catering_allocation_delivery_v2(q.organization_id,q.id,'isolated-backlog-owner');
 raise exception 'superseded pending authority dispatched via disabled map';exception when insufficient_privilege then null;end;
 if not exists(select 1 from operations_catering_allocation_private.delivery_queue where id=q.id and status='pending' and raw_body=q.raw_body and lease_token is null)
 then raise exception 'blocked backlog mutated immutable capture or took lease';end if;
 select id into strict outbox from public.operations_catering_cost_outbox where organization_id=q.organization_id and source_revision=6;
 begin perform public.prepare_operations_catering_allocation_delivery_v2(outbox,'96000000-0000-4000-8000-000000000042');
 raise exception 'next allocation bypassed undelivered predecessor';exception when insufficient_privilege then null;end;
 if exists(select 1 from operations_catering_allocation_private.delivery_queue where source_outbox_id=outbox)
 then raise exception 'blocked successor manufactured delivery capture';end if;
end;$$;
reset role;
set local role authenticated;
do $$begin
 begin perform public.claim_operations_catering_allocation_delivery_v2('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000099','isolated-v2-lease-owner');raise exception 'human invoked service dispatch';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select 'PASS v2 captured capability revocation/tenant/lease-CAS/lost-ack retry/strict receipt/source parked (isolated synthetic receipt controls)' as evidence;
