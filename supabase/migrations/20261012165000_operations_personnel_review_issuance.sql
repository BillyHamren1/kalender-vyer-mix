-- Prospective project review authority; event references only, no money/backfill.
revoke all on public.operations_project_personnel_review_grants from service_role;
grant select on public.operations_project_personnel_review_grants to service_role;
create table operations_economy_private.accepted_project_grant_issuances_v1(event_id uuid primary key references public.operations_project_personnel_review_grants(event_id));
alter table operations_economy_private.accepted_project_grant_issuances_v1 enable row level security;
revoke all on operations_economy_private.accepted_project_grant_issuances_v1 from public,anon,authenticated,service_role;
create trigger accepted_project_grant_issuances_v1_immutable before update or delete on operations_economy_private.accepted_project_grant_issuances_v1
 for each row execute function public.operations_personnel_evidence_immutable();
create trigger accepted_project_grant_issuances_v1_no_truncate before truncate on operations_economy_private.accepted_project_grant_issuances_v1
 for each statement execute function public.operations_personnel_evidence_immutable();
create view public.operations_issued_project_grant_events_v1 with(security_barrier=true) as
 select e.* from public.operations_project_personnel_review_grants e join operations_economy_private.accepted_project_grant_issuances_v1 i on i.event_id=e.event_id;
revoke all on public.operations_issued_project_grant_events_v1 from public,anon,authenticated,service_role;
grant select on public.operations_issued_project_grant_events_v1 to service_role;
revoke all on public.operations_project_personnel_reviews from service_role;
grant select on public.operations_project_personnel_reviews to service_role;
create table operations_economy_private.accepted_project_review_issuances_v1(event_id uuid primary key references public.operations_project_personnel_reviews(event_id));
alter table operations_economy_private.accepted_project_review_issuances_v1 enable row level security;
revoke all on operations_economy_private.accepted_project_review_issuances_v1 from public,anon,authenticated,service_role;
create trigger accepted_project_review_issuances_v1_immutable before update or delete on operations_economy_private.accepted_project_review_issuances_v1
 for each row execute function public.operations_personnel_evidence_immutable();
create trigger accepted_project_review_issuances_v1_no_truncate before truncate on operations_economy_private.accepted_project_review_issuances_v1
 for each statement execute function public.operations_personnel_evidence_immutable();
create view public.operations_issued_project_review_events_v1 with(security_barrier=true) as
 select e.* from public.operations_project_personnel_reviews e join operations_economy_private.accepted_project_review_issuances_v1 i on i.event_id=e.event_id;
revoke all on public.operations_issued_project_review_events_v1 from public,anon,authenticated,service_role;
grant select on public.operations_issued_project_review_events_v1 to service_role;
create or replace function operations_economy_private.authorize_project_v1(p_project_id uuid,p_admin_only boolean default false)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_org uuid; v_admin boolean; v_grant text;
begin
  if v_actor is null or not exists(select 1 from auth.users where id=v_actor) then
    raise exception 'authenticated_system_user_required' using errcode='42501'; end if;
  begin
    select organization_id into strict v_org from public.profiles where user_id=v_actor;
  exception when no_data_found or too_many_rows then
    raise exception 'unambiguous_system_profile_required' using errcode='42501';
  end;
  if v_org is null or not exists(select 1 from public.projects where id=p_project_id and organization_id=v_org and deleted_at is null)
    then raise exception 'organization_project_access_denied' using errcode='42501'; end if;
  select exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin') into v_admin;
  if v_admin then return v_org; end if;
  if p_admin_only or not exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org) then
    raise exception 'project_review_admin_required' using errcode='42501'; end if;
  select decision into v_grant from public.operations_issued_project_grant_events_v1
    where organization_id=v_org and project_id=p_project_id and system_user_id=v_actor order by grant_sequence desc limit 1;
  if v_grant is distinct from 'granted' then raise exception 'explicit_project_review_grant_required' using errcode='42501'; end if;
  return v_org;
