-- Operations project-review statuses -> frozen v1 publication -> durable outbox,
-- atomically. No arbitrary caller money, statuses, actor or organization input.
create table public.operations_personnel_project_publication_links (
  organization_id uuid not null, source_time_stream_id text not null, source_revision bigint not null,
  previous_source_revision bigint not null,
  event_kind text not null check(event_kind in ('project_review','time_ingress')),
  actor_system_user_id uuid, trigger_project_id uuid, trigger_review_sequence bigint,
  idempotency_key text not null, created_at timestamptz not null default now(),
  primary key(organization_id,source_time_stream_id,source_revision),
  unique(organization_id,idempotency_key),
  check(event_kind<>'project_review' or (actor_system_user_id is not null and trigger_project_id is not null and trigger_review_sequence is not null)),
  foreign key(organization_id,source_time_stream_id,source_revision)
    references public.operations_personnel_cost_publications(organization_id,source_time_stream_id,source_revision)
);
create table public.operations_personnel_project_publication_proofs (
  organization_id uuid not null, source_time_stream_id text not null, source_revision bigint not null,
  project_id uuid not null, source_snapshot_hash text not null, time_snapshot_version bigint not null,
  source_time_line_ids jsonb not null, economics_fingerprint text not null,
  review_event_id uuid references public.operations_project_personnel_reviews(event_id),
  review_sequence bigint, economics_match boolean not null,
  applied_status text not null check(applied_status in ('preliminary','confirmed','rejected')),
  invalidation_reason text,
  primary key(organization_id,source_time_stream_id,source_revision,project_id),
  check(economics_match=(review_event_id is not null and review_sequence is not null)),
  foreign key(organization_id,source_time_stream_id,source_revision)
    references public.operations_personnel_project_publication_links(organization_id,source_time_stream_id,source_revision)
);
alter table public.operations_personnel_project_publication_links enable row level security;
alter table public.operations_personnel_project_publication_proofs enable row level security;
revoke all on public.operations_personnel_project_publication_links,public.operations_personnel_project_publication_proofs from public,anon,authenticated;
grant select,insert on public.operations_personnel_project_publication_links,public.operations_personnel_project_publication_proofs to service_role;
create trigger operations_personnel_project_pub_links_immutable before update or delete on public.operations_personnel_project_publication_links
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_project_pub_links_no_truncate before truncate on public.operations_personnel_project_publication_links
  for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_project_pub_proofs_immutable before update or delete on public.operations_personnel_project_publication_proofs
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_project_pub_proofs_no_truncate before truncate on public.operations_personnel_project_publication_proofs
  for each statement execute function public.operations_personnel_evidence_immutable();

-- Shared by the authenticated review publisher and subsequent canonical ingestion.
-- Only current matching Operations ledger heads are used; Time's day-wide project
-- approval is provenance, never authorization to confirm another project's cost.
create function operations_economy_private.derive_project_status_snapshot_v1(
  p_snapshot jsonb,p_submission_state text,p_source_revision bigint
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  v_org uuid:=(p_snapshot->>'organization_id')::uuid; v_stream text:=p_snapshot->>'source_time_stream_id';
  v_project uuid; v_ids jsonb; v_fingerprint text; v_review public.operations_project_personnel_reviews%rowtype;
  v_match boolean; v_status text; v_reason text; v_lines jsonb:=p_snapshot->'lines'; v_proofs jsonb:='[]'::jsonb;
begin
  if p_snapshot->>'schema_version' is distinct from 'operations-personnel-cost-v1'
    or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines)>1000
    or p_submission_state is null or p_submission_state not in ('submitted','correction_requested','approved','locked','voided')
    or p_source_revision is null or p_source_revision not between 1 and 9007199254740991
    then raise exception 'invalid_project_status_source' using errcode='22023'; end if;
  for v_project in select distinct (value->>'source_project_id')::uuid from jsonb_array_elements(v_lines) loop
    v_fingerprint:=operations_economy_private.project_fingerprint_v1(p_snapshot,v_project);
    select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_ids
      from jsonb_array_elements(v_lines) where (value->>'source_project_id')::uuid=v_project;
    select * into v_review from public.operations_project_personnel_reviews where organization_id=v_org and source_time_stream_id=v_stream
      and project_id=v_project order by review_sequence desc limit 1;
    v_match:=found and v_review.source_snapshot_hash=p_snapshot->>'source_snapshot_hash'
      and v_review.time_snapshot_version=(p_snapshot->>'time_snapshot_version')::bigint
      and v_review.economics_fingerprint=v_fingerprint and v_review.source_time_line_ids=v_ids;
    v_status:='preliminary';v_reason:='no_matching_project_review';
    if v_match then
      v_status:=case v_review.decision when 'approved' then 'confirmed' when 'rejected' then 'rejected' else 'preliminary' end;
      v_reason:=case when v_review.decision='reopened' then 'project_reopened' else null end;
    end if;
    if p_submission_state='voided' then v_status:='rejected';v_reason:='source_voided';
    elsif p_submission_state='correction_requested' and v_status<>'rejected' then
      v_status:='preliminary';v_reason:='source_correction_requested'; end if;
    select jsonb_agg(case when (value->>'source_project_id')::uuid=v_project then jsonb_set(value,'{status}',to_jsonb(v_status)) else value end order by ord)
      into v_lines from jsonb_array_elements(v_lines) with ordinality as l(value,ord);
    v_proofs:=v_proofs||jsonb_build_array(jsonb_build_object('project_id',v_project,'source_snapshot_hash',p_snapshot->>'source_snapshot_hash',
      'time_snapshot_version',p_snapshot->'time_snapshot_version','source_time_line_ids',v_ids,'economics_fingerprint',v_fingerprint,
      'review_event_id',case when v_match then v_review.event_id else null end,
      'review_sequence',case when v_match then v_review.review_sequence else null end,'economics_match',v_match,
      'applied_status',v_status,'invalidation_reason',v_reason));
  end loop;
  return jsonb_build_object('snapshot',jsonb_set(jsonb_set(p_snapshot,'{source_revision}',to_jsonb(p_source_revision)),'{lines}',v_lines),'proofs',v_proofs);
