-- Default-off v2 capture only; no dispatcher, provider, Finance or billing write.
create table operations_catering_allocation_private.delivery_gates(organization_id uuid primary key,enabled boolean not null default false);
create table operations_catering_allocation_private.delivery_routes(
 id uuid primary key,organization_id uuid not null,destination_organization_id uuid not null,
 route_revision text not null,key_id text not null check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),endpoint_url text not null,enabled boolean not null default false,
 check(length(route_revision) between 1 and 200 and route_revision=btrim(route_revision,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
 check(endpoint_url ~ '^https://[^/@?#]+/functions/v1/operations-catering-allocation-cost-receive$'),unique(organization_id,route_revision)
);
create table operations_catering_allocation_private.delivery_queue(
 id uuid primary key default gen_random_uuid(),source_outbox_id uuid not null unique references public.operations_catering_cost_outbox(id),
 organization_id uuid not null,source_stream_id text not null,source_revision bigint not null,allocation_event_id uuid not null,
 destination_organization_id uuid not null,route_id uuid not null references operations_catering_allocation_private.delivery_routes(id),
 route_revision text not null,key_id text not null,endpoint_url text not null,envelope jsonb not null,raw_body text not null,
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','leased','delivered','superseded','blocked')),
 lease_owner text,lease_token uuid,lease_until timestamptz,attempts integer not null default 0,last_receipt jsonb,last_error text,
 foreign key(organization_id,allocation_event_id) references operations_catering_allocation_private.events(organization_id,event_id),
 foreign key(organization_id,source_stream_id,source_revision) references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision),
 check(octet_length(raw_body)<=262144),check((status='leased')=(lease_owner is not null and lease_token is not null and lease_until is not null))
);
do $$declare t text;begin foreach t in array array['delivery_gates','delivery_routes','delivery_queue'] loop
 execute format('alter table operations_catering_allocation_private.%I enable row level security',t);
 execute format('revoke all on operations_catering_allocation_private.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on operations_catering_allocation_private.%I to service_role',t);
 execute format('create trigger %I before truncate on operations_catering_allocation_private.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;end;$$;
grant insert,update(enabled) on operations_catering_allocation_private.delivery_gates,operations_catering_allocation_private.delivery_routes to service_role;
create trigger allocation_delivery_gate_identity before update or delete on operations_catering_allocation_private.delivery_gates for each row execute function public.operations_catering_mapping_guard();
create trigger allocation_delivery_route_identity before update or delete on operations_catering_allocation_private.delivery_routes for each row execute function public.operations_catering_mapping_guard();
create trigger allocation_delivery_capture_identity before update or delete on operations_catering_allocation_private.delivery_queue for each row execute function operations_catering_private.finance_queue_guard_v1();

create function operations_catering_allocation_private.prepare_delivery_v2(p_outbox uuid,p_route uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_catering_cost_outbox%rowtype;p public.operations_catering_cost_publications%rowtype;
 obs public.operations_catering_source_observations%rowtype;e operations_catering_allocation_private.events%rowtype;
 cap operations_catering_allocation_private.event_finance_capabilities%rowtype;route operations_catering_allocation_private.delivery_routes%rowtype;
 saved operations_catering_allocation_private.delivery_queue%rowtype;prior operations_catering_allocation_private.delivery_queue%rowtype;
 old operations_catering_private.finance_delivery_queue%rowtype;m operations_catering_private.finance_delivery_maps%rowtype;
 d jsonb;maps jsonb:='[]';body text;envelope jsonb;map_id uuid;previous_envelope jsonb;
begin
 if p_outbox is null or p_route is null then raise exception 'allocation capture explicit scope required' using errcode='22023';end if;
 select * into o from public.operations_catering_cost_outbox where id=p_outbox for share;
 if not found then raise exception 'allocation original outbox missing' using errcode='42501';end if;
 perform 1 from operations_catering_allocation_private.delivery_gates where organization_id=o.organization_id and enabled for share;
 if not found then raise exception 'allocation delivery disabled' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('native-catering-allocation-capture:'||o.organization_id::text||':'||o.source_stream_id,0));
 select * into saved from operations_catering_allocation_private.delivery_queue where source_outbox_id=o.id;
 if found then
 if saved.route_id<>p_route then raise exception 'allocation historical capture cannot rebind route' using errcode='22023';end if;
 return jsonb_build_object('outcome','replayed','delivery_id',saved.id,'body_sha256',saved.body_sha256,'status',saved.status);end if;
 perform 1 from operations_catering_allocation_private.gates where organization_id=o.organization_id and enabled for share;
 if not found then raise exception 'allocation authority disabled for fresh capture' using errcode='42501';end if;
 select ev.* into e from operations_catering_allocation_private.heads h join operations_catering_allocation_private.events ev on ev.organization_id=h.organization_id and ev.event_id=h.current_event_id
 where h.organization_id=o.organization_id and h.source_stream_id=o.source_stream_id for share of h;
 if not found or o.source_revision<e.allocated_publication_revision then raise exception 'allocation current authority unavailable' using errcode='42501';end if;
 select * into cap from operations_catering_allocation_private.event_finance_capabilities where organization_id=e.organization_id and event_id=e.event_id;
 select * into route from operations_catering_allocation_private.delivery_routes where id=p_route and organization_id=o.organization_id and enabled for share;
 if not found or route.destination_organization_id<>cap.destination_organization_id then raise exception 'allocation captured recipient route denied' using errcode='42501';end if;
 select * into p from public.operations_catering_cost_publications where organization_id=o.organization_id and source_stream_id=o.source_stream_id and source_revision=o.source_revision;
 select * into obs from public.operations_catering_source_observations where organization_id=p.organization_id and id=p.observation_id;
 if obs.id is null or p.mapping_id<>e.next_mapping_id or p.snapshot->>'mapping_revision' is distinct from e.document->>'next_mapping_revision'
 or p.snapshot->>'project_id' is distinct from e.target_project_id::text or p.snapshot->>'obligation_id' is distinct from e.target_obligation_id::text then raise exception 'allocation publication current lineage denied' using errcode='42501';end if;
 if o.source_revision=e.allocated_publication_revision then
 if e.allocation_revision=1 then
 select * into old from operations_catering_private.finance_delivery_queue where organization_id=o.organization_id and source_stream_id=o.source_stream_id and source_revision=e.base_publication_revision and status='delivered';
 if not found then raise exception 'allocation prior v1 delivery acknowledgement unavailable' using errcode='42501';end if;previous_envelope:=old.envelope;
 else
 select * into prior from operations_catering_allocation_private.delivery_queue where organization_id=o.organization_id and source_stream_id=o.source_stream_id and source_revision=e.base_publication_revision and status='delivered';
 if not found or (prior.envelope->'allocation_event'->>'allocation_revision')::bigint<>e.allocation_revision-1 then raise exception 'allocation prior v2 delivery acknowledgement unavailable' using errcode='42501';end if;previous_envelope:=prior.envelope;end if;
 if previous_envelope->>'destination_organization_id' is distinct from cap.destination_organization_id::text
 or previous_envelope->>'source_observation_id' is distinct from e.source_observation_id::text
 or previous_envelope->>'source_mapping_id' is distinct from e.previous_mapping_id::text
 or operations_catering_allocation_private.cost_fingerprint_v2(previous_envelope->'snapshot') is distinct from e.document->>'source_cost_fingerprint'
 or not exists(select 1 from jsonb_array_elements(previous_envelope->'destination_mappings') x where x->>'mapping_id'=cap.previous_finance_mapping_id::text)
 then raise exception 'allocation acknowledgement predecessor/captured retirement mismatch' using errcode='42501';end if;
 else
 perform 1 from operations_catering_allocation_private.delivery_queue where organization_id=o.organization_id and source_stream_id=o.source_stream_id and source_revision<o.source_revision and allocation_event_id=e.event_id and status='delivered';
 if not found then raise exception 'allocation initial delivery acknowledgement unavailable for later source' using errcode='42501';end if;end if;
 for d in select value from jsonb_array_elements(o.destinations) loop
 if d->>'project_id'=e.target_project_id::text and d->>'obligation_id'=e.target_obligation_id::text then map_id:=cap.next_finance_mapping_id;
 elsif o.source_revision=e.allocated_publication_revision and d->>'project_id'=e.document->>'from_project_id' and d->>'obligation_id'=e.document->>'from_obligation_id' then map_id:=cap.previous_finance_mapping_id;
 else raise exception 'allocation unrelated destination denied' using errcode='42501';end if;
 perform 1 from public.projects where organization_id=o.organization_id and id=(d->>'project_id')::uuid and deleted_at is null for share;
 if not found then raise exception 'allocation current/retirement live project denied' using errcode='42501';end if;
 select * into m from operations_catering_private.finance_delivery_maps where mapping_id=map_id and organization_id=o.organization_id and destination_organization_id=cap.destination_organization_id
 and source_project_id=(d->>'project_id')::uuid and source_obligation_id=(d->>'obligation_id')::uuid and currency=p.snapshot->>'currency' and enabled for share;
 if not found then raise exception 'allocation original recipient capability revoked' using errcode='42501';end if;
 maps:=maps||jsonb_build_array(jsonb_build_object('mapping_id',m.mapping_id,'mapping_revision',m.mapping_revision,'source_project_id',m.source_project_id,'source_obligation_id',m.source_obligation_id,'destination_project_id',m.destination_project_id,'currency',m.currency));end loop;
 if jsonb_array_length(maps)<>(case when o.source_revision=e.allocated_publication_revision then 2 else 1 end) then raise exception 'allocation complete retirement coverage required' using errcode='22023';end if;
 envelope:=jsonb_build_object('schema_version','operations-catering-delivery.v2','operations_organization_id',o.organization_id,'destination_organization_id',route.destination_organization_id,
 'route_id',route.id,'route_revision',route.route_revision,'key_id',route.key_id,'source_stream_id',o.source_stream_id,'source_outbox_id',o.id,'source_observation_id',obs.id,'source_mapping_id',p.mapping_id,
 'destinations',o.destinations,'destination_mappings',maps,'snapshot',p.snapshot,'raw_entry',obs.raw_entry,'raw_review',obs.raw_review,'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256,'source_request_hash',obs.source_request_hash,'allocation_event',e.document);
 body:=envelope::text;if octet_length(body)>262144 then raise exception 'allocation capture too large' using errcode='22023';end if;
 insert into operations_catering_allocation_private.delivery_queue(source_outbox_id,organization_id,source_stream_id,source_revision,allocation_event_id,destination_organization_id,route_id,route_revision,key_id,endpoint_url,envelope,raw_body,body_sha256)
 values(o.id,o.organization_id,o.source_stream_id,o.source_revision,e.event_id,route.destination_organization_id,route.id,route.route_revision,route.key_id,route.endpoint_url,envelope,body,encode(sha256(convert_to(body,'UTF8')),'hex')) returning * into saved;
 return jsonb_build_object('outcome','prepared','delivery_id',saved.id,'body_sha256',saved.body_sha256,'status',saved.status);
end;$$;
revoke all on function operations_catering_allocation_private.prepare_delivery_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function operations_catering_allocation_private.prepare_delivery_v2(uuid,uuid) to service_role;
create function public.prepare_operations_catering_allocation_delivery_v2(p_source_outbox_id uuid,p_route_id uuid) returns jsonb language sql security invoker set search_path='' as $$select operations_catering_allocation_private.prepare_delivery_v2(p_source_outbox_id,p_route_id);$$;
revoke all on function public.prepare_operations_catering_allocation_delivery_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_operations_catering_allocation_delivery_v2(uuid,uuid) to service_role;