end; $$;
create or replace function operations_economy_private.grant_review_v1(
  p_project_id uuid,p_system_user_id uuid,p_expected_grant_sequence bigint,p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_head bigint:=0;
  v_existing public.operations_project_personnel_review_grants%rowtype; v_event public.operations_project_personnel_review_grants%rowtype;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,true);
  if p_expected_grant_sequence is null or p_expected_grant_sequence not between 0 and 9007199254740991
    or p_decision is null or p_decision not in ('granted','revoked') or p_reason is null or p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 1000
    or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 or p_idempotency_key<>btrim(p_idempotency_key)
    then raise exception 'invalid_project_review_grant' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_system_user_id and p.organization_id=v_org) then
    raise exception 'grantee_not_in_organization' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-review-grant',v_org,p_project_id,p_system_user_id),0));
  select * into v_existing from public.operations_project_personnel_review_grants where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from operations_economy_private.accepted_project_grant_issuances_v1 where event_id=v_existing.event_id) then raise exception 'legacy_grant_event_not_issued' using errcode='22023';end if;
    if v_existing.project_id<>p_project_id or v_existing.system_user_id<>p_system_user_id or v_existing.actor_system_user_id<>v_actor
      or v_existing.decision<>p_decision or v_existing.reason<>p_reason then raise exception 'grant_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','duplicate','event_id',v_existing.event_id,'grant_sequence',v_existing.grant_sequence);
  end if;
  select coalesce(max(grant_sequence),0) into v_head from public.operations_project_personnel_review_grants
    where organization_id=v_org and project_id=p_project_id and system_user_id=p_system_user_id;
  if v_head<>p_expected_grant_sequence then return jsonb_build_object('status','stale','current_grant_sequence',v_head); end if;
  insert into public.operations_project_personnel_review_grants(organization_id,project_id,system_user_id,actor_system_user_id,decision,reason,idempotency_key)
    values(v_org,p_project_id,p_system_user_id,v_actor,p_decision,p_reason,p_idempotency_key) returning * into v_event;
  insert into operations_economy_private.accepted_project_grant_issuances_v1(event_id) values(v_event.event_id);
  return jsonb_build_object('status','accepted','event_id',v_event.event_id,'grant_sequence',v_event.grant_sequence);