end; $$;
revoke all on function operations_economy_private.derive_project_status_snapshot_v1(jsonb,text,bigint) from public,anon,authenticated;
grant execute on function operations_economy_private.derive_project_status_snapshot_v1(jsonb,text,bigint) to service_role;

create function operations_economy_private.record_project_publication_proofs_v1(
  p_snapshot jsonb,p_proofs jsonb,p_previous_revision bigint,p_event_kind text,p_actor uuid,p_project uuid,p_review_sequence bigint,p_key text
) returns void language plpgsql security invoker set search_path='' as $$
declare v_proof jsonb; v_org uuid:=(p_snapshot->>'organization_id')::uuid; v_stream text:=p_snapshot->>'source_time_stream_id';
  v_revision bigint:=(p_snapshot->>'source_revision')::bigint;
begin
  insert into public.operations_personnel_project_publication_links(organization_id,source_time_stream_id,source_revision,previous_source_revision,
    event_kind,actor_system_user_id,trigger_project_id,trigger_review_sequence,idempotency_key)
    values(v_org,v_stream,v_revision,p_previous_revision,p_event_kind,p_actor,p_project,p_review_sequence,p_key);
  for v_proof in select value from jsonb_array_elements(p_proofs) loop
    insert into public.operations_personnel_project_publication_proofs(organization_id,source_time_stream_id,source_revision,project_id,
      source_snapshot_hash,time_snapshot_version,source_time_line_ids,economics_fingerprint,review_event_id,review_sequence,economics_match,applied_status,invalidation_reason)
    values(v_org,v_stream,v_revision,(v_proof->>'project_id')::uuid,v_proof->>'source_snapshot_hash',(v_proof->>'time_snapshot_version')::bigint,
      v_proof->'source_time_line_ids',v_proof->>'economics_fingerprint',(v_proof->>'review_event_id')::uuid,(v_proof->>'review_sequence')::bigint,
      (v_proof->>'economics_match')::boolean,v_proof->>'applied_status',v_proof->>'invalidation_reason');
  end loop;
