-- Default-off authenticated allocation of a genuine saved native Catering cost.
-- No provider/time/payroll/Finance/forecast writes, revaluation or v1 relaxation.
create schema operations_catering_allocation_private;
revoke all on schema operations_catering_allocation_private from public,anon;
grant usage on schema operations_catering_allocation_private to authenticated,service_role;

create table operations_catering_allocation_private.gates (
 organization_id uuid primary key,enabled boolean not null default false
);
create table operations_catering_allocation_private.heads (
 organization_id uuid not null,source_stream_id text not null,current_revision bigint not null check(current_revision between 1 and 9007199254740991),
 current_event_id uuid not null,mapping_id uuid not null,
 primary key(organization_id,source_stream_id),
 foreign key(organization_id,source_stream_id) references public.operations_catering_cost_streams(organization_id,source_stream_id)
);
create table operations_catering_allocation_private.events (
 event_id uuid primary key,organization_id uuid not null,source_stream_id text not null,
 allocation_revision bigint not null check(allocation_revision between 1 and 9007199254740991),
 actor_system_user_id uuid not null,base_publication_revision bigint not null,allocated_publication_revision bigint not null,
 source_observation_id uuid not null,previous_mapping_id uuid not null,next_mapping_id uuid not null,
 target_project_id uuid not null,target_obligation_id uuid not null,target_obligation_revision bigint not null,
 idempotency_key text not null,document jsonb not null,command jsonb not null,fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null,unique(organization_id,event_id),unique(organization_id,source_stream_id,allocation_revision),
 unique(organization_id,idempotency_key),check(allocated_publication_revision=base_publication_revision+1),
 foreign key(organization_id,source_stream_id) references operations_catering_allocation_private.heads(organization_id,source_stream_id) deferrable initially deferred,
 foreign key(organization_id,source_stream_id,base_publication_revision) references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision),
 foreign key(organization_id,source_stream_id,allocated_publication_revision) references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision) deferrable initially deferred,
 foreign key(organization_id,source_observation_id) references public.operations_catering_source_observations(organization_id,id),
 foreign key(previous_mapping_id) references public.operations_catering_project_mappings(id),
 foreign key(next_mapping_id) references public.operations_catering_project_mappings(id) deferrable initially deferred,
 foreign key(organization_id,target_obligation_id,target_obligation_revision) references public.operations_project_obligation_baselines(organization_id,obligation_id,revision)
);
alter table operations_catering_allocation_private.heads add foreign key(organization_id,current_event_id)
 references operations_catering_allocation_private.events(organization_id,event_id) deferrable initially deferred;
alter table operations_catering_allocation_private.heads add foreign key(mapping_id)
 references public.operations_catering_project_mappings(id) deferrable initially deferred;
-- Durable capabilities remain outside the exact26 public authority document.
-- V2 capture must use these original maps, not resolve a mutable current map.
create table operations_catering_allocation_private.event_finance_capabilities (
 organization_id uuid not null,event_id uuid not null,destination_organization_id uuid not null,
 previous_finance_mapping_id uuid not null references operations_catering_private.finance_delivery_maps(mapping_id),
 next_finance_mapping_id uuid not null references operations_catering_private.finance_delivery_maps(mapping_id),
 primary key(organization_id,event_id),check(previous_finance_mapping_id<>next_finance_mapping_id),
 foreign key(organization_id,event_id) references operations_catering_allocation_private.events(organization_id,event_id)
);
alter table operations_catering_allocation_private.gates enable row level security;
alter table operations_catering_allocation_private.heads enable row level security;
alter table operations_catering_allocation_private.events enable row level security;
alter table operations_catering_allocation_private.event_finance_capabilities enable row level security;
revoke all on operations_catering_allocation_private.event_finance_capabilities from public,anon,authenticated,service_role;
grant select on operations_catering_allocation_private.event_finance_capabilities to service_role;
revoke all on operations_catering_allocation_private.gates,operations_catering_allocation_private.heads,operations_catering_allocation_private.events from public,anon,authenticated,service_role;
grant select on operations_catering_allocation_private.gates,operations_catering_allocation_private.heads,operations_catering_allocation_private.events to service_role;
grant insert,update(enabled) on operations_catering_allocation_private.gates to service_role;
create trigger catering_allocation_gate_identity before update or delete on operations_catering_allocation_private.gates for each row execute function public.operations_catering_mapping_guard();
create trigger catering_allocation_gate_no_truncate before truncate on operations_catering_allocation_private.gates for each statement execute function public.operations_personnel_evidence_immutable();
create trigger catering_allocation_events_immutable before update or delete on operations_catering_allocation_private.events for each row execute function public.operations_personnel_evidence_immutable();
create trigger catering_allocation_events_no_truncate before truncate on operations_catering_allocation_private.events for each statement execute function public.operations_personnel_evidence_immutable();
create trigger catering_allocation_capabilities_immutable before update or delete on operations_catering_allocation_private.event_finance_capabilities for each row execute function public.operations_personnel_evidence_immutable();
create trigger catering_allocation_capabilities_no_truncate before truncate on operations_catering_allocation_private.event_finance_capabilities for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_catering_allocation_private.cost_fingerprint_v2(p jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(p-array['project_id','obligation_id','mapping_revision','publication_revision','project_review_status']),'UTF8')),'hex');
$$;
revoke all on function operations_catering_allocation_private.cost_fingerprint_v2(jsonb) from public,anon,authenticated;
grant execute on function operations_catering_allocation_private.cost_fingerprint_v2(jsonb) to service_role;