end; $$;
create or replace function operations_economy_private.review_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,
  p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_source bigint; v_review bigint:=0; v_snapshot jsonb; v_state text;
  v_existing public.operations_project_personnel_reviews%rowtype; v_event public.operations_project_personnel_reviews%rowtype;
  v_line_ids jsonb; v_fingerprint text;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  if p_source_time_stream_id is null or p_source_time_stream_id<>btrim(p_source_time_stream_id) or length(p_source_time_stream_id) not between 1 and 256
    or p_expected_source_revision is null or p_expected_source_revision not between 1 and 9007199254740991
    or p_expected_review_sequence is null or p_expected_review_sequence not between 0 and 9007199254740991
    or p_decision is null or p_decision not in ('approved','reopened','rejected')
    or (p_reason is not null and (p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 1000))
    or (p_decision<>'approved' and p_reason is null)
    or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 or p_idempotency_key<>btrim(p_idempotency_key)
    then raise exception 'invalid_project_personnel_review' using errcode='22023'; end if;
  -- Head lock is shared with publication CAS: review cannot approve moving source.
  select current_revision into v_source from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id for update;
  if not found then raise exception 'source_stream_not_found' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-personnel-review',v_org,p_source_time_stream_id,p_project_id),0));
  select * into v_existing from public.operations_project_personnel_reviews where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from operations_economy_private.accepted_project_review_issuances_v1 where event_id=v_existing.event_id) then raise exception 'legacy_review_event_not_issued' using errcode='22023';end if;
    if v_existing.source_time_stream_id<>p_source_time_stream_id or v_existing.project_id<>p_project_id or v_existing.actor_system_user_id<>v_actor
      or v_existing.source_revision<>p_expected_source_revision or v_existing.decision<>p_decision or v_existing.reason is distinct from p_reason
      then raise exception 'review_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','duplicate','event_id',v_existing.event_id,'review_sequence',v_existing.review_sequence);
  end if;
  if v_source<>p_expected_source_revision then return jsonb_build_object('status','stale_source','current_source_revision',v_source); end if;
  select cost_snapshot into strict v_snapshot from public.operations_personnel_cost_publications
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_source;
  select source_evidence->>'submission_state' into v_state from public.operations_personnel_cost_outbox
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_source;
  if p_decision='approved' and (v_state is null or v_state in ('voided','correction_requested')) then
    raise exception 'source_cannot_be_confirmed' using errcode='22023'; end if;
  v_fingerprint:=operations_economy_private.project_fingerprint_v1(v_snapshot,p_project_id);
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_line_ids
    from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  select coalesce(max(review_sequence),0) into v_review from public.operations_project_personnel_reviews
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id;
  if v_review<>p_expected_review_sequence then return jsonb_build_object('status','stale_review','current_review_sequence',v_review); end if;
  insert into public.operations_project_personnel_reviews(organization_id,source_time_stream_id,source_revision,source_time_report_id,
    source_snapshot_hash,time_snapshot_version,project_id,source_time_line_ids,economics_fingerprint,decision,actor_system_user_id,reason,idempotency_key)
    values(v_org,p_source_time_stream_id,v_source,(v_snapshot->>'source_time_report_id')::uuid,v_snapshot->>'source_snapshot_hash',
      (v_snapshot->>'time_snapshot_version')::bigint,p_project_id,v_line_ids,v_fingerprint,p_decision,v_actor,p_reason,p_idempotency_key) returning * into v_event;
  insert into operations_economy_private.accepted_project_review_issuances_v1(event_id) values(v_event.event_id);
  return jsonb_build_object('status','accepted','event_id',v_event.event_id,'review_sequence',v_event.review_sequence,
    'source_project_id',v_event.project_id,'economics_fingerprint',v_event.economics_fingerprint,'source_time_line_ids',v_event.source_time_line_ids);
