-- Run inside the authority fixture transaction before its final rollback.
-- This is SQL capture/lease receipt-shape proof only. The test receipt below is
-- explicitly synthetic; it does not claim actual Finance acceptance or HTTPS.
set local role service_role;
insert into operations_catering_private.finance_delivery_gates values('96000000-0000-4000-8000-000000000001',true);
insert into operations_catering_private.finance_delivery_routes values('96000000-0000-4000-8000-000000000041','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000030','isolated-v1-route','isolated-v1-key','https://finance.example/functions/v1/operations-catering-cost-receive',true);
insert into operations_catering_allocation_private.delivery_gates values('96000000-0000-4000-8000-000000000001',false);
insert into operations_catering_allocation_private.delivery_routes values('96000000-0000-4000-8000-000000000042','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000030','isolated-allocation-route-v2','isolated-allocation-key-v2','https://finance.example/functions/v1/operations-catering-allocation-cost-receive',true);
do $$declare old_outbox uuid;allocated_outbox uuid;corrected_outbox uuid;q jsonb;claim jsonb;r jsonb;receipt jsonb;begin
 select id into old_outbox from public.operations_catering_cost_outbox where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=2;
 select id into allocated_outbox from public.operations_catering_cost_outbox where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=3;
 select id into corrected_outbox from public.operations_catering_cost_outbox where organization_id='96000000-0000-4000-8000-000000000001' and source_revision=4;
 begin perform public.prepare_operations_catering_allocation_delivery_v2(allocated_outbox,'96000000-0000-4000-8000-000000000042');raise exception 'default-off v2 capture accepted';exception when insufficient_privilege then null;end;
 update operations_catering_allocation_private.delivery_gates set enabled=true;
 begin perform public.prepare_operations_catering_allocation_delivery_v2(allocated_outbox,'96000000-0000-4000-8000-000000000042');raise exception 'missing predecessor acknowledgement accepted';exception when insufficient_privilege then null;end;
 q:=public.prepare_operations_catering_finance_delivery_v1(old_outbox,'96000000-0000-4000-8000-000000000041');
 claim:=public.claim_operations_catering_finance_delivery_v1('96000000-0000-4000-8000-000000000001',(q->>'delivery_id')::uuid,'isolated-control-v1-owner');
 receipt:=jsonb_build_object('schema','operations-catering-receipt.v1','outcome','accepted','source_organization_id','96000000-0000-4000-8000-000000000001','source_stream_id',claim->>'source_stream_id','requested_source_revision',2,'applied_source_revision',2,'current_source_revision',2,
 'request_body_sha256',claim->>'body_sha256','snapshot_receipt_id','96000000-0000-4000-8000-000000000043','snapshot_fingerprint',claim->>'body_sha256','receipt_id','96000000-0000-4000-8000-000000000044','destination_organization_id','96000000-0000-4000-8000-000000000030','shadow_only',true);
 perform public.finish_operations_catering_finance_delivery_v1('96000000-0000-4000-8000-000000000001',(q->>'delivery_id')::uuid,'isolated-control-v1-owner',(claim->>'lease_token')::uuid,'delivered',receipt,null);
 q:=public.prepare_operations_catering_allocation_delivery_v2(allocated_outbox,'96000000-0000-4000-8000-000000000042');
 r:=public.prepare_operations_catering_allocation_delivery_v2(allocated_outbox,'96000000-0000-4000-8000-000000000042');
 if q->>'outcome'<>'prepared' or r->>'outcome'<>'replayed' or r->>'delivery_id' is distinct from q->>'delivery_id' then raise exception 'v2 capture replay failed';end if;
 begin perform public.prepare_operations_catering_allocation_delivery_v2(corrected_outbox,'96000000-0000-4000-8000-000000000042');raise exception 'later source accepted before initial allocation delivery';exception when insufficient_privilege then null;end;
 update operations_catering_private.finance_delivery_maps set enabled=false where mapping_id='96000000-0000-4000-8000-000000000021';
 r:=public.prepare_operations_catering_allocation_delivery_v2(allocated_outbox,'96000000-0000-4000-8000-000000000042');
 if r->>'outcome'<>'replayed' then raise exception 'historical captured body remapped';end if;
 begin update operations_catering_allocation_private.delivery_queue set raw_body='{}';raise exception 'service rewrote v2 body';exception when insufficient_privilege then null;end;
end;$$;
reset role;
do $$declare q operations_catering_allocation_private.delivery_queue%rowtype;begin
 select * into q from operations_catering_allocation_private.delivery_queue where organization_id='96000000-0000-4000-8000-000000000001';
 if q.status<>'pending' or q.envelope->>'schema_version'<>'operations-catering-delivery.v2' or (select count(*) from jsonb_object_keys(q.envelope))<>19
 or q.envelope->'snapshot'->>'amount_minor'<>'52502' or q.envelope->'snapshot'->>'source_time_entry_version'<>'1'
 or jsonb_array_length(q.envelope->'destination_mappings')<>2 or q.body_sha256<>encode(sha256(convert_to(q.raw_body,'UTF8')),'hex') then raise exception 'v2 captured identity/body/coverage changed';end if;
 if exists(select 1 from public.operations_catering_cost_outbox where status<>'parked') then raise exception 'original source outbox activated';end if;
end;$$;