end; $$;
revoke all on function operations_economy_private.record_project_publication_proofs_v1(jsonb,jsonb,bigint,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function operations_economy_private.record_project_publication_proofs_v1(jsonb,jsonb,bigint,text,uuid,uuid,bigint,text) to service_role;

create function operations_economy_private.publish_project_reviews_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=auth.uid();v_head bigint;v_source public.operations_personnel_cost_publications%rowtype;
  v_old_outbox public.operations_personnel_cost_outbox%rowtype;v_outbox public.operations_personnel_cost_outbox%rowtype;
  v_link public.operations_personnel_project_publication_links%rowtype;v_selected public.operations_project_personnel_reviews%rowtype;
  v_route public.operations_personnel_transport_routes%rowtype;v_projected jsonb;v_snapshot jsonb;v_receipt jsonb;v_body text;v_hash text;v_selected_ids jsonb;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  if p_source_time_stream_id is null or p_source_time_stream_id<>btrim(p_source_time_stream_id) or length(p_source_time_stream_id) not between 1 and 256
    or p_expected_source_revision is null or p_expected_source_revision not between 1 and 9007199254740990
    or p_expected_review_sequence is null or p_expected_review_sequence not between 1 and 9007199254740991
    or p_idempotency_key is null or p_idempotency_key<>btrim(p_idempotency_key) or length(p_idempotency_key) not between 12 and 200
    then raise exception 'invalid_project_review_publication' using errcode='22023'; end if;
  select current_revision into v_head from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=p_source_time_stream_id for update;
  if not found then raise exception 'source_stream_not_found' using errcode='22023'; end if;
  select * into v_link from public.operations_personnel_project_publication_links where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_link.event_kind<>'project_review' or v_link.source_time_stream_id<>p_source_time_stream_id or v_link.actor_system_user_id<>v_actor
      or v_link.trigger_project_id<>p_project_id or v_link.trigger_review_sequence<>p_expected_review_sequence or v_link.previous_source_revision<>p_expected_source_revision
      then raise exception 'project_publication_idempotency_conflict' using errcode='23505'; end if;
    select * into strict v_outbox from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_link.source_revision;
    return jsonb_build_object('status','duplicate','source_revision',v_link.source_revision,'outbox_id',v_outbox.id,'body_sha256',v_outbox.body_sha256);
  end if;
  if v_head<>p_expected_source_revision then return jsonb_build_object('status','stale_source','current_source_revision',v_head); end if;
  select * into v_selected from public.operations_project_personnel_reviews where organization_id=v_org and source_time_stream_id=p_source_time_stream_id
    and project_id=p_project_id order by review_sequence desc limit 1;
  if not found or v_selected.review_sequence<>p_expected_review_sequence then
    return jsonb_build_object('status','stale_review','current_review_sequence',coalesce(v_selected.review_sequence,0)); end if;
  select * into strict v_source from public.operations_personnel_cost_publications where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_head;
  select * into strict v_old_outbox from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_head;
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_selected_ids
    from jsonb_array_elements(v_source.cost_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  if v_selected.source_snapshot_hash<>v_source.source_snapshot_hash or v_selected.time_snapshot_version<>v_source.time_snapshot_version
    or v_selected_ids is null or v_selected.source_time_line_ids is distinct from v_selected_ids
    or v_selected.economics_fingerprint<>operations_economy_private.project_fingerprint_v1(v_source.cost_snapshot,p_project_id) then
    return jsonb_build_object('status','stale_project_economics','current_source_revision',v_head); end if;
  select * into v_route from public.operations_personnel_transport_routes where organization_id=v_org;
  if not found then raise exception 'transport_route_not_enrolled' using errcode='22023'; end if;
  v_projected:=operations_economy_private.derive_project_status_snapshot_v1(v_source.cost_snapshot,v_old_outbox.source_evidence->>'submission_state',v_head+1);
  v_snapshot:=v_projected->'snapshot';v_body:=v_snapshot::text;
  if octet_length(v_body)>262144 then raise exception 'transport_body_too_large' using errcode='22023'; end if;
  v_hash:=encode(sha256(convert_to(v_body,'UTF8')),'hex');
  v_receipt:=public.publish_operations_personnel_cost_v1(v_snapshot,v_source.raw_time_snapshot,v_head,p_idempotency_key);
  if v_receipt->>'status' is distinct from 'accepted' then raise exception 'project_review_publication_not_accepted' using errcode='22023'; end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,p_source_time_stream_id,v_head+1,v_body,v_hash,v_old_outbox.source_evidence,v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url) returning * into v_outbox;
  perform operations_economy_private.record_project_publication_proofs_v1(v_snapshot,v_projected->'proofs',v_head,'project_review',v_actor,p_project_id,p_expected_review_sequence,p_idempotency_key);
  return v_receipt||jsonb_build_object('outbox_id',v_outbox.id,'body_sha256',v_hash);
end; $$;
revoke all on function operations_economy_private.publish_project_reviews_v1(text,uuid,bigint,bigint,text) from public,anon;
grant execute on function operations_economy_private.publish_project_reviews_v1(text,uuid,bigint,bigint,text) to authenticated;
create function public.publish_operations_project_personnel_reviews_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,p_idempotency_key text
) returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.publish_project_reviews_v1(p_source_time_stream_id,p_project_id,p_expected_source_revision,p_expected_review_sequence,p_idempotency_key);
$$;
revoke all on function public.publish_operations_project_personnel_reviews_v1(text,uuid,bigint,bigint,text) from public,anon;
grant execute on function public.publish_operations_project_personnel_reviews_v1(text,uuid,bigint,bigint,text) to authenticated;