-- Exact ECMAScript String.trim whitespace, retaining internal Unicode/newlines.
create function operations_catering_allocation_private.trim_command_text_v2(p text) returns text language sql immutable set search_path='' as $$
 select btrim(p,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function operations_catering_allocation_private.trim_command_text_v2(text) from public,anon,authenticated,service_role;

create function operations_catering_allocation_private.head_guard_v2() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op<>'UPDATE' or (new.organization_id,new.source_stream_id) is distinct from (old.organization_id,old.source_stream_id)
 or new.current_revision<>old.current_revision+1 or not exists(select 1 from operations_catering_allocation_private.events e
 where e.event_id=new.current_event_id and e.organization_id=new.organization_id and e.source_stream_id=new.source_stream_id
 and e.allocation_revision=new.current_revision and e.next_mapping_id=new.mapping_id)
 then raise exception 'native allocation head identity/lineage denied' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_catering_allocation_private.head_guard_v2() from public,anon,authenticated,service_role;
create trigger catering_allocation_heads_guard before update or delete on operations_catering_allocation_private.heads for each row execute function operations_catering_allocation_private.head_guard_v2();
create trigger catering_allocation_heads_no_truncate before truncate on operations_catering_allocation_private.heads for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_catering_allocation_private.map_guard_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare e operations_catering_allocation_private.events%rowtype;
begin
 select ev.* into e from operations_catering_allocation_private.heads h join operations_catering_allocation_private.events ev on ev.event_id=h.current_event_id and ev.organization_id=h.organization_id
 where h.organization_id=new.organization_id and h.source_stream_id='catering:'||new.catering_organization_id::text||':'||new.time_entry_id::text;
 if found and new.enabled and (new.id is distinct from e.next_mapping_id or new.mapping_revision is distinct from e.document->>'next_mapping_revision'
 or new.project_id is distinct from e.target_project_id or new.obligation_id is distinct from e.target_obligation_id)
 then raise exception 'native allocation map authority required' using errcode='42501';end if;return new;
end;$$;
revoke all on function operations_catering_allocation_private.map_guard_v2() from public,anon,authenticated,service_role;
create trigger catering_allocation_map_lineage before insert or update on public.operations_catering_project_mappings for each row execute function operations_catering_allocation_private.map_guard_v2();

create function operations_catering_allocation_private.publication_guard_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare e operations_catering_allocation_private.events%rowtype;obs public.operations_catering_source_observations%rowtype;
 prior public.operations_catering_cost_publications%rowtype;expected text;
begin
 select ev.* into e from operations_catering_allocation_private.heads h join operations_catering_allocation_private.events ev on ev.event_id=h.current_event_id and ev.organization_id=h.organization_id
 where h.organization_id=new.organization_id and h.source_stream_id=new.source_stream_id;
 if not found then return new;end if;
 perform 1 from operations_catering_allocation_private.gates where organization_id=new.organization_id and enabled for share;
 if not found then raise exception 'native allocation authority disabled' using errcode='42501';end if;
 if new.mapping_id is distinct from e.next_mapping_id or new.source_revision<e.allocated_publication_revision
 or new.snapshot->>'mapping_revision' is distinct from e.document->>'next_mapping_revision'
 or new.snapshot->>'project_id' is distinct from e.target_project_id::text or new.snapshot->>'obligation_id' is distinct from e.target_obligation_id::text
 then raise exception 'native publication latest allocation authority required' using errcode='42501';end if;
 select * into obs from public.operations_catering_source_observations where organization_id=new.organization_id and id=new.observation_id;
 if not found or new.snapshot->>'source_fingerprint' is distinct from obs.source_fingerprint
 or new.snapshot->>'source_organization_id' is distinct from obs.catering_organization_id::text
 or new.snapshot->>'source_person_id' is distinct from obs.person_id::text or new.snapshot->>'source_time_entry_id' is distinct from obs.time_entry_id::text
 or new.snapshot->'source_time_entry_version' is distinct from to_jsonb(obs.entry_version)
 or new.source_stream_id is distinct from 'catering:'||obs.catering_organization_id::text||':'||obs.time_entry_id::text
 then raise exception 'native allocation publication genuine observation required' using errcode='42501';end if;
 if new.source_revision=e.allocated_publication_revision then
 if new.observation_id<>e.source_observation_id or operations_catering_allocation_private.cost_fingerprint_v2(new.snapshot) is distinct from e.document->>'source_cost_fingerprint'
 or new.snapshot->>'project_review_status' is distinct from (case when new.snapshot->>'source_status'='rejected' then 'rejected' else 'preliminary' end)
 then raise exception 'native allocation historical economics changed' using errcode='22023';end if;
 else
 select * into prior from public.operations_catering_cost_publications where organization_id=new.organization_id and source_stream_id=new.source_stream_id and source_revision=new.source_revision-1;
 if not found then raise exception 'native allocation predecessor publication required' using errcode='22023';end if;
 if obs.entry_version<(prior.snapshot->>'source_time_entry_version')::bigint then raise exception 'native allocation observation regression' using errcode='PT409';end if;
 if obs.entry_version=(prior.snapshot->>'source_time_entry_version')::bigint and (new.observation_id<>prior.observation_id
 or operations_catering_allocation_private.cost_fingerprint_v2(new.snapshot) is distinct from operations_catering_allocation_private.cost_fingerprint_v2(prior.snapshot))
 then raise exception 'native same-version allocation economics changed' using errcode='22023';end if;
 end if;return new;
end;$$;
revoke all on function operations_catering_allocation_private.publication_guard_v2() from public,anon,authenticated,service_role;
create trigger catering_allocation_publication_lineage before insert on public.operations_catering_cost_publications for each row execute function operations_catering_allocation_private.publication_guard_v2();

create function operations_catering_allocation_private.stream_guard_v2() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from operations_catering_allocation_private.heads where organization_id=new.organization_id and source_stream_id=new.source_stream_id)
 and not exists(select 1 from public.operations_catering_cost_publications p join operations_catering_allocation_private.heads h on h.organization_id=p.organization_id and h.source_stream_id=p.source_stream_id
 join operations_catering_allocation_private.events e on e.organization_id=h.organization_id and e.event_id=h.current_event_id
 where p.organization_id=new.organization_id and p.source_stream_id=new.source_stream_id and p.source_revision=new.current_revision
 and p.mapping_id=h.mapping_id and p.snapshot->>'project_id'=e.target_project_id::text and p.snapshot->>'obligation_id'=e.target_obligation_id::text
 and p.snapshot->>'mapping_revision'=e.document->>'next_mapping_revision')
 then raise exception 'native head advance latest allocation publication required' using errcode='42501';end if;return new;end;$$;
