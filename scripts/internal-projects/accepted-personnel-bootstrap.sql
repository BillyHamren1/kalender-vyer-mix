-- DORMANT DRAFT: owner-only provisioning after accepted-personnel-caller.sql.
-- No tables, public port, grant, key, policy/enrollment row, or activation is installed.
-- Explicit Time civil work_date, never server-now/UTC-derived. No automatic ingest call.
create function operations_economy_private.bootstrap_personnel_day_v1(
 p_org uuid,p_worker uuid,p_work_date date,p_issuer uuid,p_epoch uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w operations_economy_private.personnel_accepted_workers_v1%rowtype;
 i operations_economy_private.personnel_issuers_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;
 h public.operations_personnel_cost_streams%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 v_stream text;v_inserted boolean:=false;
begin
 -- Same global ownership protocol as every canonical writer. Provisioning takes
 -- EXCLUSIVE before issuer/policy/source/stream tuples and never starts as a writer.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eventflow:personnel-accepted-ownership:v1',0));
 if p_org is null or p_worker is null or p_issuer is null or p_epoch is null or p_work_date is null
  or not pg_catalog.isfinite(p_work_date) or p_work_date<date '0001-01-01' or p_work_date>date '9999-12-31'
  then raise exception 'invalid_personnel_bootstrap_identity' using errcode='22023';end if;
 select * into i from operations_economy_private.personnel_issuers_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 if not found or not i.enabled or i.organization_id<>p_org then raise exception 'bootstrap_issuer_not_enabled' using errcode='42501';end if;
 select * into w from operations_economy_private.personnel_accepted_workers_v1 where organization_id=p_org and worker_id=p_worker for share;
 if not found or not w.enabled or w.issuer_id<>p_issuer or w.enrollment_epoch<>p_epoch then raise exception 'bootstrap_worker_not_enabled' using errcode='42501';end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=p_org and worker_id=p_worker for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from w.source_binding then raise exception 'bootstrap_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=p_org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'bootstrap_destination_changed' using errcode='42501';end if;
 v_stream:=concat_ws(':','time',b.time_organization_id::text,b.time_personnel_id::text,to_char(p_work_date,'YYYY-MM-DD'));
 -- A conflicting worker/day alias cannot be renamed or silently reinterpreted.
 select * into h from public.operations_personnel_cost_streams where organization_id=p_org and worker_id=p_worker and work_date=p_work_date for update;
 if found and h.source_time_stream_id<>v_stream then raise exception 'bootstrap_worker_day_conflict' using errcode='23505';end if;
 select * into h from public.operations_personnel_cost_streams where organization_id=p_org and source_time_stream_id=v_stream for update;
 if found and (h.worker_id<>p_worker or h.work_date<>p_work_date or h.time_organization_id<>b.time_organization_id or h.time_auth_worker_id<>b.time_auth_worker_id)
  then raise exception 'bootstrap_stream_identity_conflict' using errcode='23505';end if;
 if found and h.current_revision<>0 then raise exception 'bootstrap_stream_not_empty' using errcode='42501';end if;
 -- Check every canonical ancillary family explicitly. Their validated FKs also
 -- imply emptiness from publication/outbox emptiness for the ordinary read adapter.
 if exists(select 1 from public.operations_personnel_cost_publications where organization_id=p_org and source_time_stream_id=v_stream)
  or exists(select 1 from public.operations_personnel_cost_outbox where organization_id=p_org and source_time_stream_id=v_stream)
  or exists(select 1 from public.operations_personnel_project_publication_links where organization_id=p_org and source_time_stream_id=v_stream)
  or exists(select 1 from public.operations_personnel_project_publication_proofs where organization_id=p_org and source_time_stream_id=v_stream)
  or exists(select 1 from public.operations_project_personnel_reviews where organization_id=p_org and source_time_stream_id=v_stream)
  or exists(select 1 from operations_economy_private.personnel_accepted_issuances_v1 m join public.operations_personnel_cost_outbox o on o.id=m.outbox_id where o.organization_id=p_org and o.source_time_stream_id=v_stream)
  then raise exception 'bootstrap_canonical_evidence_exists' using errcode='42501';end if;
 if exists(select 1 from operations_economy_private.personnel_issuer_streams_v1 where source_stream_id=v_stream and (issuer_id<>p_issuer or enrollment_epoch<>p_epoch))
  then raise exception 'bootstrap_foreign_enrollment' using errcode='42501';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch and source_stream_id=v_stream for share;
 if found and (f.revision_floor<>0 or f.source_binding is distinct from to_jsonb(b)) then raise exception 'bootstrap_enrollment_conflict' using errcode='23505';end if;
 if h.organization_id is null then
  insert into public.operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id)
   values(p_org,v_stream,p_worker,p_work_date,b.time_organization_id,b.time_auth_worker_id);
  v_inserted:=true;
 end if;
 if f.issuer_id is null then
  insert into operations_economy_private.personnel_issuer_streams_v1(issuer_id,enrollment_epoch,source_stream_id,revision_floor,source_binding)
   values(p_issuer,p_epoch,v_stream,0,to_jsonb(b));
  v_inserted:=true;
 end if;
 return jsonb_build_object('schema','operations-personnel-bootstrap-receipt.v1','status',case when v_inserted then 'initialized' else 'existing' end,
  'organization_id',p_org,'worker_id',p_worker,'work_date',to_char(p_work_date,'YYYY-MM-DD'),'source_stream_id',v_stream,
  'issuer_id',p_issuer,'enrollment_epoch',p_epoch,'current_revision',0,'revision_floor',0);
end;$$;
revoke all on function operations_economy_private.bootstrap_personnel_day_v1(uuid,uuid,date,uuid,uuid) from public,anon,authenticated,service_role;
