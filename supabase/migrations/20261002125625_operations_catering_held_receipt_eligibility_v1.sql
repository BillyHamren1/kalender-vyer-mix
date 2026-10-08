-- NEW PRIVATE default-off integration precursor. No public wrapper, grant,
-- source writer, existing stub or activation gate is modified. Operations local
-- delivered13 is compared with an independently signed Finance-own receipt only
-- through the frozen owner-private exact TX/actor/cursor candidate hold.
-- Caller order: live admin -> this collector -> policy/routes/projects/maps ->
-- mapping/stream/head -> private held eligibility. Never collect scopes late.
-- Positive source/native tests must use genuinely delivered local ordinary13.
create function operations_catering_reconciliation_private.collect_admission_receipt_scopes_v1(p_cursor_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;c operations_catering_reconciliation_private.verified_cursors%rowtype;
begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found or c.organization_id is distinct from org then raise exception 'held receipt actor scope denied' using errcode='42501';end if;
 return operations_catering_reconciliation_private.lock_original_receipt_cursor_scopes_v1(p_cursor_id);
end;$$;
revoke all on function operations_catering_reconciliation_private.collect_admission_receipt_scopes_v1(uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.require_admission_receipt_scope_v1(p_cursor_id uuid,p_hold_id uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare org uuid;h operations_catering_reconciliation_private.original_receipt_scope_holds%rowtype;c operations_catering_reconciliation_private.verified_cursors%rowtype;
begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 select * into h from operations_catering_reconciliation_private.original_receipt_scope_holds where id=p_hold_id;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if h.id is null or c.cursor_id is null or h.cursor_id is distinct from p_cursor_id
 or h.creation_txid is distinct from pg_current_xact_id() or h.actor_system_user_id is distinct from auth.uid()
 or h.organization_id is distinct from org or c.organization_id is distinct from org
 or h.cursor_sha256 is distinct from c.cursor_sha256 or h.finance_organization_id is distinct from c.finance_organization_id
 then raise exception 'server-held receipt scope required' using errcode='42501';end if;
 -- No new key acquisition here. Frozen verifier rejects changed candidate sets
 -- before resolving ONLY the captured IDs later, under the caller's barriers.
end;$$;
revoke all on function operations_catering_reconciliation_private.require_admission_receipt_scope_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.delivery_eligibility_held_v1(p_cursor_id uuid,p_scope_hold_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;
 resolved operations_catering_reconciliation_private.verified_cursors%rowtype;
 pub public.operations_catering_cost_publications%rowtype;
 head operations_catering_allocation_private.heads%rowtype;
 receipt jsonb;captured jsonb;delivery_id uuid;raw text;body_hash text;recipient uuid;schema_name text;k text;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 perform operations_catering_reconciliation_private.require_admission_receipt_scope_v1(p_cursor_id,p_scope_hold_id);
 if p_cursor_id is null then raise exception 'admission cursor required' using errcode='22023';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found then raise exception 'admission verified cursor missing' using errcode='42501';end if;
 -- This repeats dedicated signature/current key/gate/expiry validation; a saved
 -- verification row or caller GUC is never a fresh permission exemption.
 resolved:=operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 if to_jsonb(c)-'verified_at' is distinct from to_jsonb(resolved)-'verified_at' then raise exception 'admission cached facts drifted' using errcode='22023';end if;
 select p.* into pub from public.operations_catering_cost_streams s join public.operations_catering_cost_publications p
 on p.organization_id=s.organization_id and p.source_stream_id=s.source_stream_id and p.source_revision=s.current_revision
 where s.organization_id=c.organization_id and s.source_stream_id=c.source_stream_id;
 if not found or pub.source_revision<>c.publication_revision then raise exception 'admission Finance cursor not current local publication' using errcode='42501';end if;
 select * into head from operations_catering_allocation_private.heads where organization_id=c.organization_id and source_stream_id=c.source_stream_id;
 if c.allocation_revision=0 then
 if head.organization_id is not null or c.allocation_event_id is not null then raise exception 'admission initial authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered')<>1 then raise exception 'admission unique original v1 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered';
 schema_name:='operations-catering-receipt.v1';
 else
 if head.current_revision is distinct from c.allocation_revision or head.current_event_id is distinct from c.allocation_event_id then raise exception 'admission adopted authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered')<>1 then raise exception 'admission unique original v2 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered';
 schema_name:='operations-catering-receipt.v2';
 end if;
 if delivery_id is null or raw is null or captured is distinct from raw::jsonb
 or captured->'snapshot' is distinct from pub.snapshot
 or captured->>'source_observation_id' is distinct from pub.observation_id::text
 or captured->>'source_mapping_id' is distinct from pub.mapping_id::text
 or captured->>'operations_organization_id' is distinct from c.organization_id::text
 or captured->>'source_stream_id' is distinct from c.source_stream_id
 or captured->>'schema_version' is distinct from (case when c.allocation_revision=0 then 'operations-catering-delivery.v1' else 'operations-catering-delivery.v2' end)
 or (c.allocation_revision>0 and captured->'allocation_event'->>'event_id' is distinct from c.allocation_event_id::text)
 or body_hash is distinct from encode(sha256(convert_to(raw,'UTF8')),'hex')
 or recipient is distinct from c.finance_organization_id or jsonb_typeof(receipt) is distinct from 'object'
 or not(receipt ?& keys) or receipt-keys<>'{}'::jsonb
 or receipt->>'schema' is distinct from schema_name or receipt->>'outcome' not in ('accepted','replayed')
 or jsonb_typeof(receipt->'outcome') is distinct from 'string' or receipt->'shadow_only' is distinct from 'true'::jsonb
 or receipt->>'source_organization_id' is distinct from c.organization_id::text or receipt->>'source_stream_id' is distinct from c.source_stream_id
 or receipt->>'destination_organization_id' is distinct from c.finance_organization_id::text
 or receipt->>'request_body_sha256' is distinct from body_hash or receipt->>'snapshot_fingerprint' is distinct from body_hash
 or receipt->>'snapshot_fingerprint' is distinct from c.proof->'cursor'->>'snapshot_body_sha256'
 or receipt->>'snapshot_receipt_id' is distinct from c.finance_snapshot_id::text
 then raise exception 'admission original delivered receipt binding denied' using errcode='42501';end if;
 foreach k in array array['snapshot_receipt_id','receipt_id'] loop
 if jsonb_typeof(receipt->k) is distinct from 'string' or receipt->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'admission receipt identity invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['requested_source_revision','applied_source_revision','current_source_revision'] loop
 if jsonb_typeof(receipt->k) is distinct from 'number' or receipt->k is distinct from to_jsonb(c.publication_revision) then raise exception 'admission receipt current revision invalid' using errcode='42501';end if;
 end loop;
 perform operations_catering_reconciliation_private.require_saved_original_receipt_v1(c.cursor_id,receipt,p_scope_hold_id);
 if clock_timestamp()>=c.expires_at then raise exception 'admission cursor expired after eligibility read' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256,'organization_id',c.organization_id,
 'source_stream_id',c.source_stream_id,'publication_revision',c.publication_revision,'allocation_revision',c.allocation_revision,
 'allocation_event_id',c.allocation_event_id,'mapping_id',pub.mapping_id,'observation_id',pub.observation_id,
 'delivery_id',delivery_id,'receipt_id',receipt->'receipt_id','finance_snapshot_id',c.finance_snapshot_id,
 'receipt_schema',schema_name,'body_sha256',body_hash);
end;$$;
revoke all on function operations_catering_reconciliation_private.delivery_eligibility_held_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.historical_delivery_eligibility_held_v1(p_cursor_id uuid,p_scope_hold_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;
 resolved operations_catering_reconciliation_private.verified_cursors%rowtype;
 pub public.operations_catering_cost_publications%rowtype;
 head operations_catering_allocation_private.heads%rowtype;
 receipt jsonb;captured jsonb;delivery_id uuid;raw text;body_hash text;recipient uuid;schema_name text;k text;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 perform operations_catering_reconciliation_private.require_admission_receipt_scope_v1(p_cursor_id,p_scope_hold_id);
 if p_cursor_id is null then raise exception 'admission cursor required' using errcode='22023';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found then raise exception 'admission verified cursor missing' using errcode='42501';end if;
 -- This repeats dedicated signature/current key/gate/expiry validation; a saved
 -- verification row or caller GUC is never a fresh permission exemption.
 resolved:=operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 if to_jsonb(c)-'verified_at' is distinct from to_jsonb(resolved)-'verified_at' then raise exception 'admission cached facts drifted' using errcode='22023';end if;
 select * into pub from public.operations_catering_cost_publications where organization_id=c.organization_id and source_stream_id=c.source_stream_id and source_revision=c.publication_revision;
 if not found then raise exception 'reconciliation exact local cursor publication required' using errcode='42501';end if;
 select * into head from operations_catering_allocation_private.heads where organization_id=c.organization_id and source_stream_id=c.source_stream_id;
 if c.allocation_revision=0 then
 if c.allocation_event_id is not null then raise exception 'admission initial authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered')<>1 then raise exception 'admission unique original v1 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered';
 schema_name:='operations-catering-receipt.v1';
 else
 if not exists(select 1 from operations_catering_allocation_private.events e where e.organization_id=c.organization_id and e.source_stream_id=c.source_stream_id and e.event_id=c.allocation_event_id and e.allocation_revision=c.allocation_revision and e.allocated_publication_revision<=c.publication_revision) then raise exception 'admission adopted authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered')<>1 then raise exception 'admission unique original v2 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered';
 schema_name:='operations-catering-receipt.v2';
 end if;
 if delivery_id is null or raw is null or captured is distinct from raw::jsonb
 or captured->'snapshot' is distinct from pub.snapshot
 or captured->>'source_observation_id' is distinct from pub.observation_id::text
 or captured->>'source_mapping_id' is distinct from pub.mapping_id::text
 or captured->>'operations_organization_id' is distinct from c.organization_id::text
 or captured->>'source_stream_id' is distinct from c.source_stream_id
 or captured->>'schema_version' is distinct from (case when c.allocation_revision=0 then 'operations-catering-delivery.v1' else 'operations-catering-delivery.v2' end)
 or (c.allocation_revision>0 and captured->'allocation_event'->>'event_id' is distinct from c.allocation_event_id::text)
 or body_hash is distinct from encode(sha256(convert_to(raw,'UTF8')),'hex')
 or recipient is distinct from c.finance_organization_id or jsonb_typeof(receipt) is distinct from 'object'
 or not(receipt ?& keys) or receipt-keys<>'{}'::jsonb
 or receipt->>'schema' is distinct from schema_name or receipt->>'outcome' not in ('accepted','replayed')
 or jsonb_typeof(receipt->'outcome') is distinct from 'string' or receipt->'shadow_only' is distinct from 'true'::jsonb
 or receipt->>'source_organization_id' is distinct from c.organization_id::text or receipt->>'source_stream_id' is distinct from c.source_stream_id
 or receipt->>'destination_organization_id' is distinct from c.finance_organization_id::text
 or receipt->>'request_body_sha256' is distinct from body_hash or receipt->>'snapshot_fingerprint' is distinct from body_hash
 or receipt->>'snapshot_fingerprint' is distinct from c.proof->'cursor'->>'snapshot_body_sha256'
 or receipt->>'snapshot_receipt_id' is distinct from c.finance_snapshot_id::text
 then raise exception 'admission original delivered receipt binding denied' using errcode='42501';end if;
 foreach k in array array['snapshot_receipt_id','receipt_id'] loop
 if jsonb_typeof(receipt->k) is distinct from 'string' or receipt->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'admission receipt identity invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['requested_source_revision','applied_source_revision','current_source_revision'] loop
 if jsonb_typeof(receipt->k) is distinct from 'number' or receipt->k is distinct from to_jsonb(c.publication_revision) then raise exception 'admission receipt current revision invalid' using errcode='42501';end if;
 end loop;
 perform operations_catering_reconciliation_private.require_saved_original_receipt_v1(c.cursor_id,receipt,p_scope_hold_id);
 if clock_timestamp()>=c.expires_at then raise exception 'admission cursor expired after eligibility read' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256,'organization_id',c.organization_id,
 'source_stream_id',c.source_stream_id,'publication_revision',c.publication_revision,'allocation_revision',c.allocation_revision,
 'allocation_event_id',c.allocation_event_id,'mapping_id',pub.mapping_id,'observation_id',pub.observation_id,
 'delivery_id',delivery_id,'receipt_id',receipt->'receipt_id','finance_snapshot_id',c.finance_snapshot_id,
 'receipt_schema',schema_name,'body_sha256',body_hash);
end;$$;
revoke all on function operations_catering_reconciliation_private.historical_delivery_eligibility_held_v1(uuid,uuid) from public,anon,authenticated,service_role;

