-- DORMANT DRAFT: owner-only test entry point, not a migration or caller grant.
-- Reviews descend from accepted money; they never promote or reprice shadow rows.
create function operations_economy_private.issue_personnel_project_review_v1(
 p_issuer uuid,p_epoch uuid,p_stream text,p_project uuid,p_expected bigint,p_review bigint,p_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();digest text;result jsonb;issued timestamptz;envelope text;
 i operations_economy_private.personnel_issuers_v1%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;
 ancestor public.operations_personnel_cost_outbox%rowtype;
 o public.operations_personnel_cost_outbox%rowtype;
 m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
begin
 -- Stable authority fence: existing auth/profile/membership/project rows remain
 -- current until this transaction ends, including while waiting on issuer/head.
 -- Revocation either wins these locks and is observed, or waits behind this
 -- publication; explicit grant events use their existing advisory protocol.
 perform 1 from auth.users where id=actor for share;
 perform 1 from public.profiles where user_id=actor order by id for share;
 perform 1 from public.user_roles where user_id=actor order by id for share;
 perform 1 from public.projects where id=p_project for share;
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-review-grant',org,p_project,actor),0));
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 if p_expected is null or p_expected not between 1 and 9007199254740990
  or p_review is null or p_review not between 1 and 9007199254740991
  or p_stream is null or p_stream<>btrim(p_stream) or length(p_stream) not between 1 and 256
  or p_key is null or p_key<>btrim(p_key) or length(p_key) not between 12 and 200
  then raise exception 'invalid_accepted_review_command' using errcode='22023';end if;
 select * into i from operations_economy_private.personnel_issuers_v1
  where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 if not found or not i.enabled or i.organization_id<>org then raise exception 'review_issuer_not_enrolled' using errcode='42501';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1
  where issuer_id=p_issuer and enrollment_epoch=p_epoch and source_stream_id=p_stream for share;
 if not found or p_expected<=f.revision_floor then raise exception 'review_ancestor_below_floor_or_absent' using errcode='42501';end if;
 -- Binding and route locks follow source issuer ordering before canonical head.
 select * into b from public.operations_personnel_source_bindings
  where organization_id=org and worker_id=(f.source_binding->>'worker_id')::uuid for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from f.source_binding then raise exception 'review_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'review_destination_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_cost_streams where organization_id=org and source_time_stream_id=p_stream for update;
 if not found then raise exception 'review_stream_not_found' using errcode='22023';end if;
 select a.* into ancestor from public.operations_personnel_cost_outbox a
  join operations_economy_private.personnel_accepted_issuances_v1 marker on marker.outbox_id=a.id
  where a.organization_id=org and a.source_time_stream_id=p_stream and a.source_revision=p_expected
   and a.destination_organization_id=i.destination_organization_id
   and marker.issuer_id=p_issuer and marker.enrollment_epoch=p_epoch;
 if not found or (ancestor.raw_body::jsonb->>'worker_id')::uuid is distinct from b.worker_id
  then raise exception 'accepted_review_ancestor_required' using errcode='42501';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('schema','operations-personnel-review-command.v1',
  'actor',actor,'organization',org,'issuer',p_issuer,'epoch',p_epoch,'stream',p_stream,'project',p_project,
  'expected_revision',p_expected,'review_sequence',p_review,'idempotency_key',p_key)::text,'UTF8')),'hex');
 result:=operations_economy_private.publish_project_reviews_v1(p_stream,p_project,p_expected,p_review,p_key);
 if result->>'status' not in ('accepted','duplicate') then return result;end if;
 select * into strict o from public.operations_personnel_cost_outbox where id=(result->>'outbox_id')::uuid;
 if o.organization_id<>org or o.source_time_stream_id<>p_stream or o.source_revision<>p_expected+1
  or o.destination_organization_id<>i.destination_organization_id then raise exception 'accepted_review_outbox_mismatch' using errcode='22023';end if;
 perform operations_economy_private.assert_issued_publication_reviews_v1(org,p_stream,o.source_revision);
 perform operations_economy_private.assert_issued_frozen_rates_v1(cost_snapshot,raw_time_snapshot)
  from public.operations_personnel_cost_publications where organization_id=org and source_time_stream_id=p_stream and source_revision=o.source_revision;
 if result->>'status'='duplicate' then
  select * into m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  if not found or m.issuer_id<>p_issuer or m.enrollment_epoch<>p_epoch or m.command_sha256<>digest
   then raise exception 'shadow_review_publication_not_issued' using errcode='42501';end if;
 else
  issued:=clock_timestamp();
  envelope:=jsonb_build_object('schema','operations-personnel-accepted-envelope.v1','issuer_id',p_issuer,'enrollment_epoch',p_epoch,
   'source_organization_id',org,'destination_organization_id',i.destination_organization_id,'source_stream_id',p_stream,'source_revision',o.source_revision,
   'outbox_id',o.id,'occurred_at',issued,'membership','full_stream','source_snapshot_sha256',o.body_sha256,'snapshot',o.raw_body::jsonb)::text;
  if octet_length(envelope)>524288 then raise exception 'accepted_review_envelope_too_large' using errcode='22023';end if;
  insert into operations_economy_private.personnel_accepted_issuances_v1 values(o.id,p_issuer,p_epoch,digest,issued,envelope,encode(sha256(convert_to(envelope,'UTF8')),'hex')) returning * into m;
 end if;
 return jsonb_build_object('schema','operations-personnel-issued-receipt.v1','status',result->>'status','outbox_id',o.id,
  'source_revision',o.source_revision,'fingerprint',m.fingerprint,'occurred_at',m.occurred_at);
end;$$;
revoke all on function operations_economy_private.issue_personnel_project_review_v1(uuid,uuid,text,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
