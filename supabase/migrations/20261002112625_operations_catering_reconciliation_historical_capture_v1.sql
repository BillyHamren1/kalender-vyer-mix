-- Additive DEFAULT-OFF candidate. Historical19 capture is NEW server-derived
-- provenance, not an ordinary delivered queue or Finance acceptance. Existing
-- captures reuse exact bytes; old native maps/outboxes/statuses remain untouched.
-- Dependencies: actual14 source DDL plus new101049 private cursor/admission.
create table operations_catering_reconciliation_private.routes (
 id uuid primary key,organization_id uuid not null,destination_organization_id uuid not null,
 route_revision text not null,key_id text not null check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),endpoint_url text not null,
 original_v2_route_id uuid not null references operations_catering_allocation_private.delivery_routes(id),enabled boolean not null default false,
 check(length(route_revision) between 1 and 200 and route_revision=operations_catering_allocation_private.trim_command_text_v2(route_revision)),
 check(endpoint_url ~ '^https://[^/@?#]+/functions/v1/operations-catering-reconciliation-cost-receive$'),unique(organization_id,route_revision)
);
create unique index reconciliation_one_current_route on operations_catering_reconciliation_private.routes(organization_id,destination_organization_id) where enabled;
create table operations_catering_reconciliation_private.permits (
 id uuid primary key,organization_id uuid not null,destination_organization_id uuid not null,source_stream_id text not null,
 actor_system_user_id uuid not null,idempotency_key text not null,command jsonb not null,
 cursor_id uuid not null references operations_catering_reconciliation_private.verified_cursors(cursor_id),
 route_id uuid not null references operations_catering_reconciliation_private.routes(id),route_revision text not null,key_id text not null,
 permit jsonb not null,preview jsonb not null,history_root_sha256 text not null,raw_body text not null,body_sha256 text not null,
 created_at timestamptz not null,expires_at timestamptz not null,step_count integer not null check(step_count between 1 and 8),
 final_publication_revision bigint not null,final_allocation_revision bigint not null,final_event_id uuid not null,final_observation_id uuid not null,final_mapping_id uuid not null,
 final_body_sha256 text not null,final_obligation_revision bigint not null,
 unique(organization_id,idempotency_key),check(expires_at=created_at+interval '300 seconds'),check(octet_length(raw_body)<=262144),
 foreign key(organization_id,source_stream_id,final_publication_revision) references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision),
 foreign key(organization_id,final_event_id) references operations_catering_allocation_private.events(organization_id,event_id)
);
create table operations_catering_reconciliation_private.historical_captures (
 permit_id uuid not null references operations_catering_reconciliation_private.permits(id) deferrable initially deferred,
 index integer not null check(index between 1 and 8),organization_id uuid not null,source_stream_id text not null,source_revision bigint not null,
 source_outbox_id uuid not null references public.operations_catering_cost_outbox(id),allocation_event_id uuid not null,
 provenance text not null check(provenance in ('existing_queue','server_derived')),source_queue_id uuid references operations_catering_allocation_private.delivery_queue(id),
 route_id uuid not null references operations_catering_allocation_private.delivery_routes(id),route_revision text not null,key_id text not null,
 endpoint_url text not null,envelope jsonb not null,raw_body text not null,body_sha256 text not null,descriptor jsonb not null,step_sha256 text not null,
 primary key(permit_id,index),unique(permit_id,source_revision),check(octet_length(raw_body)<=262144),
 check((provenance='existing_queue')=(source_queue_id is not null)),
 foreign key(organization_id,source_stream_id,source_revision) references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision),
 foreign key(organization_id,allocation_event_id) references operations_catering_allocation_private.events(organization_id,event_id)
);
do $$declare t text;begin
 foreach t in array array['routes','permits','historical_captures'] loop
 execute format('alter table operations_catering_reconciliation_private.%I enable row level security',t);
 execute format('revoke all on operations_catering_reconciliation_private.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on operations_catering_reconciliation_private.%I to service_role',t);
 execute format('create trigger %I before truncate on operations_catering_reconciliation_private.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;
end;$$;
grant insert,update(enabled) on operations_catering_reconciliation_private.routes to service_role;
create trigger reconciliation_route_identity before update or delete on operations_catering_reconciliation_private.routes for each row execute function public.operations_catering_mapping_guard();
create trigger reconciliation_permit_immutable before update or delete on operations_catering_reconciliation_private.permits for each row execute function public.operations_personnel_evidence_immutable();
create trigger reconciliation_capture_immutable before update or delete on operations_catering_reconciliation_private.historical_captures for each row execute function public.operations_personnel_evidence_immutable();


-- Server-owned transaction inventory fixes queue/route choices before later
-- project/obligation/map/stream locks. A newly arriving ordinary queue cannot
-- introduce a new late route lock during capture INSERT reentry.
create table operations_catering_reconciliation_private.inventory_scope_holds(
 id uuid primary key default gen_random_uuid(),cursor_id uuid not null references operations_catering_reconciliation_private.verified_cursors(cursor_id),
 organization_id uuid not null,source_stream_id text not null,upper_revision bigint not null,
 reconciliation_route_id uuid not null references operations_catering_reconciliation_private.routes(id),
 creation_txid xid8 not null,actor_system_user_id uuid not null,selection jsonb not null,
 created_at timestamptz not null default clock_timestamp(),unique(cursor_id,creation_txid)
);
alter table operations_catering_reconciliation_private.inventory_scope_holds enable row level security;
revoke all on operations_catering_reconciliation_private.inventory_scope_holds from public,anon,authenticated,service_role;
create trigger inventory_scope_hold_immutable before update or delete on operations_catering_reconciliation_private.inventory_scope_holds for each row execute function public.operations_personnel_evidence_immutable();
create trigger inventory_scope_hold_no_truncate before truncate on operations_catering_reconciliation_private.inventory_scope_holds for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_catering_reconciliation_private.inventory_selection_v1(p_org uuid,p_stream text,p_lower bigint,p_upper bigint,p_route uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare selected jsonb;default_route uuid;begin
 select original_v2_route_id into default_route from operations_catering_reconciliation_private.routes where id=p_route and organization_id=p_org;
 if default_route is null or p_lower is null or p_upper is null or p_lower<1 or p_upper<=p_lower or p_upper-p_lower>8 then raise exception 'inventory selection bounds invalid' using errcode='42501';end if;
 select jsonb_agg(jsonb_build_object('publication_revision',pub.source_revision,'source_outbox_id',o.id,'source_queue_id',q.id,'original_route_id',coalesce(q.route_id,default_route)) order by pub.source_revision)
 into selected from public.operations_catering_cost_publications pub
 join public.operations_catering_cost_outbox o on o.organization_id=pub.organization_id and o.source_stream_id=pub.source_stream_id and o.source_revision=pub.source_revision
 left join operations_catering_allocation_private.delivery_queue q on q.source_outbox_id=o.id
 where pub.organization_id=p_org and pub.source_stream_id=p_stream and pub.source_revision>p_lower and pub.source_revision<=p_upper;
 if selected is null or jsonb_array_length(selected)<>p_upper-p_lower then raise exception 'complete original inventory selection required' using errcode='42501';end if;
 return selected;
end;$$;
revoke all on function operations_catering_reconciliation_private.inventory_selection_v1(uuid,text,bigint,bigint,uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.inventory_scope_hold_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare org uuid;c operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=new.cursor_id;
 if not found or c.organization_id is distinct from org or new.organization_id is distinct from org
 or new.source_stream_id is distinct from c.source_stream_id or new.creation_txid is distinct from pg_current_xact_id()
 or new.actor_system_user_id is distinct from auth.uid() or clock_timestamp()>=c.expires_at
 then raise exception 'owner inventory hold scope invalid' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 perform 1 from operations_catering_reconciliation_private.routes where id=new.reconciliation_route_id and organization_id=org and destination_organization_id=c.finance_organization_id and enabled for share;
 if not found then raise exception 'inventory exact enrolled recipient route required' using errcode='42501';end if;
 if not exists(select 1 from public.operations_catering_cost_streams where organization_id=org and source_stream_id=c.source_stream_id and current_revision=new.upper_revision)
 then raise exception 'inventory hold source advanced' using errcode='PT409';end if;
 if new.selection is distinct from operations_catering_reconciliation_private.inventory_selection_v1(org,c.source_stream_id,c.publication_revision,new.upper_revision,new.reconciliation_route_id)
 then raise exception 'owner inventory selection fabricated' using errcode='42501';end if;
 new.created_at:=clock_timestamp();return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.inventory_scope_hold_guard_v1() from public,anon,authenticated,service_role;
create trigger inventory_scope_hold_binding before insert on operations_catering_reconciliation_private.inventory_scope_holds for each row execute function operations_catering_reconciliation_private.inventory_scope_hold_guard_v1();

create function operations_catering_reconciliation_private.hold_inventory_selection_v1(p_cursor_id uuid,p_upper bigint,p_route uuid)
 returns operations_catering_reconciliation_private.inventory_scope_holds language plpgsql security definer set search_path='' as $$
declare org uuid;c operations_catering_reconciliation_private.verified_cursors%rowtype;h operations_catering_reconciliation_private.inventory_scope_holds%rowtype;selected jsonb;
begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found or c.organization_id is distinct from org then raise exception 'inventory selection actor denied' using errcode='42501';end if;
 selected:=operations_catering_reconciliation_private.inventory_selection_v1(org,c.source_stream_id,c.publication_revision,p_upper,p_route);
 select * into h from operations_catering_reconciliation_private.inventory_scope_holds where cursor_id=p_cursor_id and creation_txid=pg_current_xact_id();
 if found then
 if h.organization_id is distinct from org or h.source_stream_id is distinct from c.source_stream_id or h.upper_revision is distinct from p_upper
 or h.reconciliation_route_id is distinct from p_route or h.actor_system_user_id is distinct from auth.uid() or h.selection is distinct from selected
 then raise exception 'inventory selection changed before scope reentry' using errcode='PT409';end if;
 return h;
 end if;
 insert into operations_catering_reconciliation_private.inventory_scope_holds(cursor_id,organization_id,source_stream_id,upper_revision,reconciliation_route_id,creation_txid,actor_system_user_id,selection)
 values(c.cursor_id,org,c.source_stream_id,p_upper,p_route,pg_current_xact_id(),auth.uid(),selected) returning * into h;
 return h;
end;$$;
revoke all on function operations_catering_reconciliation_private.hold_inventory_selection_v1(uuid,bigint,uuid) from public,anon,authenticated,service_role;

-- Historical predecessor eligibility compares the SAME strict original13 and
-- independent signed cursor, but resolves its actual saved LOCAL publication,
-- not the newer local stream head. It never marks an earlier queue delivered.
create function operations_catering_reconciliation_private.historical_delivered_cursor_v1(p_cursor_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;
 resolved operations_catering_reconciliation_private.verified_cursors%rowtype;
 pub public.operations_catering_cost_publications%rowtype;
 head operations_catering_allocation_private.heads%rowtype;
 receipt jsonb;captured jsonb;delivery_id uuid;raw text;body_hash text;recipient uuid;schema_name text;k text;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
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
 perform operations_catering_reconciliation_private.require_verified_original_receipt_v1(c.cursor_id,receipt);
 if clock_timestamp()>=c.expires_at then raise exception 'admission cursor expired after eligibility read' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256,'organization_id',c.organization_id,
 'source_stream_id',c.source_stream_id,'publication_revision',c.publication_revision,'allocation_revision',c.allocation_revision,
 'allocation_event_id',c.allocation_event_id,'mapping_id',pub.mapping_id,'observation_id',pub.observation_id,
 'delivery_id',delivery_id,'receipt_id',receipt->'receipt_id','finance_snapshot_id',c.finance_snapshot_id,
 'receipt_schema',schema_name,'body_sha256',body_hash);
end;$$;
revoke all on function operations_catering_reconciliation_private.historical_delivered_cursor_v1(uuid) from public,anon,authenticated,service_role;


-- Resolve one actual saved publication. This does not create a capture/queue,
-- permit or receipt. Current cursor/head CAS and bounds belong to the caller.
create function operations_catering_reconciliation_private.resolve_historical_body_v1(p_organization_id uuid,p_source_stream_id text,p_source_revision bigint,p_reconciliation_route_id uuid,p_selection_hold_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;route operations_catering_reconciliation_private.routes%rowtype;
 original_route operations_catering_allocation_private.delivery_routes%rowtype;
 p public.operations_catering_cost_publications%rowtype;o public.operations_catering_cost_outbox%rowtype;
 obs public.operations_catering_source_observations%rowtype;e operations_catering_allocation_private.events%rowtype;
 cap operations_catering_allocation_private.event_finance_capabilities%rowtype;
 native_map public.operations_catering_project_mappings%rowtype;q operations_catering_allocation_private.delivery_queue%rowtype;
 m operations_catering_private.finance_delivery_maps%rowtype;d jsonb;maps jsonb:='[]';map_id uuid;
 envelope jsonb;body text;body_hash text;existing_count bigint;selected jsonb;selection_hold operations_catering_reconciliation_private.inventory_scope_holds%rowtype;begin
 perform set_config('lock_timeout','3s',true);
 org:=operations_economy_private.authorize_scope_admin_v1();
 if org is distinct from p_organization_id or p_source_stream_id is null or p_source_revision is null or p_source_revision not between 1 and 9007199254740991 then raise exception 'reconciliation historical scope denied' using errcode='42501';end if;
 select * into selection_hold from operations_catering_reconciliation_private.inventory_scope_holds where id=p_selection_hold_id;
 if not found or selection_hold.creation_txid is distinct from pg_current_xact_id() or selection_hold.actor_system_user_id is distinct from auth.uid()
 or selection_hold.organization_id is distinct from org or selection_hold.source_stream_id is distinct from p_source_stream_id or selection_hold.reconciliation_route_id is distinct from p_reconciliation_route_id
 then raise exception 'server held original inventory required' using errcode='42501';end if;
 select value into selected from jsonb_array_elements(selection_hold.selection) where (value->>'publication_revision')::bigint=p_source_revision;
 if selected is null then raise exception 'original publication not held' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.gates where organization_id=org and enabled for share;
 if not found then raise exception 'reconciliation disabled' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.admission_policies where organization_id=org and enabled for share;
 if not found then raise exception 'reconciliation admission policy disabled' using errcode='42501';end if;
 select * into route from operations_catering_reconciliation_private.routes where id=p_reconciliation_route_id and organization_id=org and enabled for share;
 if not found then raise exception 'reconciliation explicit enrolled route required' using errcode='42501';end if;
 select * into p from public.operations_catering_cost_publications where organization_id=org and source_stream_id=p_source_stream_id and source_revision=p_source_revision;
 if not found then raise exception 'reconciliation genuine publication missing' using errcode='42501';end if;
 select count(*) into existing_count from public.operations_catering_cost_outbox where organization_id=org and source_stream_id=p_source_stream_id and source_revision=p_source_revision;
 if existing_count<>1 then raise exception 'reconciliation unique original outbox required' using errcode='42501';end if;
 select * into o from public.operations_catering_cost_outbox where organization_id=org and source_stream_id=p_source_stream_id and source_revision=p_source_revision;
 select * into e from operations_catering_allocation_private.events where organization_id=org and source_stream_id=p_source_stream_id and allocated_publication_revision<=p_source_revision order by allocated_publication_revision desc limit 1;
 if not found then raise exception 'reconciliation pre-allocation source publication unsupported' using errcode='42501';end if;
 select * into cap from operations_catering_allocation_private.event_finance_capabilities where organization_id=org and event_id=e.event_id;
 if not found or cap.destination_organization_id<>route.destination_organization_id then raise exception 'reconciliation original event recipient capability missing' using errcode='42501';end if;
 select * into obs from public.operations_catering_source_observations where organization_id=org and id=p.observation_id;
 select * into native_map from public.operations_catering_project_mappings where organization_id=org and id=p.mapping_id;
 if obs.id is null or native_map.id is null or p.mapping_id<>e.next_mapping_id
 or p.snapshot->>'mapping_revision' is distinct from e.document->>'next_mapping_revision'
 or p.snapshot->>'project_id' is distinct from e.target_project_id::text or p.snapshot->>'obligation_id' is distinct from e.target_obligation_id::text
 or native_map.project_id<>e.target_project_id or native_map.obligation_id<>e.target_obligation_id
 or native_map.mapping_revision is distinct from p.snapshot->>'mapping_revision' or native_map.worker_id::text is distinct from p.snapshot->>'worker_id'
 or native_map.catering_organization_id<>obs.catering_organization_id or native_map.catering_person_id<>obs.person_id or native_map.time_entry_id<>obs.time_entry_id
 or obs.entry_version::text is distinct from p.snapshot->>'source_time_entry_version' or obs.source_fingerprint is distinct from p.snapshot->>'source_fingerprint'
 or native_map.currency is distinct from p.snapshot->>'currency' or native_map.work_date::text is distinct from p.snapshot->>'work_date' or native_map.time_zone is distinct from p.snapshot->>'time_zone'
 then raise exception 'reconciliation historical immutable source tuple denied' using errcode='42501';end if;
 -- Historical native_map.enabled is intentionally NOT required or changed.
 select count(*) into existing_count from operations_catering_allocation_private.delivery_queue where source_outbox_id=o.id;
 if existing_count>1 then raise exception 'reconciliation ambiguous original queue' using errcode='42501';end if;
 select * into q from operations_catering_allocation_private.delivery_queue where source_outbox_id=o.id;
 -- Compare BEFORE any original route lock. Use the single captured q record
 -- throughout; a later phantom cannot introduce a newly chosen route/key.
 if o.id::text is distinct from selected->>'source_outbox_id' or q.id::text is distinct from selected->>'source_queue_id'
 or coalesce(q.route_id,route.original_v2_route_id)::text is distinct from selected->>'original_route_id'
 then raise exception 'original queue route selection changed' using errcode='PT409';end if;
 select * into original_route from operations_catering_allocation_private.delivery_routes where id=coalesce(q.route_id,route.original_v2_route_id) and organization_id=org and destination_organization_id=route.destination_organization_id and enabled for share;
 if not found or (q.id is not null and (original_route.route_revision<>q.route_revision or original_route.key_id<>q.key_id or original_route.endpoint_url<>q.endpoint_url or q.destination_organization_id<>route.destination_organization_id)) then raise exception 'reconciliation exact original v2 route revoked' using errcode='42501';end if;
 for d in select value from jsonb_array_elements(o.destinations) loop
 if d->>'project_id'=e.target_project_id::text and d->>'obligation_id'=e.target_obligation_id::text then map_id:=cap.next_finance_mapping_id;
 elsif p_source_revision=e.allocated_publication_revision and d->>'project_id'=e.document->>'from_project_id' and d->>'obligation_id'=e.document->>'from_obligation_id' then map_id:=cap.previous_finance_mapping_id;
 else raise exception 'reconciliation unrelated original destination' using errcode='42501';end if;
 perform 1 from public.projects where organization_id=org and id=(d->>'project_id')::uuid and deleted_at is null for share;
 if not found then raise exception 'reconciliation live current/retirement source project revoked' using errcode='42501';end if;
 select * into m from operations_catering_private.finance_delivery_maps where mapping_id=map_id and organization_id=org and destination_organization_id=cap.destination_organization_id and source_project_id=(d->>'project_id')::uuid and source_obligation_id=(d->>'obligation_id')::uuid and currency=p.snapshot->>'currency' and enabled for share;
 if not found then raise exception 'reconciliation original Finance capability revoked' using errcode='42501';end if;
 maps:=maps||jsonb_build_array(jsonb_build_object('mapping_id',m.mapping_id,'mapping_revision',m.mapping_revision,'source_project_id',m.source_project_id,'source_obligation_id',m.source_obligation_id,'destination_project_id',m.destination_project_id,'currency',m.currency));
 end loop;
 if jsonb_array_length(maps)<>(case when p_source_revision=e.allocated_publication_revision then 2 else 1 end) then raise exception 'reconciliation complete original destination coverage required' using errcode='22023';end if;
 perform 1 from public.operations_catering_publish_gates where organization_id=org and enabled for share;
 if not found then raise exception 'reconciliation native publication gate revoked' using errcode='42501';end if;
 perform 1 from public.operations_catering_source_bindings where organization_id=org and worker_id=native_map.worker_id and catering_organization_id=obs.catering_organization_id and catering_person_id=obs.person_id and enabled for share;
 if not found then raise exception 'reconciliation source worker binding revoked' using errcode='42501';end if;
 -- Preserved original capture constructor. Prices/source bytes are never inputs.
 envelope:=jsonb_build_object('schema_version','operations-catering-delivery.v2','operations_organization_id',o.organization_id,'destination_organization_id',original_route.destination_organization_id,
 'route_id',original_route.id,'route_revision',original_route.route_revision,'key_id',original_route.key_id,'source_stream_id',o.source_stream_id,'source_outbox_id',o.id,'source_observation_id',obs.id,'source_mapping_id',p.mapping_id,
 'destinations',o.destinations,'destination_mappings',maps,'snapshot',p.snapshot,'raw_entry',obs.raw_entry,'raw_review',obs.raw_review,'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256,'source_request_hash',obs.source_request_hash,'allocation_event',e.document);
 if q.id is not null then
 if q.organization_id<>org or q.source_stream_id<>p_source_stream_id or q.source_revision<>p_source_revision or q.allocation_event_id<>e.event_id
 or q.envelope is distinct from envelope or q.raw_body::jsonb is distinct from envelope
 or q.body_sha256 is distinct from encode(sha256(convert_to(q.raw_body,'UTF8')),'hex') then raise exception 'reconciliation existing captured source drift' using errcode='42501';end if;
 body:=q.raw_body;body_hash:=q.body_sha256;
 else body:=envelope::text;body_hash:=encode(sha256(convert_to(body,'UTF8')),'hex');end if;
 if octet_length(body)>262144 then raise exception 'reconciliation original19 capture too large' using errcode='22023';end if;
 return jsonb_build_object('provenance',case when q.id is null then 'server_derived' else 'existing_queue' end,'source_queue_id',q.id,
 'source_outbox_id',o.id,'allocation_event_id',e.event_id,'allocation_revision',e.allocation_revision,'event_fingerprint',e.fingerprint,
 'route_id',original_route.id,'route_revision',original_route.route_revision,'key_id',original_route.key_id,'endpoint_url',original_route.endpoint_url,
 'envelope',envelope,'raw_body',body,'body_sha256',body_hash,'source_observation_id',obs.id,'source_mapping_id',p.mapping_id,
 'source_entry_version',obs.entry_version,'source_cost_fingerprint',operations_catering_allocation_private.cost_fingerprint_v2(p.snapshot),
 'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256);
end;$$;
revoke all on function operations_catering_reconciliation_private.resolve_historical_body_v1(uuid,text,bigint,uuid,uuid) from public,anon,authenticated,service_role;

-- Authenticated bounded inventory/preview. No source, queue, capture or permit
-- writes. Discover the immutable latest hint, lock all configuration first,
-- then native mapping -> stream -> head, and reject changed hint after waiting.
create function operations_catering_reconciliation_private.inventory_v1(p_source_stream_id text,p_cursor_id uuid,p_cursor_sha256 text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();c operations_catering_reconciliation_private.verified_cursors%rowtype;
 route operations_catering_reconciliation_private.routes%rowtype;hint public.operations_catering_cost_publications%rowtype;
 h public.operations_catering_cost_streams%rowtype;ah operations_catering_allocation_private.heads%rowtype;
 native_map public.operations_catering_project_mappings%rowtype;obligation public.operations_project_obligation_heads%rowtype;
 eligibility jsonb;body jsonb;envelope jsonb;descriptor jsonb;mapset jsonb;current_map jsonb;retirement_map jsonb;
 step_hash text;root_hash text;previous_body_hash text;previous_revision bigint;previous_allocation bigint;previous_event uuid;
 steps jsonb:='[]';captures jsonb:='[]';preview jsonb;v record;i integer:=0;route_count bigint;
 selection_hold operations_catering_reconciliation_private.inventory_scope_holds%rowtype;
 deadline timestamptz:=clock_timestamp()+interval '12 seconds';
begin
 perform set_config('lock_timeout','3s',true);
 org:=operations_economy_private.authorize_scope_admin_v1();
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found or c.cursor_sha256 is distinct from p_cursor_sha256 or c.organization_id<>org or c.source_stream_id is distinct from p_source_stream_id then raise exception 'reconciliation current signed cursor selector denied' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 perform 1 from operations_catering_reconciliation_private.admission_policies where organization_id=org and enabled for share;
 if not found then raise exception 'reconciliation admission policy disabled' using errcode='42501';end if;
 select count(*) into route_count from operations_catering_reconciliation_private.routes where organization_id=org and destination_organization_id=c.finance_organization_id and enabled;
 if route_count<>1 then raise exception 'reconciliation unique server-enrolled route required' using errcode='42501';end if;
 select * into route from operations_catering_reconciliation_private.routes where organization_id=org and destination_organization_id=c.finance_organization_id and enabled for share;
 select pub.* into hint from public.operations_catering_cost_streams s join public.operations_catering_cost_publications pub on pub.organization_id=s.organization_id and pub.source_stream_id=s.source_stream_id and pub.source_revision=s.current_revision where s.organization_id=org and s.source_stream_id=p_source_stream_id;
 if not found or hint.source_revision<=c.publication_revision or hint.source_revision-c.publication_revision>8 then raise exception 'reconciliation contiguous one-to-eight backlog required' using errcode='42501';end if;
 selection_hold:=operations_catering_reconciliation_private.hold_inventory_selection_v1(p_cursor_id,hint.source_revision,route.id);
 -- All original source projects are acquired in deterministic order BEFORE
 -- the current time obligation, matching authenticated allocation authority.
 -- The bounded immutable publication/outbox discovery grants no currentness;
 -- mapping/stream/head CAS below still rechecks the exact latest hint.
 for v in
 select distinct project_id from (
 select (d.value->>'project_id')::uuid as project_id
 from public.operations_catering_cost_publications p
 join public.operations_catering_cost_outbox o on o.organization_id=p.organization_id and o.source_stream_id=p.source_stream_id and o.source_revision=p.source_revision
 cross join lateral jsonb_array_elements(o.destinations) d(value)
 where p.organization_id=org and p.source_stream_id=p_source_stream_id and p.source_revision>c.publication_revision and p.source_revision<=hint.source_revision
 union select (hint.snapshot->>'project_id')::uuid
 ) projects order by project_id loop
 perform 1 from public.projects where id=v.project_id and organization_id=org and deleted_at is null for share;
 if not found then raise exception 'reconciliation original project scope denied' using errcode='42501';end if;
 end loop;
 -- Current target obligation is a hint scope. Lock it before Finance maps,
 -- matching original allocator, and recheck same publication under stream.
 select * into obligation from public.operations_project_obligation_heads where organization_id=org and project_id=(hint.snapshot->>'project_id')::uuid and obligation_id=(hint.snapshot->>'obligation_id')::uuid for share;
 if not found or obligation.cost_basis<>'time' or obligation.currency is distinct from hint.snapshot->>'currency' then raise exception 'reconciliation actual current time obligation denied' using errcode='42501';end if;
 -- Lock all original v2 routes in stable ID order before any native map/head.
 for v in select distinct (value->>'original_route_id')::uuid as id from jsonb_array_elements(selection_hold.selection) order by id loop
 perform 1 from operations_catering_allocation_private.delivery_routes r where r.id=v.id and r.organization_id=org and r.destination_organization_id=c.finance_organization_id and r.enabled for share;
 if not found then raise exception 'reconciliation captured original route revoked' using errcode='42501';end if;
 end loop;
 -- Resolve every saved body and all live project/Finance capabilities BEFORE
 -- mapping/stream locks. These immutable rows are rechecked after the CAS.
 for v in select source_revision from public.operations_catering_cost_publications where organization_id=org and source_stream_id=p_source_stream_id and source_revision>c.publication_revision and source_revision<=hint.source_revision order by source_revision loop
 body:=operations_catering_reconciliation_private.resolve_historical_body_v1(org,p_source_stream_id,v.source_revision,route.id,selection_hold.id);
 captures:=captures||jsonb_build_array(body);
 if clock_timestamp()>deadline then raise exception 'reconciliation inventory deadline exceeded' using errcode='42501';end if;
 end loop;
 if jsonb_array_length(captures)<>hint.source_revision-c.publication_revision then raise exception 'reconciliation complete publication history required' using errcode='42501';end if;
 select * into native_map from public.operations_catering_project_mappings where organization_id=org and id=hint.mapping_id and enabled for update;
 if not found then raise exception 'reconciliation latest enabled native map required' using errcode='42501';end if;
 select * into h from public.operations_catering_cost_streams where organization_id=org and source_stream_id=p_source_stream_id for update;
 if not found or h.current_revision<>hint.source_revision or native_map.project_id::text is distinct from hint.snapshot->>'project_id' or native_map.obligation_id::text is distinct from hint.snapshot->>'obligation_id' or native_map.worker_id<>h.worker_id or native_map.mapping_revision is distinct from hint.snapshot->>'mapping_revision' then raise exception 'reconciliation latest hint changed after lock' using errcode='PT409';end if;
 if selection_hold.selection is distinct from operations_catering_reconciliation_private.inventory_selection_v1(org,p_source_stream_id,c.publication_revision,hint.source_revision,route.id) then raise exception 'original queue selection changed under stream' using errcode='PT409';end if;
 select * into ah from operations_catering_allocation_private.heads where organization_id=org and source_stream_id=p_source_stream_id for update;
 if not found or ah.mapping_id<>native_map.id then raise exception 'reconciliation latest allocation head required' using errcode='42501';end if;
 eligibility:=operations_catering_reconciliation_private.historical_delivered_cursor_v1(p_cursor_id);
 previous_body_hash:=eligibility->>'body_sha256';previous_revision:=c.publication_revision;previous_allocation:=c.allocation_revision;previous_event:=c.allocation_event_id;
 root_hash:=operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.history.v1',jsonb_build_object('cursor_sha256',c.cursor_sha256,'step_count',jsonb_array_length(captures)));
 for body in select value from jsonb_array_elements(captures) loop
 i:=i+1;envelope:=body->'envelope';
 if (envelope->'snapshot'->>'publication_revision')::bigint<>previous_revision+1 then raise exception 'reconciliation publication omission/order denied' using errcode='42501';end if;
 if (body->>'allocation_revision')::bigint=previous_allocation then
 if (body->>'allocation_event_id')::uuid is distinct from previous_event or jsonb_array_length(envelope->'destination_mappings')<>1 then raise exception 'reconciliation source-update authority mismatch' using errcode='42501';end if;
 elsif (body->>'allocation_revision')::bigint=previous_allocation+1 then
 if (envelope->'allocation_event'->>'base_publication_revision')::bigint<>previous_revision or (envelope->'allocation_event'->>'allocated_publication_revision')::bigint<>previous_revision+1 or jsonb_array_length(envelope->'destination_mappings')<>2 then raise exception 'reconciliation original adoption predecessor mismatch' using errcode='42501';end if;
 else raise exception 'reconciliation consecutive allocation history required' using errcode='42501';end if;
 select value into current_map from jsonb_array_elements(envelope->'destination_mappings') where value->>'source_project_id'=envelope->'snapshot'->>'project_id' and value->>'source_obligation_id'=envelope->'snapshot'->>'obligation_id';
 if current_map is null then raise exception 'reconciliation current original Finance map missing' using errcode='42501';end if;
 select value into retirement_map from jsonb_array_elements(envelope->'destination_mappings') where value is distinct from current_map;
 mapset:=jsonb_build_object('current_map_sha256',operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.map.v1',current_map),'retirement_map_sha256',case when retirement_map is null then null else operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.map.v1',retirement_map) end);
 descriptor:=jsonb_build_object('index',i,'publication_revision',previous_revision+1,'allocation_revision',(body->>'allocation_revision')::bigint,'event_id',body->>'allocation_event_id','event_fingerprint',body->>'event_fingerprint','source_outbox_id',body->>'source_outbox_id','source_observation_id',body->>'source_observation_id','source_mapping_id',body->>'source_mapping_id','source_entry_version',(body->>'source_entry_version')::bigint,'source_cost_fingerprint',body->>'source_cost_fingerprint','raw_entry_sha256',body->>'raw_entry_sha256','raw_review_sha256',body->'raw_review_sha256','delivery_body_sha256',body->>'body_sha256','previous_body_sha256',previous_body_hash,'previous_publication_revision',previous_revision,'route_id',body->>'route_id','route_revision',body->>'route_revision','key_id',body->>'key_id','destination_capabilities_sha256',operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.mapset.v1',mapset));
 step_hash:=operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.step.v1',descriptor);
 root_hash:=operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.link.v1',jsonb_build_object('index',i,'previous_link_sha256',root_hash,'step_sha256',step_hash));
 steps:=steps||jsonb_build_array(jsonb_build_object('descriptor',descriptor,'step_sha256',step_hash,'delivery_raw_body',body->>'raw_body'));
 if octet_length(steps::text)>262144 or clock_timestamp()>deadline then raise exception 'reconciliation complete inventory byte/deadline bound exceeded' using errcode='42501';end if;
 previous_revision:=previous_revision+1;previous_allocation:=(body->>'allocation_revision')::bigint;previous_event:=(body->>'allocation_event_id')::uuid;previous_body_hash:=body->>'body_sha256';
 end loop;
 if previous_revision<>h.current_revision or previous_allocation<>ah.current_revision or previous_event<>ah.current_event_id then raise exception 'reconciliation history latest lineage mismatch' using errcode='42501';end if;
 preview:=jsonb_build_object('schema_version','operations-catering-reconciliation-preview.v1','organization_id',org,'destination_organization_id',c.finance_organization_id,'source_stream_id',p_source_stream_id,'cursor_sha256',c.cursor_sha256,'history_root_sha256',root_hash,'step_count',i,'latest_publication_revision',h.current_revision,'latest_allocation_revision',ah.current_revision,'latest_event_id',ah.current_event_id,'latest_observation_id',hint.observation_id,'latest_mapping_id',hint.mapping_id,'latest_body_sha256',previous_body_hash,'route_id',route.id);
 if clock_timestamp()>=c.expires_at or clock_timestamp()>deadline then raise exception 'reconciliation cursor expired after inventory locks' using errcode='42501';end if;
 return jsonb_build_object('preview',preview,'preview_sha256',operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.preview.v1',preview),'steps',steps,'captures',captures,'route_id',route.id,'route_revision',route.route_revision,'key_id',route.key_id,'final_obligation_revision',obligation.current_revision,'actor_system_user_id',actor);
end;$$;
revoke all on function operations_catering_reconciliation_private.inventory_v1(text,uuid,text) from public,anon,authenticated,service_role;

-- NEW private permit builder. No public dispatch/claim/receipt/adoption is created here.
-- Existing hard42501 receipt authority means this cannot issue a usable permit yet.
create function operations_catering_reconciliation_private.resolve_permit_v1(p_raw_command text,p_permit_id uuid,p_created_at timestamptz)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare command jsonb;inventory jsonb;preview jsonb;permit jsonb;outer_body jsonb;raw text;org uuid;actor uuid:=auth.uid();c operations_catering_reconciliation_private.verified_cursors%rowtype;
begin
 if p_permit_id is null or p_created_at is null or p_created_at<transaction_timestamp() or p_created_at>clock_timestamp()
 then raise exception 'server permit identity/time invalid' using errcode='42501';end if;
 command:=operations_catering_reconciliation_private.validate_permit_command_v1(p_raw_command);
 org:=operations_economy_private.authorize_scope_admin_v1();
 inventory:=operations_catering_reconciliation_private.inventory_v1(command->>'source_stream_id',(command->>'finance_cursor_id')::uuid,command->>'finance_cursor_sha256');
 preview:=inventory->'preview';
 if preview->'organization_id' is distinct from to_jsonb(org) or inventory->'actor_system_user_id' is distinct from to_jsonb(actor)
 or command->'expected_publication_revision' is distinct from preview->'latest_publication_revision'
 or command->'expected_allocation_revision' is distinct from preview->'latest_allocation_revision'
 or command->'expected_event_id' is distinct from preview->'latest_event_id'
 or command->'expected_observation_id' is distinct from preview->'latest_observation_id'
 or command->'expected_mapping_id' is distinct from preview->'latest_mapping_id'
 or command->'preview_sha256' is distinct from inventory->'preview_sha256'
 then raise exception 'reconciliation command latest preview CAS failed' using errcode='PT409';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=(command->>'finance_cursor_id')::uuid;
 if not found or c.organization_id<>org or clock_timestamp()>=c.expires_at then raise exception 'permit own cursor expired' using errcode='42501';end if;
 permit:=jsonb_build_object('schema_version','operations-catering-reconciliation-permit.v1','permit_id',p_permit_id,'organization_id',org,'destination_organization_id',c.finance_organization_id,
 'source_stream_id',c.source_stream_id,'actor_system_user_id',actor,'idempotency_key',command->>'idempotency_key','reason',command->>'reason',
 'created_at',to_char(p_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expires_at',to_char((p_created_at+interval '300 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'cursor_sha256',c.cursor_sha256,'preview_sha256',inventory->>'preview_sha256','history_root_sha256',preview->>'history_root_sha256','step_count',preview->'step_count',
 'expected_publication_revision',preview->'latest_publication_revision','expected_allocation_revision',preview->'latest_allocation_revision','expected_event_id',preview->'latest_event_id',
 'expected_observation_id',preview->'latest_observation_id','expected_mapping_id',preview->'latest_mapping_id','route_id',inventory->'route_id','route_revision',inventory->'route_revision','key_id',inventory->'key_id');
 perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.permit.v1',permit);
 outer_body:=jsonb_build_object('schema_version','operations-catering-reconciliation-delivery.v1','cursor_proof',c.proof,'preview',preview,'permit',permit,'permit_sha256',operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.permit.v1',permit),'history_root_sha256',preview->>'history_root_sha256','steps',inventory->'steps');
 raw:=outer_body::text;
 if octet_length(raw)>262144 or jsonb_array_length(inventory->'steps') not between 1 and 8 or clock_timestamp()>=c.expires_at
 then raise exception 'permit complete bounded body expired/oversize' using errcode='42501';end if;
 return inventory||jsonb_build_object('command',command,'cursor_id',c.cursor_id,'permit',permit,'raw_body',raw,'body_sha256',encode(sha256(convert_to(raw,'UTF8')),'hex'));
end;$$;
revoke all on function operations_catering_reconciliation_private.resolve_permit_v1(text,uuid,timestamptz) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.permit_insert_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare f jsonb;p jsonb;begin
 f:=operations_catering_reconciliation_private.resolve_permit_v1(new.command::text,new.id,new.created_at);p:=f->'permit';
 if new.organization_id::text is distinct from p->>'organization_id' or new.destination_organization_id::text is distinct from p->>'destination_organization_id'
 or new.source_stream_id is distinct from p->>'source_stream_id' or new.actor_system_user_id::text is distinct from p->>'actor_system_user_id'
 or new.idempotency_key is distinct from p->>'idempotency_key' or new.cursor_id::text is distinct from f->>'cursor_id'
 or new.route_id::text is distinct from f->>'route_id' or new.route_revision is distinct from f->>'route_revision' or new.key_id is distinct from f->>'key_id'
 or new.permit is distinct from p or new.preview is distinct from f->'preview' or new.history_root_sha256 is distinct from p->>'history_root_sha256'
 or new.raw_body is distinct from f->>'raw_body' or new.body_sha256 is distinct from f->>'body_sha256'
 or new.expires_at is distinct from new.created_at+interval '300 seconds' or new.step_count is distinct from (p->>'step_count')::integer
 or new.final_publication_revision is distinct from (p->>'expected_publication_revision')::bigint
 or new.final_allocation_revision is distinct from (p->>'expected_allocation_revision')::bigint
 or new.final_event_id::text is distinct from p->>'expected_event_id' or new.final_observation_id::text is distinct from p->>'expected_observation_id'
 or new.final_mapping_id::text is distinct from p->>'expected_mapping_id' or new.final_body_sha256 is distinct from f->'preview'->>'latest_body_sha256'
 or new.final_obligation_revision is distinct from (f->>'final_obligation_revision')::bigint then raise exception 'owner/caller permit metadata invalid' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.permit_insert_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_permit_actual_authority before insert on operations_catering_reconciliation_private.permits for each row execute function operations_catering_reconciliation_private.permit_insert_guard_v1();

-- New captures are provenance only. Even the table owner must supply exactly
-- the server-derived inventory from this live authenticated permit. This is
-- intentionally still unavailable while the original-receipt authority stub
-- rejects positive eligibility; no caller JSON or GUC bypass is introduced.
create function operations_catering_reconciliation_private.capture_insert_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare p operations_catering_reconciliation_private.permits%rowtype;f jsonb;b jsonb;s jsonb;
begin
 select * into p from operations_catering_reconciliation_private.permits where id=new.permit_id;
 if not found or new.index not between 1 and p.step_count or clock_timestamp()>=p.expires_at
 then raise exception 'historical capture live permit required' using errcode='42501';end if;
 f:=operations_catering_reconciliation_private.resolve_permit_v1(p.command::text,p.id,p.created_at);
 if p.actor_system_user_id is distinct from auth.uid() or p.raw_body is distinct from f->>'raw_body'
 or p.body_sha256 is distinct from f->>'body_sha256' or p.permit is distinct from f->'permit'
 or p.preview is distinct from f->'preview' then raise exception 'historical capture permit currentness denied' using errcode='42501';end if;
 b:=f->'captures'->(new.index-1);s:=f->'steps'->(new.index-1);
 if b is null or s is null
 or new.organization_id is distinct from p.organization_id or new.source_stream_id is distinct from p.source_stream_id
 or new.source_revision is distinct from (s->'descriptor'->>'publication_revision')::bigint
 or new.source_outbox_id::text is distinct from b->>'source_outbox_id'
 or new.allocation_event_id::text is distinct from b->>'allocation_event_id'
 or new.provenance is distinct from b->>'provenance' or new.source_queue_id::text is distinct from b->>'source_queue_id'
 or new.route_id::text is distinct from b->>'route_id' or new.route_revision is distinct from b->>'route_revision'
 or new.key_id is distinct from b->>'key_id' or new.endpoint_url is distinct from b->>'endpoint_url'
 or new.envelope is distinct from b->'envelope' or new.raw_body is distinct from b->>'raw_body'
 or new.body_sha256 is distinct from b->>'body_sha256' or new.descriptor is distinct from s->'descriptor'
 or new.step_sha256 is distinct from s->>'step_sha256'
 or new.raw_body is distinct from s->>'delivery_raw_body'
 then raise exception 'historical capture original evidence mismatch' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.capture_insert_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_capture_actual_evidence before insert on operations_catering_reconciliation_private.historical_captures for each row execute function operations_catering_reconciliation_private.capture_insert_guard_v1();

-- The permit and every original child must commit together. Deferred checks
-- use only immutable saved permit bytes/children, not a fresh authority grant
-- after the insert's permission/stream locks. They cannot renew permit expiry.
create function operations_catering_reconciliation_private.complete_capture_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare permit_id uuid;p operations_catering_reconciliation_private.permits%rowtype;outer_body jsonb;s jsonb;c operations_catering_reconciliation_private.historical_captures%rowtype;i integer;
begin
 permit_id:=case when tg_table_name='permits' then new.id else new.permit_id end;
 select * into p from operations_catering_reconciliation_private.permits where id=permit_id;
 if not found then raise exception 'capture parent missing' using errcode='42501';end if;
 outer_body:=p.raw_body::jsonb;
 if p.body_sha256 is distinct from encode(sha256(convert_to(p.raw_body,'UTF8')),'hex')
 or jsonb_array_length(outer_body->'steps') is distinct from p.step_count
 or (select count(*) from operations_catering_reconciliation_private.historical_captures where historical_captures.permit_id=p.id)<>p.step_count
 then raise exception 'complete historical capture set required' using errcode='42501';end if;
 for i in 1..p.step_count loop
 s:=outer_body->'steps'->(i-1);
 select * into c from operations_catering_reconciliation_private.historical_captures where historical_captures.permit_id=p.id and index=i;
 if not found or c.descriptor is distinct from s->'descriptor' or c.step_sha256 is distinct from s->>'step_sha256'
 or c.raw_body is distinct from s->>'delivery_raw_body' or c.envelope is distinct from c.raw_body::jsonb
 or c.body_sha256 is distinct from encode(sha256(convert_to(c.raw_body,'UTF8')),'hex')
 or c.source_revision is distinct from (s->'descriptor'->>'publication_revision')::bigint
 or c.organization_id is distinct from p.organization_id or c.source_stream_id is distinct from p.source_stream_id
 then raise exception 'ordered historical capture completeness denied' using errcode='42501';end if;
 end loop;
 return null;
end;$$;
revoke all on function operations_catering_reconciliation_private.complete_capture_guard_v1() from public,anon,authenticated,service_role;
create constraint trigger reconciliation_permit_complete_captures after insert on operations_catering_reconciliation_private.permits deferrable initially deferred for each row execute function operations_catering_reconciliation_private.complete_capture_guard_v1();
create constraint trigger reconciliation_capture_complete_set after insert on operations_catering_reconciliation_private.historical_captures deferrable initially deferred for each row execute function operations_catering_reconciliation_private.complete_capture_guard_v1();