end; $$;
create or replace function operations_economy_private.read_review_v1(p_source_time_stream_id text,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_revision bigint; v_snapshot jsonb; v_state text; v_event public.operations_project_personnel_reviews%rowtype; v_line_ids jsonb;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  select current_revision into v_revision from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=p_source_time_stream_id;
  if not found then return jsonb_build_object('status','no_current_review'); end if;
  select cost_snapshot into v_snapshot from public.operations_personnel_cost_publications
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_revision;
  if not exists(select 1 from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id)
    then return jsonb_build_object('status','no_current_review'); end if;
  select source_evidence->>'submission_state' into v_state from public.operations_personnel_cost_outbox
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_revision;
  select * into v_event from public.operations_issued_project_review_events_v1
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id order by review_sequence desc limit 1;
  if not found or v_event.source_snapshot_hash is distinct from v_snapshot->>'source_snapshot_hash'
    or v_event.time_snapshot_version is distinct from (v_snapshot->>'time_snapshot_version')::bigint
    or v_event.economics_fingerprint is distinct from operations_economy_private.project_fingerprint_v1(v_snapshot,p_project_id)
    then return jsonb_build_object('status','no_current_review'); end if;
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_line_ids
    from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  if v_event.source_time_line_ids<>v_line_ids or v_state='voided' or
    (v_event.decision='approved' and (v_state is null or v_state='correction_requested')) then
    return jsonb_build_object('status','no_current_review'); end if;
  return jsonb_build_object('status','current','review',jsonb_build_object(
    'schema','operations-personnel-project-review.v1','event_id',v_event.event_id,'organization_id',v_event.organization_id,
    'source_time_stream_id',v_event.source_time_stream_id,'source_snapshot_hash',v_event.source_snapshot_hash,
    'time_snapshot_version',v_event.time_snapshot_version,'source_project_id',v_event.project_id,
    'source_time_line_ids',v_event.source_time_line_ids,'economics_fingerprint',v_event.economics_fingerprint,
    'decision',v_event.decision,'actor_system_user_id',v_event.actor_system_user_id,'reason',v_event.reason,'review_sequence',v_event.review_sequence));
end; $$;
create or replace function operations_economy_private.derive_project_status_snapshot_v1(
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
    select * into v_review from public.operations_issued_project_review_events_v1 where organization_id=v_org and source_time_stream_id=v_stream
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
create function operations_economy_private.assert_issued_publication_reviews_v1(p_org uuid,p_stream text,p_revision bigint)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 -- A historical service-created row with absent or inconsistent proofs is not
 -- accepted just because it has an idempotency link. Check every saved project.
 if exists(select 1 from public.operations_personnel_cost_publications c
  cross join lateral jsonb_array_elements(c.cost_snapshot->'lines') l
  where c.organization_id=p_org and c.source_time_stream_id=p_stream and c.source_revision=p_revision
  and not exists(select 1 from public.operations_personnel_project_publication_proofs p
   where p.organization_id=p_org and p.source_time_stream_id=p_stream and p.source_revision=p_revision
    and p.project_id=(l->>'source_project_id')::uuid and p.applied_status=l->>'status'
    and p.source_snapshot_hash=c.source_snapshot_hash and p.time_snapshot_version=c.time_snapshot_version
    and p.economics_fingerprint=operations_economy_private.project_fingerprint_v1(c.cost_snapshot,p.project_id)
    and p.source_time_line_ids=(select jsonb_agg(v->'source_time_line_id' order by v->>'source_time_line_id' collate "C") from jsonb_array_elements(c.cost_snapshot->'lines') v where (v->>'source_project_id')::uuid=p.project_id)
    and (p.applied_status<>'confirmed' or p.review_event_id is not null))) then
  raise exception 'legacy_publication_review_not_issued' using errcode='22023';
 end if;
 if exists(select 1 from public.operations_personnel_project_publication_proofs p
  where p.organization_id=p_org and p.source_time_stream_id=p_stream and p.source_revision=p_revision
  and p.review_event_id is not null and not exists(select 1 from public.operations_issued_project_review_events_v1 e
    where e.event_id=p.review_event_id and e.organization_id=p.organization_id and e.source_time_stream_id=p.source_time_stream_id
      and e.project_id=p.project_id and e.review_sequence=p.review_sequence
      and e.source_snapshot_hash=p.source_snapshot_hash and e.time_snapshot_version=p.time_snapshot_version
      and e.economics_fingerprint=p.economics_fingerprint and e.source_time_line_ids=p.source_time_line_ids
      and (p.applied_status<>'confirmed' or (e.decision='approved' and exists(select 1 from public.operations_personnel_cost_outbox o where o.organization_id=p_org and o.source_time_stream_id=p_stream and o.source_revision=p_revision and o.source_evidence->>'submission_state' in ('submitted','approved','locked')))))) then
  raise exception 'legacy_publication_review_not_issued' using errcode='22023';
 end if;
end;$$;
revoke all on function operations_economy_private.assert_issued_publication_reviews_v1(uuid,text,bigint) from public,anon,authenticated;
grant execute on function operations_economy_private.assert_issued_publication_reviews_v1(uuid,text,bigint) to service_role;
-- Validate frozen economics against the exact issued rate; never select a newer
-- rate or rewrite saved money. Missing-rate lines remain incomplete.
create function operations_economy_private.assert_issued_frozen_rates_v1(p_snapshot jsonb,p_raw jsonb)
returns void language plpgsql stable security invoker set search_path='' as $$
declare line jsonb;
begin
 for line in select value from jsonb_array_elements(p_snapshot->'lines') where value->>'coverage'='complete' loop
  if not exists(select 1 from public.operations_personnel_accepted_rate_history_v1 r
   join lateral (select value b from jsonb_array_elements(p_raw->'blocks') where value->>'id'=line->>'source_time_line_id') block on true
   where r.organization_id=(p_snapshot->>'organization_id')::uuid and r.worker_id=(p_snapshot->>'worker_id')::uuid
    and r.rate_revision=line->>'rate_revision' and r.category=block.b->>'kind' and r.currency=line->>'currency'
    and r.effective_from<=(p_snapshot->>'work_date')::date
    and (r.effective_to is null or (p_snapshot->>'work_date')::date<r.effective_to)
    and to_jsonb(r.hourly_rate_minor)=line->'hourly_rate_minor'
    and block.b->'durationMinutes'=line->'minutes'
    and jsonb_typeof(line->'minutes')='number' and jsonb_typeof(line->'amount_minor')='number'
    and (line->>'amount_minor')::numeric=floor(((line->>'minutes')::numeric*r.hourly_rate_minor+30)/60)) then
   raise exception 'accepted_frozen_rate_provenance_required' using errcode='22023';
  end if;
 end loop;
end;$$;
revoke all on function operations_economy_private.assert_issued_frozen_rates_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function operations_economy_private.assert_issued_frozen_rates_v1(jsonb,jsonb) to service_role;

create or replace function operations_economy_private.publish_project_reviews_v1(
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
    perform operations_economy_private.assert_issued_publication_reviews_v1(v_org,p_source_time_stream_id,v_link.source_revision);
    perform operations_economy_private.assert_issued_frozen_rates_v1(cost_snapshot,raw_time_snapshot) from public.operations_personnel_cost_publications where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_link.source_revision;
    if not exists(select 1 from public.operations_issued_project_review_events_v1 where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id and review_sequence=p_expected_review_sequence) then raise exception 'legacy_review_event_not_issued' using errcode='22023';end if;
    return jsonb_build_object('status','duplicate','source_revision',v_link.source_revision,'outbox_id',v_outbox.id,'body_sha256',v_outbox.body_sha256);
  end if;
  if v_head<>p_expected_source_revision then return jsonb_build_object('status','stale_source','current_source_revision',v_head); end if;
  select * into v_selected from public.operations_issued_project_review_events_v1 where organization_id=v_org and source_time_stream_id=p_source_time_stream_id
    and project_id=p_project_id order by review_sequence desc limit 1;
  if not found or v_selected.review_sequence<>p_expected_review_sequence then
    return jsonb_build_object('status','stale_review','current_review_sequence',coalesce(v_selected.review_sequence,0)); end if;
  select * into strict v_source from public.operations_personnel_cost_publications where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_head;
  perform operations_economy_private.assert_issued_frozen_rates_v1(v_source.cost_snapshot,v_source.raw_time_snapshot);
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
create or replace function public.publish_operations_personnel_cost_ingress_v1(
  p_snapshot jsonb,p_raw_time_snapshot jsonb,p_source_evidence jsonb,
  p_expected_revision bigint,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_org uuid := (p_snapshot->>'organization_id')::uuid;
  v_worker uuid := (p_snapshot->>'worker_id')::uuid;
  v_stream text := p_snapshot->>'source_time_stream_id';
  v_route public.operations_personnel_transport_routes%rowtype;
  v_binding public.operations_personnel_source_bindings%rowtype;
  v_existing public.operations_personnel_cost_outbox%rowtype;
  v_line jsonb; v_block jsonb; v_target public.operations_personnel_target_bindings%rowtype;
  v_rate public.operations_personnel_rate_history%rowtype;
  v_result jsonb; v_body text; v_id uuid; v_review_seq bigint;
  v_projection jsonb; v_snapshot jsonb; v_head bigint; v_retry public.operations_personnel_cost_publications%rowtype;
  v_old_lines jsonb; v_new_lines jsonb; v_same_time boolean;
begin
  -- Normalization must not repair a malformed producer envelope. Status is
  -- required as a wire field but carries no authority for the derived result.
  if jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'lines') is distinct from 'array'
    or (select count(*) from jsonb_object_keys(p_snapshot))<>11 or not (p_snapshot ?& array[
      'schema_version','organization_id','source_time_stream_id','source_time_report_id','source_revision',
      'time_snapshot_version','source_snapshot_hash','worker_id','work_date','calculation_version','lines'])
    or jsonb_array_length(p_snapshot->'lines')>1000
    then raise exception 'invalid_canonical_ingress_shape' using errcode='22023';end if;
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    if jsonb_typeof(v_line) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_line))<>10
      or not (v_line ?& array['source_time_line_id','source_project_id','source_booking_id','minutes','rate_revision',
        'hourly_rate_minor','amount_minor','currency','status','coverage'])
      or jsonb_typeof(v_line->'status') is distinct from 'string' or coalesce(v_line->>'status','') not in ('preliminary','confirmed','rejected')
      then raise exception 'invalid_canonical_ingress_line' using errcode='22023';end if;
  end loop;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991
    or jsonb_typeof(p_snapshot->'source_revision') is distinct from 'number'
    or (p_snapshot->>'source_revision')::numeric <> p_expected_revision+1
    then raise exception 'invalid_assigned_publication_revision' using errcode='22023'; end if;
  select * into v_binding from public.operations_personnel_source_bindings where organization_id=v_org and worker_id=v_worker and enabled;
  if not found then raise exception 'source_binding_not_enabled' using errcode='22023'; end if;
  if jsonb_typeof(p_source_evidence) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source_evidence))<>11
    or not (p_source_evidence ?& array['schema','personnel_id','source_system','external_personnel_id','project_review_sequence',
      'project_review_status','raw_snapshot_sha256','persisted_sync_state','submission_state','submission_decision_sequence','raw_snapshot'])
    or v_binding.time_organization_id <> (p_raw_time_snapshot->>'organizationId')::uuid
    or v_binding.time_auth_worker_id <> (p_raw_time_snapshot->>'workerId')::uuid
    or p_source_evidence->>'personnel_id' is distinct from v_binding.time_personnel_id::text
    or p_source_evidence->>'source_system' is distinct from v_binding.time_source_system
    or p_source_evidence->>'external_personnel_id' is distinct from v_binding.external_personnel_id
    or p_source_evidence->>'schema' is distinct from 'operations-personnel-source-evidence-v1'
    or jsonb_typeof(p_source_evidence->'project_review_sequence') is distinct from 'number'
    or (p_source_evidence->>'project_review_sequence')::numeric not between 0 and 9007199254740991
    or mod((p_source_evidence->>'project_review_sequence')::numeric,1) <> 0
    or coalesce(p_source_evidence->>'raw_snapshot_sha256','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_source_evidence->'raw_snapshot') is distinct from 'string'
    or octet_length(p_source_evidence->>'raw_snapshot') > 1048576
    or encode(sha256(convert_to(p_source_evidence->>'raw_snapshot','UTF8')),'hex') is distinct from p_source_evidence->>'raw_snapshot_sha256'
    or (p_source_evidence->>'raw_snapshot')::jsonb is distinct from p_raw_time_snapshot
    or coalesce(p_source_evidence->>'project_review_status','') not in ('preliminary','confirmed','rejected')
    or p_source_evidence->>'persisted_sync_state' is distinct from 'synced'
    or coalesce(p_source_evidence->>'submission_state','') not in ('submitted','correction_requested','approved','locked','voided')
    or jsonb_typeof(p_source_evidence->'submission_decision_sequence') is distinct from 'number'
    or (p_source_evidence->>'submission_decision_sequence')::numeric not between 0 and 9007199254740991
    or mod((p_source_evidence->>'submission_decision_sequence')::numeric,1) <> 0
    then raise exception 'source_binding_evidence_mismatch' using errcode='22023'; end if;
  -- Check accepted provenance even on historical duplicate retries. An old shadow
  -- receipt must never be relabeled accepted merely by replaying its key.
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') where value->>'coverage'='complete' loop
    if not exists(select 1 from public.operations_personnel_accepted_rate_history_v1 r
      join lateral (select value b from jsonb_array_elements(p_raw_time_snapshot->'blocks')
        where value->>'id'=v_line->>'source_time_line_id') block on true
      where r.organization_id=v_org and r.worker_id=v_worker and r.rate_revision=v_line->>'rate_revision'
        and r.category=block.b->>'kind' and r.currency=v_line->>'currency'
        and r.effective_from <= (p_snapshot->>'work_date')::date
        and (r.effective_to is null or (p_snapshot->>'work_date')::date<r.effective_to)
        and to_jsonb(r.hourly_rate_minor)=v_line->'hourly_rate_minor') then
      raise exception 'accepted_rate_provenance_required' using errcode='22023';
    end if;
  end loop;
  v_review_seq := (p_source_evidence->>'project_review_sequence')::numeric::bigint;
  select * into v_route from public.operations_personnel_transport_routes where organization_id=v_org;
  if not found then raise exception 'transport_route_not_enrolled' using errcode='22023'; end if;
  -- Serialize first publication too, before reading project decisions. All review
  -- commands use this same stream row lock; no globally approved transient outbox.
  -- A malformed/stale first CAS must not create a persistent empty stream.
  if p_expected_revision>0 and not exists(select 1 from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=v_stream) then
    return jsonb_build_object('status','stale','current_revision',0);end if;
  insert into public.operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id)
    values(v_org,v_stream,v_worker,(p_snapshot->>'work_date')::date,v_binding.time_organization_id,v_binding.time_auth_worker_id)
    on conflict(organization_id,source_time_stream_id) do nothing;
  select current_revision into strict v_head from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=v_stream for update;
  select * into v_retry from public.operations_personnel_cost_publications where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    select jsonb_agg(value-'status' order by ord) into v_old_lines from jsonb_array_elements(v_retry.cost_snapshot->'lines') with ordinality l(value,ord);
    select jsonb_agg(value-'status' order by ord) into v_new_lines from jsonb_array_elements(p_snapshot->'lines') with ordinality l(value,ord);
    select * into strict v_existing from public.operations_personnel_cost_outbox where organization_id=v_org
      and source_time_stream_id=v_retry.source_time_stream_id and source_revision=v_retry.source_revision;
    if v_retry.source_time_stream_id is distinct from v_stream or v_retry.source_revision<>p_expected_revision+1
      or (v_retry.cost_snapshot-'lines') is distinct from (p_snapshot-'lines') or v_old_lines is distinct from v_new_lines
      or v_retry.raw_time_snapshot is distinct from p_raw_time_snapshot or v_existing.source_evidence is distinct from p_source_evidence
      or not exists(select 1 from public.operations_personnel_project_publication_links where organization_id=v_org
        and source_time_stream_id=v_stream and source_revision=v_retry.source_revision and event_kind='time_ingress')
      then raise exception 'canonical_ingress_idempotency_conflict' using errcode='23505'; end if;
    perform operations_economy_private.assert_issued_publication_reviews_v1(v_org,v_stream,v_retry.source_revision);
    return jsonb_build_object('status','duplicate','source_revision',v_retry.source_revision,'outbox_id',v_existing.id,'body_sha256',v_existing.body_sha256);
  end if;
  if v_head<>p_expected_revision then return jsonb_build_object('status','stale','current_revision',v_head);end if;
  select * into v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
    and source_revision=v_head;
  v_same_time:=found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint;
  -- Immutable allocation identity must exist in the actual frozen document.
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    select value into v_block from jsonb_array_elements(p_raw_time_snapshot->'blocks')
      where value->>'id'=v_line->>'source_time_line_id' and value->>'kind' in ('work','travel') and (value->>'durationMinutes')::numeric>0;
    if not found then raise exception 'allocation_not_in_frozen_time' using errcode='22023'; end if;
    select * into v_target from public.operations_personnel_target_bindings where organization_id=v_org
      and source_system=v_block#>>'{target,sourceSystem}' and target_kind=v_block#>>'{target,kind}'
      and external_id=v_block#>>'{target,externalId}' and target_version=v_block#>>'{target,version}';
    if not found or v_target.source_project_id <> (v_line->>'source_project_id')::uuid
      or v_target.source_booking_id is distinct from (v_line->>'source_booking_id')::uuid
      or v_target.currency is distinct from v_line->>'currency'
      or v_line->'minutes' is distinct from v_block->'durationMinutes'
      then raise exception 'allocation_binding_mismatch' using errcode='22023'; end if;
    if v_line->>'coverage'='complete' then
      select * into v_rate from public.operations_personnel_accepted_rate_history_v1 where organization_id=v_org and worker_id=v_worker
        and rate_revision=v_line->>'rate_revision' and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date
        and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to);
      if not found or v_rate.hourly_rate_minor <> (v_line->>'hourly_rate_minor')::bigint
        or floor(((v_line->>'minutes')::numeric*v_rate.hourly_rate_minor+30)/60) <> (v_line->>'amount_minor')::numeric
        then raise exception 'historical_rate_calculation_mismatch' using errcode='22023'; end if;
    elsif not coalesce(v_same_time,false) and exists(select 1 from public.operations_personnel_accepted_rate_history_v1
      where organization_id=v_org and worker_id=v_worker and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to)) then
      raise exception 'missing_rate_has_resolved_history' using errcode='22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_raw_time_snapshot->'blocks') where value->>'kind' in ('work','travel') and (value->>'durationMinutes')::numeric>0)
    <> jsonb_array_length(p_snapshot->'lines') then raise exception 'incomplete_frozen_allocations' using errcode='22023'; end if;
  -- Serialize source review sequencing with the publication head (old RPC CAS).
  perform 1 from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=v_stream for update;
  select * into v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
    order by source_revision desc limit 1;
  if found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint
    and ((v_existing.source_evidence->>'project_review_sequence')::bigint > v_review_seq or
      (v_existing.source_evidence->>'submission_decision_sequence')::bigint > (p_source_evidence->>'submission_decision_sequence')::bigint)
    then return jsonb_build_object('status','stale_source_review','current_revision',v_existing.source_revision); end if;
  if found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint
    and (v_existing.source_evidence->>'project_review_sequence')::bigint=v_review_seq
    and (v_existing.source_evidence->>'submission_decision_sequence')::bigint=(p_source_evidence->>'submission_decision_sequence')::bigint
    and v_existing.source_evidence <> p_source_evidence then raise exception 'same_source_event_changed' using errcode='23505'; end if;
  -- Derive every project status from the Operations ledger BEFORE publishing.
  -- Time's whole-day project status remains immutable provenance only.
  v_projection:=operations_economy_private.derive_project_status_snapshot_v1(p_snapshot,p_source_evidence->>'submission_state',v_head+1);
  v_snapshot:=v_projection->'snapshot';v_body:=v_snapshot::text;
  if octet_length(v_body)>262144 then raise exception 'transport_body_too_large' using errcode='22023';end if;
  v_result:=public.publish_operations_personnel_cost_v1(v_snapshot,p_raw_time_snapshot,v_head,p_idempotency_key);
  if v_result->>'status' is distinct from 'accepted' then return v_result;end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,v_stream,v_head+1,v_body,encode(sha256(convert_to(v_body,'UTF8')),'hex'),p_source_evidence,
      v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url) returning id into v_id;
  perform operations_economy_private.record_project_publication_proofs_v1(v_snapshot,v_projection->'proofs',v_head,'time_ingress',null,null,null,p_idempotency_key);
  return v_result||jsonb_build_object('outbox_id',v_id,'body_sha256',encode(sha256(convert_to(v_body,'UTF8')),'hex'));
end; $$;
-- Issuance is an authenticated system-user command, never an ambient service RPC.
revoke all on function operations_economy_private.grant_review_v1(uuid,uuid,bigint,text,text,text),
 public.grant_operations_project_personnel_review_v1(uuid,uuid,bigint,text,text,text),
 operations_economy_private.review_v1(text,uuid,bigint,bigint,text,text,text),
 public.review_operations_project_personnel_v1(text,uuid,bigint,bigint,text,text,text),
 operations_economy_private.publish_project_reviews_v1(text,uuid,bigint,bigint,text),
 public.publish_operations_project_personnel_reviews_v1(text,uuid,bigint,bigint,text) from service_role;
