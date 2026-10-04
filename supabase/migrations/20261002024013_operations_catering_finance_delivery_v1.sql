-- Explicit, default-off delivery of existing native publications. Original parked outbox is untouched.
create table operations_catering_private.finance_delivery_gates(organization_id uuid primary key,enabled boolean not null default false);
create table operations_catering_private.finance_delivery_routes(
 id uuid primary key,organization_id uuid not null,destination_organization_id uuid not null,route_revision text not null,
 key_id text not null check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),endpoint_url text not null,
 enabled boolean not null default false,
 check(length(route_revision) between 1 and 200 and route_revision=btrim(route_revision)),
 check(endpoint_url ~ '^https://[^/@?#]+/functions/v1/operations-catering-cost-receive$'),unique(organization_id,route_revision)
);
create table operations_catering_private.finance_delivery_maps(
 mapping_id uuid primary key,organization_id uuid not null,source_project_id uuid not null,source_obligation_id uuid not null,
 destination_organization_id uuid not null,destination_project_id uuid not null,mapping_revision text not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),enabled boolean not null default false,
 check(length(mapping_revision) between 1 and 200 and mapping_revision=btrim(mapping_revision)),
 unique(organization_id,source_project_id,source_obligation_id,mapping_revision)
);
create unique index operations_catering_finance_current_map on operations_catering_private.finance_delivery_maps
 (organization_id,source_project_id,source_obligation_id) where enabled;
create table operations_catering_private.finance_delivery_queue(
 id uuid primary key default gen_random_uuid(),source_outbox_id uuid not null unique references public.operations_catering_cost_outbox(id),
 organization_id uuid not null,source_stream_id text not null,source_revision bigint not null,
 destination_organization_id uuid not null,route_id uuid not null references operations_catering_private.finance_delivery_routes(id),
 route_revision text not null,key_id text not null,endpoint_url text not null,envelope jsonb not null,raw_body text not null,
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','leased','delivered','superseded','blocked')),
 lease_owner text,lease_token uuid,lease_until timestamptz,attempts integer not null default 0,
 last_receipt jsonb,last_error text,
 check(octet_length(raw_body)<=262144),
 check((status='leased')=(lease_owner is not null and lease_token is not null and lease_until is not null))
);
create function operations_catering_private.finance_queue_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'UPDATE' or (to_jsonb(NEW)-array['status','lease_owner','lease_token','lease_until','attempts','last_receipt','last_error'])
 is distinct from (to_jsonb(OLD)-array['status','lease_owner','lease_token','lease_until','attempts','last_receipt','last_error'])
 then raise exception 'native delivery capture is immutable' using errcode='55000';end if;return NEW;
