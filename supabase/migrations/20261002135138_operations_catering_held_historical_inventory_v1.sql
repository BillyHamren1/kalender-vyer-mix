-- NEW private-only held historical inventory. No public API, grants, permit
-- writer or old receipt-authority stub is changed. Call the frozen actual-admin
-- receipt collector BEFORE this function in the SAME transaction. This helper
-- rechecks its exact cache/key selection before any later permission/source lock.
-- Positive authority requires genuinely delivered Operations ordinary13 matching
-- the independently signed Finance-owned original13, not a fixture outcome seed.
create function operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1(p_cursor_id uuid,p_hold_id uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare h operations_catering_reconciliation_private.original_receipt_scope_holds%rowtype;f jsonb;
begin
 perform operations_catering_reconciliation_private.require_admission_receipt_scope_v1(p_cursor_id,p_hold_id);
 select * into h from operations_catering_reconciliation_private.original_receipt_scope_holds where id=p_hold_id;
 -- Frozen selector is read-only: it does not acquire a newly discovered key.
 f:=operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id);
 if f->>'cursor_id' is distinct from h.cursor_id::text
 or f->>'cursor_sha256' is distinct from h.cursor_sha256
 or f->>'organization_id' is distinct from h.organization_id::text
 or f->>'finance_organization_id' is distinct from h.finance_organization_id::text
 or f->'candidate_ids' is distinct from to_jsonb(h.candidate_ids)
 or f->'candidate_keys' is distinct from to_jsonb(h.candidate_keys)
 then raise exception 'held original receipt selection changed before inventory' using errcode='PT409';end if;
end;$$;
revoke all on function operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.inventory_held_v1(p_source_stream_id text,p_cursor_id uuid,p_cursor_sha256 text,p_receipt_scope_hold_id uuid)
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
 perform operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1(p_cursor_id,p_receipt_scope_hold_id);
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
 eligibility:=operations_catering_reconciliation_private.historical_delivery_eligibility_held_v1(p_cursor_id,p_receipt_scope_hold_id);
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
revoke all on function operations_catering_reconciliation_private.inventory_held_v1(text,uuid,text,uuid) from public,anon,authenticated,service_role;