revoke all on function operations_catering_allocation_private.stream_guard_v2() from public,anon,authenticated,service_role;
create trigger catering_allocation_stream_lineage before update on public.operations_catering_cost_streams for each row execute function operations_catering_allocation_private.stream_guard_v2();

create function operations_catering_allocation_private.v1_capture_guard_v2() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from operations_catering_allocation_private.events e where e.organization_id=new.organization_id and e.source_stream_id=new.source_stream_id and e.allocated_publication_revision<=new.source_revision)
 then raise exception 'native allocation requires dedicated v2 delivery capture' using errcode='42501';end if;return new;end;$$;
revoke all on function operations_catering_allocation_private.v1_capture_guard_v2() from public,anon,authenticated,service_role;
create trigger catering_allocation_v1_capture_denied before insert on operations_catering_private.finance_delivery_queue for each row execute function operations_catering_allocation_private.v1_capture_guard_v2();

create function operations_catering_allocation_private.reassign_v2(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();key text;v_keys text[]:=array['schema_version','source_stream_id','expected_source_revision','expected_allocation_revision','expected_observation_id','expected_source_fingerprint','from_project_id','from_obligation_id','target_project_id','target_obligation_id','expected_target_obligation_revision','idempotency_key','reason'];
 prior public.operations_catering_cost_publications%rowtype;obs public.operations_catering_source_observations%rowtype;oldmap public.operations_catering_project_mappings%rowtype;
 h public.operations_catering_cost_streams%rowtype;ah operations_catering_allocation_private.heads%rowtype;existing operations_catering_allocation_private.events%rowtype;
 target public.operations_project_obligation_heads%rowtype;event_id uuid:=gen_random_uuid();newmap_id uuid:=gen_random_uuid();map_revision text;
 old_finance operations_catering_private.finance_delivery_maps%rowtype;new_finance operations_catering_private.finance_delivery_maps%rowtype;
 next_alloc bigint;next_pub bigint;stamp timestamptz:=clock_timestamp();snapshot jsonb;document jsonb;fp text;destinations jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or not(p ?& v_keys) or p-v_keys<>'{}'::jsonb or p->>'schema_version' is distinct from 'operations-catering-reassignment-command.v2'
 then raise exception 'invalid native allocation command shape' using errcode='22023';end if;
 foreach key in array array['expected_observation_id','from_project_id','from_obligation_id','target_project_id','target_obligation_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid native allocation UUID' using errcode='22023';end if;end loop;
 foreach key in array array['expected_source_revision','expected_allocation_revision','expected_target_obligation_revision'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between (case when key='expected_allocation_revision' then 0 else 1 end) and 9007199254740991
 then raise exception 'invalid native allocation revision' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'source_stream_id') is distinct from 'string' or p->>'source_stream_id' !~ '^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'expected_source_fingerprint') is distinct from 'string' or p->>'expected_source_fingerprint' !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p->'idempotency_key') is distinct from 'string' or length(p->>'idempotency_key') not between 12 and 200 or p->>'idempotency_key'<>operations_catering_allocation_private.trim_command_text_v2(p->>'idempotency_key')
 or jsonb_typeof(p->'reason') is distinct from 'string' or length(p->>'reason') not between 3 and 1000 or p->>'reason'<>operations_catering_allocation_private.trim_command_text_v2(p->>'reason')
 or (p->>'from_project_id'=p->>'target_project_id' and p->>'from_obligation_id'=p->>'target_obligation_id')
 then raise exception 'invalid native allocation selector/reason' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_admin_v1();
 perform 1 from operations_catering_allocation_private.gates where organization_id=org and enabled for share;
 if not found then raise exception 'native allocation disabled' using errcode='42501';end if;
 for key in select distinct value from jsonb_array_elements_text(jsonb_build_array(p->>'from_project_id',p->>'target_project_id')) order by value loop
 perform 1 from public.projects where id=key::uuid and organization_id=org and deleted_at is null for share;
 if not found then raise exception 'native allocation live projects denied' using errcode='42501';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended('native-allocation-command:'||org::text||':'||(p->>'idempotency_key'),0));
 select * into existing from operations_catering_allocation_private.events where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then
 if existing.command is distinct from p or existing.actor_system_user_id<>actor then raise exception 'native allocation idempotency conflict' using errcode='23505';end if;
 return jsonb_build_object('outcome','replayed','event_id',existing.event_id,'allocation_revision',existing.allocation_revision,'source_revision',existing.allocated_publication_revision,'fingerprint',existing.fingerprint);end if;
 select pub.* into prior from public.operations_catering_cost_streams stream join public.operations_catering_cost_publications pub
 on pub.organization_id=stream.organization_id and pub.source_stream_id=stream.source_stream_id and pub.source_revision=stream.current_revision
 where stream.organization_id=org and stream.source_stream_id=p->>'source_stream_id';
 if not found then raise exception 'native allocation saved current source required' using errcode='42501';end if;
 select * into target from public.operations_project_obligation_heads where organization_id=org and project_id=(p->>'target_project_id')::uuid and obligation_id=(p->>'target_obligation_id')::uuid for share;
 if not found or target.cost_basis<>'time' or target.currency is distinct from prior.snapshot->>'currency' then raise exception 'native allocation actual time obligation required' using errcode='42501';end if;
 if target.current_revision<>(p->>'expected_target_obligation_revision')::bigint then return jsonb_build_object('outcome','stale_obligation','current_obligation_revision',target.current_revision);end if;
 -- These enrolled capabilities authorize retiring the old Finance target and
 -- copying to the new one. Actual Finance acceptance is checked independently
 -- by the v2 receiver against its own saved predecessor, never inferred here.
 select * into old_finance from operations_catering_private.finance_delivery_maps where organization_id=org
 and source_project_id=(p->>'from_project_id')::uuid and source_obligation_id=(p->>'from_obligation_id')::uuid and enabled for share;
 if not found then raise exception 'native allocation old Finance retirement capability denied' using errcode='42501';end if;
 select * into new_finance from operations_catering_private.finance_delivery_maps where organization_id=org
 and source_project_id=target.project_id and source_obligation_id=target.obligation_id and enabled for share;
 if not found or new_finance.destination_organization_id<>old_finance.destination_organization_id
 or old_finance.currency<>target.currency or new_finance.currency<>target.currency
 then raise exception 'native allocation same-recipient Finance target capability denied' using errcode='42501';end if;
 perform 1 from public.operations_catering_publish_gates where organization_id=org and enabled for share;
 if not found then raise exception 'native source publication disabled' using errcode='42501';end if;
 perform 1 from public.operations_catering_source_bindings where organization_id=org and worker_id=(prior.snapshot->>'worker_id')::uuid
 and catering_organization_id=(prior.snapshot->>'source_organization_id')::uuid and catering_person_id=(prior.snapshot->>'source_person_id')::uuid and enabled for share;
 if not found then raise exception 'native allocation source worker enrollment denied' using errcode='42501';end if;
 -- Mapping first matches original publisher's mapping FOR SHARE -> stream FOR UPDATE.
 select * into oldmap from public.operations_catering_project_mappings where id=prior.mapping_id and organization_id=org and enabled for update;
 if not found then raise exception 'native allocation prior enabled mapping required' using errcode='42501';end if;
 select * into h from public.operations_catering_cost_streams where organization_id=org and source_stream_id=p->>'source_stream_id' for update;
 if h.current_revision<>prior.source_revision or h.current_revision<>(p->>'expected_source_revision')::bigint then return jsonb_build_object('outcome','stale_source','current_source_revision',h.current_revision);end if;
 select * into ah from operations_catering_allocation_private.heads where organization_id=org and source_stream_id=h.source_stream_id for update;
 if coalesce(ah.current_revision,0)<>(p->>'expected_allocation_revision')::bigint then return jsonb_build_object('outcome','stale_allocation','current_allocation_revision',coalesce(ah.current_revision,0));end if;
 select * into obs from public.operations_catering_source_observations where organization_id=org and id=prior.observation_id;
 if not found or obs.id::text is distinct from p->>'expected_observation_id' or obs.source_fingerprint is distinct from p->>'expected_source_fingerprint'
 or prior.snapshot->>'project_id' is distinct from p->>'from_project_id' or prior.snapshot->>'obligation_id' is distinct from p->>'from_obligation_id'
 or oldmap.project_id::text is distinct from prior.snapshot->>'project_id' or oldmap.obligation_id::text is distinct from prior.snapshot->>'obligation_id'
 or oldmap.mapping_revision is distinct from prior.snapshot->>'mapping_revision' or oldmap.worker_id is distinct from h.worker_id
 or oldmap.catering_organization_id is distinct from obs.catering_organization_id or oldmap.catering_person_id is distinct from obs.person_id or oldmap.time_entry_id is distinct from obs.time_entry_id
 or oldmap.work_date::text is distinct from prior.snapshot->>'work_date' or oldmap.time_zone is distinct from prior.snapshot->>'time_zone' or oldmap.currency is distinct from prior.snapshot->>'currency'
 then raise exception 'native allocation immutable source/mapping tuple mismatch' using errcode='22023';end if;
 if h.current_revision=9007199254740991 or coalesce(ah.current_revision,0)=9007199254740991 then raise exception 'native allocation revision exhausted' using errcode='22003';end if;
 next_alloc:=coalesce(ah.current_revision,0)+1;next_pub:=h.current_revision+1;map_revision:='native-allocation-v2:'||event_id::text;
 snapshot:=prior.snapshot||jsonb_build_object('project_id',target.project_id,'obligation_id',target.obligation_id,'mapping_revision',map_revision,'publication_revision',next_pub,
 'project_review_status',case when prior.snapshot->>'source_status'='rejected' then 'rejected' else 'preliminary' end);
 document:=jsonb_build_object('schema_version','operations-catering-allocation-authority.v2','event_id',event_id,'organization_id',org,'source_stream_id',h.source_stream_id,
 'allocation_revision',next_alloc,'actor_system_user_id',actor,'reason',p->>'reason','idempotency_key',p->>'idempotency_key','created_at',to_jsonb(stamp),
 'base_publication_revision',h.current_revision,'allocated_publication_revision',next_pub,'source_observation_id',obs.id,'source_entry_version',obs.entry_version,
 'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256,'source_cost_fingerprint',operations_catering_allocation_private.cost_fingerprint_v2(prior.snapshot),
 'previous_mapping_id',oldmap.id,'previous_mapping_revision',oldmap.mapping_revision,'next_mapping_id',newmap_id,'next_mapping_revision',map_revision,
 'from_project_id',oldmap.project_id,'from_obligation_id',oldmap.obligation_id,'to_project_id',target.project_id,'to_obligation_id',target.obligation_id,'target_obligation_revision',target.current_revision);
 fp:=encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(document),'UTF8')),'hex');document:=document||jsonb_build_object('fingerprint',fp);
 insert into operations_catering_allocation_private.events values(event_id,org,h.source_stream_id,next_alloc,actor,h.current_revision,next_pub,obs.id,oldmap.id,newmap_id,target.project_id,target.obligation_id,target.current_revision,p->>'idempotency_key',document,p,fp,stamp);
 insert into operations_catering_allocation_private.event_finance_capabilities values(org,event_id,old_finance.destination_organization_id,old_finance.mapping_id,new_finance.mapping_id);
 if ah.current_revision is null then insert into operations_catering_allocation_private.heads values(org,h.source_stream_id,next_alloc,event_id,newmap_id);
 else update operations_catering_allocation_private.heads set current_revision=next_alloc,current_event_id=event_id,mapping_id=newmap_id where organization_id=org and source_stream_id=h.source_stream_id;end if;
 update public.operations_catering_project_mappings set enabled=false where id=oldmap.id;
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values(newmap_id,org,oldmap.worker_id,oldmap.catering_organization_id,oldmap.catering_person_id,oldmap.time_entry_id,oldmap.workplace_id,oldmap.work_date,oldmap.time_zone,target.project_id,target.obligation_id,oldmap.currency,map_revision,true);
 insert into public.operations_catering_cost_publications values(org,h.source_stream_id,next_pub,obs.id,newmap_id,snapshot,'allocation-v2:'||event_id::text,stamp);
 select jsonb_agg(distinct value) into destinations from jsonb_array_elements(jsonb_build_array(jsonb_build_object('project_id',oldmap.project_id,'obligation_id',oldmap.obligation_id),jsonb_build_object('project_id',target.project_id,'obligation_id',target.obligation_id)));
 insert into public.operations_catering_cost_outbox(organization_id,source_stream_id,source_revision,destinations) values(org,h.source_stream_id,next_pub,destinations);
 update public.operations_catering_cost_streams set current_revision=next_pub where organization_id=org and source_stream_id=h.source_stream_id;
 return jsonb_build_object('outcome','accepted','event_id',event_id,'allocation_revision',next_alloc,'source_revision',next_pub,'fingerprint',fp);
end;$$;
revoke all on function operations_catering_allocation_private.reassign_v2(jsonb) from public,anon,service_role;
grant execute on function operations_catering_allocation_private.reassign_v2(jsonb) to authenticated;
create function public.reassign_operations_catering_project_v2(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_catering_allocation_private.reassign_v2(p_command);$$;
revoke all on function public.reassign_operations_catering_project_v2(jsonb) from public,anon,service_role;
grant execute on function public.reassign_operations_catering_project_v2(jsonb) to authenticated;
