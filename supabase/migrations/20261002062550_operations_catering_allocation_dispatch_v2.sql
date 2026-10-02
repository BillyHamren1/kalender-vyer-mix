-- Allocation-v2 lease/finish only. Dedicated default-off captured queue; source outbox stays parked.
create function operations_catering_allocation_private.claim_delivery_v2(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q operations_catering_allocation_private.delivery_queue%rowtype;m jsonb;s jsonb;begin
 if p_organization_id is null or p_delivery_id is null or p_lease_owner is null or p_lease_owner !~ '^[A-Za-z0-9_-]{8,100}$' then raise exception 'native lease scope required' using errcode='22023';end if;
 perform 1 from operations_catering_allocation_private.delivery_gates where organization_id=p_organization_id and enabled for share;
 if not found then raise exception 'native delivery disabled' using errcode='42501';end if;
 select * into q from operations_catering_allocation_private.delivery_queue where id=p_delivery_id and organization_id=p_organization_id for update skip locked;
 if not found then
 if exists(select 1 from operations_catering_allocation_private.delivery_queue where id=p_delivery_id and organization_id=p_organization_id) then return null;end if;
 raise exception 'native scoped delivery missing' using errcode='42501';end if;
 if q.status in ('delivered','superseded','blocked') or (q.status='leased' and q.lease_until>clock_timestamp()) then return null;end if;
 perform 1 from operations_catering_allocation_private.delivery_routes where id=q.route_id and organization_id=q.organization_id
 and destination_organization_id=q.destination_organization_id and route_revision=q.route_revision and key_id=q.key_id and endpoint_url=q.endpoint_url and enabled for share;
 if not found then raise exception 'native captured delivery route revoked' using errcode='42501';end if;
 s:=q.envelope->'snapshot';
 perform 1 from operations_catering_allocation_private.gates where organization_id=q.organization_id and enabled for share;
 if not found then raise exception 'allocation authority gate revoked' using errcode='42501';end if;
 perform 1 from public.operations_catering_publish_gates where organization_id=q.organization_id and enabled for share;
 if not found then raise exception 'native publisher gate revoked' using errcode='42501';end if;
 perform 1 from public.operations_catering_source_bindings where organization_id=q.organization_id and worker_id=(s->>'worker_id')::uuid
 and catering_organization_id=(s->>'source_organization_id')::uuid and catering_person_id=(s->>'source_person_id')::uuid and enabled for share;
 if not found then raise exception 'native worker source binding revoked' using errcode='42501';end if;
 -- Producer and allocation authority both acquire mapping before allocation-head locks.
 perform 1 from public.operations_catering_project_mappings where organization_id=q.organization_id and id=(q.envelope->>'source_mapping_id')::uuid
 and worker_id=(s->>'worker_id')::uuid and catering_organization_id=(s->>'source_organization_id')::uuid
 and catering_person_id=(s->>'source_person_id')::uuid and time_entry_id=(s->>'source_time_entry_id')::uuid
 and project_id=(s->>'project_id')::uuid and obligation_id=(s->>'obligation_id')::uuid and currency=s->>'currency'
 and mapping_revision=s->>'mapping_revision' and work_date=(s->>'work_date')::date and time_zone=s->>'time_zone' and enabled for share;
 if not found then raise exception 'allocation source mapping revoked' using errcode='42501';end if;
 for m in select value from jsonb_array_elements(q.envelope->'destination_mappings') loop
 perform 1 from public.projects where organization_id=q.organization_id and id=(m->>'source_project_id')::uuid and deleted_at is null for share;
 if not found then raise exception 'allocation live source/retirement project revoked' using errcode='42501';end if;
 perform 1 from operations_catering_private.finance_delivery_maps where mapping_id=(m->>'mapping_id')::uuid and organization_id=q.organization_id
 and source_project_id=(m->>'source_project_id')::uuid and source_obligation_id=(m->>'source_obligation_id')::uuid
 and destination_organization_id=q.destination_organization_id and destination_project_id=(m->>'destination_project_id')::uuid
 and mapping_revision=m->>'mapping_revision' and currency=m->>'currency' and enabled for share;
 if not found then raise exception 'allocation captured Finance capability revoked' using errcode='42501';end if;
 end loop;
 perform 1 from operations_catering_allocation_private.heads where organization_id=q.organization_id and source_stream_id=q.source_stream_id
 and current_event_id=q.allocation_event_id for share;
 if not found then raise exception 'allocation queue authority superseded' using errcode='42501';end if;
 update operations_catering_allocation_private.delivery_queue set status='leased',lease_owner=p_lease_owner,lease_token=gen_random_uuid(),
 lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 where id=q.id returning * into q;
 return jsonb_build_object('id',q.id,'source_outbox_id',q.source_outbox_id,'organization_id',q.organization_id,'source_stream_id',q.source_stream_id,
 'source_revision',q.source_revision,'allocation_event_id',q.allocation_event_id,'raw_body',q.raw_body,'body_sha256',q.body_sha256,'destination_organization_id',q.destination_organization_id,
 'route_id',q.route_id,'route_revision',q.route_revision,'key_id',q.key_id,'endpoint_url',q.endpoint_url,'lease_owner',q.lease_owner,'lease_token',q.lease_token);
end;$$;
create function operations_catering_allocation_private.finish_delivery_v2(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb,p_error text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q operations_catering_allocation_private.delivery_queue%rowtype;k text;applied bigint;current_rev bigint;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 if p_outcome is null or p_outcome not in ('delivered','superseded','retry','blocked') then raise exception 'native finish outcome invalid' using errcode='22023';end if;
 select * into q from operations_catering_allocation_private.delivery_queue where id=p_delivery_id and organization_id=p_organization_id for update;
 if not found or q.status<>'leased' or q.lease_owner is distinct from p_lease_owner or q.lease_token is distinct from p_lease_token or q.lease_until<=clock_timestamp()
 then raise exception 'native lease changed/expired' using errcode='42501';end if;
 if p_outcome in ('delivered','superseded') then
 if jsonb_typeof(p_receipt) is distinct from 'object' or not p_receipt ?& keys or p_receipt-keys<>'{}'::jsonb
 or jsonb_typeof(p_receipt->'outcome') is distinct from 'string' or p_receipt->>'outcome' not in ('accepted','replayed','stale')
 or p_receipt->>'schema' is distinct from 'operations-catering-receipt.v2' or p_receipt->'shadow_only' is distinct from 'true'::jsonb
 or p_receipt->>'source_organization_id' is distinct from q.organization_id::text or p_receipt->>'source_stream_id' is distinct from q.source_stream_id
 or p_receipt->>'destination_organization_id' is distinct from q.destination_organization_id::text or p_receipt->>'request_body_sha256' is distinct from q.body_sha256
 then raise exception 'native authoritative receipt binding invalid' using errcode='22023';end if;
 foreach k in array array['snapshot_receipt_id','receipt_id'] loop
 if jsonb_typeof(p_receipt->k) is distinct from 'string' or p_receipt->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'native receipt UUID invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['requested_source_revision','applied_source_revision','current_source_revision'] loop
 if jsonb_typeof(p_receipt->k) is distinct from 'number' or (p_receipt->>k)::numeric not between 1 and 9007199254740991
 or trunc((p_receipt->>k)::numeric)<>(p_receipt->>k)::numeric then raise exception 'native receipt revision invalid' using errcode='22023';end if;
 end loop;
 applied:=(p_receipt->>'applied_source_revision')::bigint;current_rev:=(p_receipt->>'current_source_revision')::bigint;
 if (p_receipt->>'requested_source_revision')::bigint<>q.source_revision or jsonb_typeof(p_receipt->'snapshot_fingerprint') is distinct from 'string' or p_receipt->>'snapshot_fingerprint' !~ '^[0-9a-f]{64}$'
 or (p_outcome='delivered' and (p_receipt->>'outcome' not in ('accepted','replayed') or applied<>q.source_revision or current_rev<applied or (p_receipt->>'outcome'='accepted' and current_rev<>applied) or p_receipt->>'snapshot_fingerprint'<>q.body_sha256))
 or (p_outcome='superseded' and (p_receipt->>'outcome' is distinct from 'stale' or applied<>current_rev or current_rev<=q.source_revision or p_receipt->>'snapshot_fingerprint'=q.body_sha256))
 then raise exception 'native receipt outcome/hash invalid' using errcode='22023';end if;
 if p_error is not null then raise exception 'native acknowledged delivery must not carry error' using errcode='22023';end if;
 else
 if p_receipt is not null or p_error is null or p_error !~ '^catering_allocation_finance_(ack_unknown|capture_or_configuration_invalid|http_[0-9]{3})$'
 then raise exception 'native transport error invalid' using errcode='22023';end if;
 end if;
 update operations_catering_allocation_private.delivery_queue set status=case when p_outcome='retry' then 'pending' else p_outcome end,
 lease_owner=null,lease_token=null,lease_until=null,last_receipt=p_receipt,last_error=p_error where id=q.id;
 return jsonb_build_object('delivery_id',q.id,'status',case when p_outcome='retry' then 'pending' else p_outcome end,'source_outbox_status','parked');
end;$$;
revoke all on function operations_catering_allocation_private.claim_delivery_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function operations_catering_allocation_private.finish_delivery_v2(uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function operations_catering_allocation_private.claim_delivery_v2(uuid,uuid,text) to service_role;
grant execute on function operations_catering_allocation_private.finish_delivery_v2(uuid,uuid,text,uuid,text,jsonb,text) to service_role;
create function public.claim_operations_catering_allocation_delivery_v2(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text)
returns jsonb language sql security invoker set search_path='' as $$select operations_catering_allocation_private.claim_delivery_v2(p_organization_id,p_delivery_id,p_lease_owner);$$;
create function public.finish_operations_catering_allocation_delivery_v2(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb,p_error text)
returns jsonb language sql security invoker set search_path='' as $$select operations_catering_allocation_private.finish_delivery_v2(p_organization_id,p_delivery_id,p_lease_owner,p_lease_token,p_outcome,p_receipt,p_error);$$;
revoke all on function public.claim_operations_catering_allocation_delivery_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_operations_catering_allocation_delivery_v2(uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_operations_catering_allocation_delivery_v2(uuid,uuid,text) to service_role;
grant execute on function public.finish_operations_catering_allocation_delivery_v2(uuid,uuid,text,uuid,text,jsonb,text) to service_role;