end;$$;
revoke all on function operations_catering_private.finance_queue_guard_v1() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['finance_delivery_gates','finance_delivery_routes','finance_delivery_maps','finance_delivery_queue'] loop
 execute format('alter table operations_catering_private.%I enable row level security',t);
 execute format('revoke all on operations_catering_private.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on operations_catering_private.%I to service_role',t);
 execute format('create trigger %I before truncate on operations_catering_private.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 if t in ('finance_delivery_routes','finance_delivery_maps') then
 execute format('grant insert,update on operations_catering_private.%I to service_role',t);
 execute format('create trigger %I before update or delete on operations_catering_private.%I for each row execute function public.operations_catering_mapping_guard()',t||'_identity',t);
 end if;
 end loop;
end;$$;
grant insert,update on operations_catering_private.finance_delivery_gates to service_role;
create trigger operations_catering_finance_gate_identity before update or delete on operations_catering_private.finance_delivery_gates
 for each row execute function public.operations_catering_mapping_guard();
create trigger operations_catering_finance_queue_immutable before update or delete on operations_catering_private.finance_delivery_queue
 for each row execute function operations_catering_private.finance_queue_guard_v1();

create function operations_catering_private.prepare_finance_delivery_v1(p_source_outbox_id uuid,p_route_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 o public.operations_catering_cost_outbox%rowtype;pub public.operations_catering_cost_publications%rowtype;
 obs public.operations_catering_source_observations%rowtype;route operations_catering_private.finance_delivery_routes%rowtype;
 saved operations_catering_private.finance_delivery_queue%rowtype;previous operations_catering_private.finance_delivery_queue%rowtype;
 map operations_catering_private.finance_delivery_maps%rowtype;d jsonb;captured jsonb;maps jsonb:='[]';envelope jsonb;body text;
begin
 if p_source_outbox_id is null or p_route_id is null then raise exception 'native capture scope required' using errcode='22023';end if;
 select * into o from public.operations_catering_cost_outbox where id=p_source_outbox_id for share;
 if not found then raise exception 'native original outbox missing' using errcode='42501';end if;
 perform 1 from operations_catering_private.finance_delivery_gates where organization_id=o.organization_id and enabled for share;
 if not found then raise exception 'native Finance delivery disabled' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('native-catering-finance-prepare:'||o.organization_id::text||':'||o.source_stream_id,0));
 select * into saved from operations_catering_private.finance_delivery_queue where source_outbox_id=o.id;
 if found then
 if saved.route_id<>p_route_id then raise exception 'native capture route cannot rebind' using errcode='22023';end if;
 return jsonb_build_object('outcome','replayed','delivery_id',saved.id,'body_sha256',saved.body_sha256,'status',saved.status);
 end if;
 select * into route from operations_catering_private.finance_delivery_routes where id=p_route_id and organization_id=o.organization_id and enabled for share;
 if not found then raise exception 'native explicit Finance route denied' using errcode='42501';end if;
 select * into pub from public.operations_catering_cost_publications where organization_id=o.organization_id
 and source_stream_id=o.source_stream_id and source_revision=o.source_revision;
 select * into obs from public.operations_catering_source_observations where organization_id=o.organization_id and id=pub.observation_id;
 if pub.organization_id is null or obs.id is null then raise exception 'native publication/observation unavailable' using errcode='42501';end if;
 select * into previous from operations_catering_private.finance_delivery_queue where organization_id=o.organization_id
 and source_stream_id=o.source_stream_id and source_revision<o.source_revision order by source_revision desc limit 1;
 if previous.id is not null then
 if previous.destination_organization_id<>route.destination_organization_id then raise exception 'native cross-recipient withdrawal contract unavailable' using errcode='42501';end if;
 perform 1 from operations_catering_private.finance_delivery_routes where id=previous.route_id and organization_id=o.organization_id
 and destination_organization_id=route.destination_organization_id and route_revision=previous.route_revision and enabled for share;
 if not found then raise exception 'native historical retirement route revoked' using errcode='42501';end if;
 end if;
 for d in select value from jsonb_array_elements(o.destinations) loop
 captured:=null;
 if previous.id is not null and (d->>'project_id'<>pub.snapshot->>'project_id' or d->>'obligation_id'<>pub.snapshot->>'obligation_id') then
 select value into captured from jsonb_array_elements(previous.envelope->'destination_mappings')
 where value->>'source_project_id'=d->>'project_id' and value->>'source_obligation_id'=d->>'obligation_id';
 end if;
 if captured is not null then
 select * into map from operations_catering_private.finance_delivery_maps where mapping_id=(captured->>'mapping_id')::uuid
 and organization_id=o.organization_id and destination_organization_id=route.destination_organization_id
 and mapping_revision=captured->>'mapping_revision' and destination_project_id=(captured->>'destination_project_id')::uuid and enabled for share;
 else
 select * into map from operations_catering_private.finance_delivery_maps where organization_id=o.organization_id
 and source_project_id=(d->>'project_id')::uuid and source_obligation_id=(d->>'obligation_id')::uuid
 and destination_organization_id=route.destination_organization_id and enabled for share;
 end if;
 if not found or map.currency is distinct from pub.snapshot->>'currency' then raise exception 'native current/retirement mapping unavailable' using errcode='42501';end if;
 if previous.id is not null and previous.envelope->'snapshot'->>'project_id'=pub.snapshot->>'project_id'
 and previous.envelope->'snapshot'->>'obligation_id'=pub.snapshot->>'obligation_id'
 and d->>'project_id'=pub.snapshot->>'project_id' and d->>'obligation_id'=pub.snapshot->>'obligation_id'
 and not exists(select 1 from jsonb_array_elements(previous.envelope->'destination_mappings') m
 where m->>'source_project_id'=d->>'project_id' and m->>'source_obligation_id'=d->>'obligation_id'
 and m->>'mapping_id'=map.mapping_id::text and m->>'mapping_revision'=map.mapping_revision
 and m->>'destination_project_id'=map.destination_project_id::text and m->>'currency'=map.currency)
 then raise exception 'native unchanged Operations target Finance retirement unavailable' using errcode='42501';end if;

 maps:=maps||jsonb_build_array(jsonb_build_object('mapping_id',map.mapping_id,'mapping_revision',map.mapping_revision,
 'source_project_id',map.source_project_id,'source_obligation_id',map.source_obligation_id,'destination_project_id',map.destination_project_id,'currency',map.currency));
 end loop;
 if jsonb_array_length(maps)<>jsonb_array_length(o.destinations) or jsonb_array_length(maps) not between 1 and 2 then raise exception 'native full destination coverage required' using errcode='22023';end if;
 envelope:=jsonb_build_object('schema_version','operations-catering-delivery.v1','operations_organization_id',o.organization_id,
 'destination_organization_id',route.destination_organization_id,'route_id',route.id,'route_revision',route.route_revision,'key_id',route.key_id,
 'source_stream_id',o.source_stream_id,'source_outbox_id',o.id,'source_observation_id',obs.id,'source_mapping_id',pub.mapping_id,
 'destinations',o.destinations,'destination_mappings',maps,'snapshot',pub.snapshot,'raw_entry',obs.raw_entry,'raw_review',obs.raw_review,
 'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256,'source_request_hash',obs.source_request_hash);
 body:=envelope::text;
 if octet_length(body)>262144 then raise exception 'native immutable delivery too large' using errcode='22023';end if;
 insert into operations_catering_private.finance_delivery_queue(source_outbox_id,organization_id,source_stream_id,source_revision,destination_organization_id,
 route_id,route_revision,key_id,endpoint_url,envelope,raw_body,body_sha256)
 values(o.id,o.organization_id,o.source_stream_id,o.source_revision,route.destination_organization_id,route.id,route.route_revision,route.key_id,
 route.endpoint_url,envelope,body,encode(sha256(convert_to(body,'UTF8')),'hex')) returning * into saved;
 return jsonb_build_object('outcome','prepared','delivery_id',saved.id,'body_sha256',saved.body_sha256,'status',saved.status);
end;$$;
revoke all on function operations_catering_private.prepare_finance_delivery_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function operations_catering_private.prepare_finance_delivery_v1(uuid,uuid) to service_role;
create function public.prepare_operations_catering_finance_delivery_v1(p_source_outbox_id uuid,p_route_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select operations_catering_private.prepare_finance_delivery_v1(p_source_outbox_id,p_route_id);$$;
revoke all on function public.prepare_operations_catering_finance_delivery_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_operations_catering_finance_delivery_v1(uuid,uuid) to service_role;

create function operations_catering_private.claim_finance_delivery_v1(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q operations_catering_private.finance_delivery_queue%rowtype;begin
 if p_organization_id is null or p_delivery_id is null or p_lease_owner is null or p_lease_owner !~ '^[A-Za-z0-9_-]{8,100}$' then raise exception 'native lease scope required' using errcode='22023';end if;
 perform 1 from operations_catering_private.finance_delivery_gates where organization_id=p_organization_id and enabled for share;
 if not found then raise exception 'native delivery disabled' using errcode='42501';end if;
 select * into q from operations_catering_private.finance_delivery_queue where id=p_delivery_id and organization_id=p_organization_id for update skip locked;
 if not found then
 if exists(select 1 from operations_catering_private.finance_delivery_queue where id=p_delivery_id and organization_id=p_organization_id) then return null;end if;
 raise exception 'native scoped delivery missing' using errcode='42501';end if;
 if q.status in ('delivered','superseded','blocked') or (q.status='leased' and q.lease_until>clock_timestamp()) then return null;end if;
 perform 1 from operations_catering_private.finance_delivery_routes where id=q.route_id and organization_id=q.organization_id
 and destination_organization_id=q.destination_organization_id and route_revision=q.route_revision and key_id=q.key_id and endpoint_url=q.endpoint_url and enabled for share;
 if not found then raise exception 'native captured delivery route revoked' using errcode='42501';end if;
 update operations_catering_private.finance_delivery_queue set status='leased',lease_owner=p_lease_owner,lease_token=gen_random_uuid(),
 lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 where id=q.id returning * into q;
 return jsonb_build_object('id',q.id,'source_outbox_id',q.source_outbox_id,'organization_id',q.organization_id,'source_stream_id',q.source_stream_id,
 'source_revision',q.source_revision,'raw_body',q.raw_body,'body_sha256',q.body_sha256,'destination_organization_id',q.destination_organization_id,
 'route_id',q.route_id,'route_revision',q.route_revision,'key_id',q.key_id,'endpoint_url',q.endpoint_url,'lease_owner',q.lease_owner,'lease_token',q.lease_token);
end;$$;
create function operations_catering_private.finish_finance_delivery_v1(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb,p_error text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q operations_catering_private.finance_delivery_queue%rowtype;k text;applied bigint;current_rev bigint;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 if p_outcome is null or p_outcome not in ('delivered','superseded','retry','blocked') then raise exception 'native finish outcome invalid' using errcode='22023';end if;
 select * into q from operations_catering_private.finance_delivery_queue where id=p_delivery_id and organization_id=p_organization_id for update;
 if not found or q.status<>'leased' or q.lease_owner is distinct from p_lease_owner or q.lease_token is distinct from p_lease_token or q.lease_until<=clock_timestamp()
 then raise exception 'native lease changed/expired' using errcode='42501';end if;
 if p_outcome in ('delivered','superseded') then
 if jsonb_typeof(p_receipt) is distinct from 'object' or not p_receipt ?& keys or p_receipt-keys<>'{}'::jsonb
 or jsonb_typeof(p_receipt->'outcome') is distinct from 'string' or p_receipt->>'outcome' not in ('accepted','replayed','stale')
 or p_receipt->>'schema' is distinct from 'operations-catering-receipt.v1' or p_receipt->'shadow_only' is distinct from 'true'::jsonb
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
 or (p_outcome='delivered' and (p_receipt->>'outcome' not in ('accepted','replayed') or applied<>q.source_revision or current_rev<applied or p_receipt->>'snapshot_fingerprint'<>q.body_sha256))
 or (p_outcome='superseded' and (p_receipt->>'outcome' is distinct from 'stale' or applied<>current_rev or current_rev<=q.source_revision))
 then raise exception 'native receipt outcome/hash invalid' using errcode='22023';end if;
 if p_error is not null then raise exception 'native acknowledged delivery must not carry error' using errcode='22023';end if;
 else
 if p_receipt is not null or p_error is null or p_error !~ '^catering_finance_(ack_unknown|capture_or_configuration_invalid|http_[0-9]{3})$'
 then raise exception 'native transport error invalid' using errcode='22023';end if;
 end if;
 update operations_catering_private.finance_delivery_queue set status=case when p_outcome='retry' then 'pending' else p_outcome end,
 lease_owner=null,lease_token=null,lease_until=null,last_receipt=p_receipt,last_error=p_error where id=q.id;
 return jsonb_build_object('delivery_id',q.id,'status',case when p_outcome='retry' then 'pending' else p_outcome end,'source_outbox_status','parked');
end;$$;
revoke all on function operations_catering_private.claim_finance_delivery_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function operations_catering_private.finish_finance_delivery_v1(uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function operations_catering_private.claim_finance_delivery_v1(uuid,uuid,text) to service_role;
grant execute on function operations_catering_private.finish_finance_delivery_v1(uuid,uuid,text,uuid,text,jsonb,text) to service_role;
create function public.claim_operations_catering_finance_delivery_v1(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text)
returns jsonb language sql security invoker set search_path='' as $$select operations_catering_private.claim_finance_delivery_v1(p_organization_id,p_delivery_id,p_lease_owner);$$;
create function public.finish_operations_catering_finance_delivery_v1(p_organization_id uuid,p_delivery_id uuid,p_lease_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb,p_error text)
returns jsonb language sql security invoker set search_path='' as $$select operations_catering_private.finish_finance_delivery_v1(p_organization_id,p_delivery_id,p_lease_owner,p_lease_token,p_outcome,p_receipt,p_error);$$;
revoke all on function public.claim_operations_catering_finance_delivery_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_operations_catering_finance_delivery_v1(uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_operations_catering_finance_delivery_v1(uuid,uuid,text) to service_role;
grant execute on function public.finish_operations_catering_finance_delivery_v1(uuid,uuid,text,uuid,text,jsonb,text) to service_role;
