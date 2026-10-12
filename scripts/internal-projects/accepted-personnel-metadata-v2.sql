-- DRAFT: apply after accepted issuer and existing project metadata producer/delivery.
-- Prospective opt-in on NEW issuer/epoch only; no rows or caller grants.
ALTER TABLE operations_economy_private.personnel_issuers_v1 ADD COLUMN metadata_required boolean NOT NULL DEFAULT false;
CREATE FUNCTION operations_economy_private.guard_personnel_metadata_mode_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF NEW.metadata_required IS DISTINCT FROM OLD.metadata_required THEN RAISE EXCEPTION 'issuer_metadata_mode_immutable';END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION operations_economy_private.guard_personnel_metadata_mode_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER personnel_metadata_mode_immutable BEFORE UPDATE ON operations_economy_private.personnel_issuers_v1 FOR EACH ROW EXECUTE FUNCTION operations_economy_private.guard_personnel_metadata_mode_v1();
CREATE FUNCTION operations_economy_private.capture_personnel_metadata_refs_v2(p_org uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;p public.projects%ROWTYPE;r public.operations_project_metadata_outbox%ROWTYPE;e public.operations_project_metadata_destinations%ROWTYPE;refs jsonb:='[]';
BEGIN
 -- Acquire every live project lock in a stable order BEFORE canonical stream lock.
 FOR v_id IN SELECT DISTINCT (l->>'source_project_id')::uuid FROM jsonb_array_elements(p_snapshot->'lines') l ORDER BY 1 LOOP
  SELECT * INTO p FROM public.projects WHERE projects.id=v_id FOR SHARE;
  IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.organization_id IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'causal_metadata_project_missing';END IF;
 END LOOP;
 FOR v_id IN SELECT DISTINCT (l->>'source_project_id')::uuid FROM jsonb_array_elements(p_snapshot->'lines') l ORDER BY 1 LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,173));
  SELECT * INTO p FROM public.projects WHERE projects.id=v_id;
  SELECT * INTO r FROM public.operations_project_metadata_outbox WHERE source_project_id=v_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO e FROM public.operations_project_metadata_destinations WHERE source_project_id=v_id FOR SHARE;
  IF r.revision IS NULL OR e.first_revision IS NULL OR NOT e.enabled OR r.revision<e.first_revision OR r.operation<>'upsert' OR r.source_organization_id IS DISTINCT FROM p_org
   OR r.metadata->>'project_kind' IS DISTINCT FROM p.project_kind OR r.metadata->>'declared_project_kind' IS DISTINCT FROM p.project_kind
   OR r.metadata->'legacy_is_internal' IS DISTINCT FROM to_jsonb(p.is_internal) OR r.metadata->'booking_id' IS DISTINCT FROM coalesce(to_jsonb(p.booking_id),'null'::jsonb)
   THEN RAISE EXCEPTION 'causal_metadata_identity_unavailable';END IF;
  IF (p.project_kind='customer' AND (e.metadata_purpose<>'customer_cost_identity' OR e.source_booking_id IS DISTINCT FROM p.booking_id OR r.metadata->'budget_cost_minor'<>'null'::jsonb OR r.metadata->'budget_currency'<>'null'::jsonb))
    OR (p.project_kind IN ('internal_project','internal_activity') AND e.metadata_purpose<>'internal_metadata')
    OR p.project_kind IS NULL OR p.project_kind NOT IN ('customer','internal_project','internal_activity') THEN RAISE EXCEPTION 'causal_metadata_purpose_mismatch';END IF;
  refs:=refs||jsonb_build_array(jsonb_build_object('source_project_id',v_id,'revision',r.revision,'fingerprint',r.fingerprint));
 END LOOP;
 RETURN refs;
END $$;
REVOKE ALL ON FUNCTION operations_economy_private.capture_personnel_metadata_refs_v2(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

create or replace function operations_economy_private.issue_personnel_v1(p_body text,p_timestamp bigint,p_nonce uuid,p_signature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;i operations_economy_private.personnel_issuers_v1%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;o public.operations_personnel_cost_outbox%rowtype;
 m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 refs jsonb;result jsonb;digest text;expected bigint;stream text;org uuid;worker uuid;prior text;issued timestamptz;envelope text;
begin
 if p_body is null or octet_length(p_body)>2097152 or p_timestamp is null or p_nonce is null
  or p_signature is null or p_signature!~'^[0-9a-f]{64}$'
  or abs(extract(epoch from clock_timestamp())-p_timestamp)>60 then raise exception 'invalid_issuer_attempt' using errcode='22023';end if;
 c:=p_body::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>11
  or not(c ?& array['schema','issuer_id','enrollment_epoch','organization_id','destination_organization_id','source_stream_id','expected_revision','idempotency_key','snapshot','raw_time_snapshot','source_evidence'])
  or c->>'schema' is distinct from 'operations-personnel-issuer-command.v1'
  or jsonb_typeof(c->'expected_revision') is distinct from 'number'
  or (c->>'expected_revision')::numeric not between 0 and 9007199254740990
  or mod((c->>'expected_revision')::numeric,1)<>0 then raise exception 'invalid_issuer_command' using errcode='22023';end if;
 select * into i from operations_economy_private.personnel_issuers_v1
  where issuer_id=(c->>'issuer_id')::uuid and enrollment_epoch=(c->>'enrollment_epoch')::uuid for share;
 if not found or not i.enabled or i.organization_id::text is distinct from c->>'organization_id'
  or i.destination_organization_id::text is distinct from c->>'destination_organization_id' then raise exception 'issuer_not_enrolled' using errcode='42501';end if;
 if encode(extensions.hmac(convert_to(concat_ws(E'\n','operations-personnel-source-attestation.v1',p_timestamp::text,p_nonce::text,p_body),'UTF8'),i.secret,'sha256'),'hex')<>p_signature
  then raise exception 'invalid_issuer_signature' using errcode='42501';end if;
 org:=i.organization_id;stream:=c->>'source_stream_id';expected:=(c->>'expected_revision')::bigint;worker:=(c#>>'{snapshot,worker_id}')::uuid;
 if c#>>'{snapshot,organization_id}' is distinct from org::text or c#>>'{snapshot,source_time_stream_id}' is distinct from stream
  or (c#>>'{snapshot,source_revision}')::bigint is distinct from expected+1 then raise exception 'issuer_source_mismatch' using errcode='22023';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=i.issuer_id and enrollment_epoch=i.enrollment_epoch and source_stream_id=stream for share;
 if not found or expected<f.revision_floor then raise exception 'issuer_stream_below_floor_or_absent' using errcode='42501';end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=org and worker_id=worker for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from f.source_binding then raise exception 'issuer_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'issuer_destination_changed' using errcode='42501';end if;
 if not i.metadata_required and exists(select 1 from jsonb_array_elements(c#>'{snapshot,lines}') l left join public.projects p on p.id=(l->>'source_project_id')::uuid where p.id is null or p.deleted_at is not null or p.project_kind is null or p.project_kind not in ('internal_project','internal_activity') or p.booking_id is not null or l->'source_booking_id' is distinct from 'null'::jsonb) then raise exception 'customer_requires_causal_metadata' using errcode='42501';end if;
 if i.metadata_required then refs:=operations_economy_private.capture_personnel_metadata_refs_v2(org,c->'snapshot');end if;
 -- Lock the same existing head used by canonical ingress before deciding whether
 -- saved economics can be reused. A new signed review does not promote shadow money.
 perform 1 from public.operations_personnel_cost_streams where organization_id=org and source_time_stream_id=stream for update;
 if exists(select 1 from public.operations_personnel_cost_publications p where p.organization_id=org and p.source_time_stream_id=stream
   and p.source_revision=expected and p.time_snapshot_version=(c#>>'{snapshot,time_snapshot_version}')::bigint)
  and not operations_economy_private.personnel_issued_ancestor_v1(org,stream,expected,i.issuer_id,i.enrollment_epoch)
  then raise exception 'unissued_same_version_ancestor' using errcode='42501';end if;
 digest:=encode(sha256(convert_to(p_body,'UTF8')),'hex');
 insert into operations_economy_private.personnel_issuer_nonces_v1 values(i.issuer_id,i.enrollment_epoch,p_nonce,digest) on conflict do nothing;
 select command_sha256 into prior from operations_economy_private.personnel_issuer_nonces_v1 where issuer_id=i.issuer_id and enrollment_epoch=i.enrollment_epoch and nonce=p_nonce;
 if prior<>digest then raise exception 'issuer_nonce_conflict' using errcode='23505';end if;
 -- The canonical ingress owns the stream lock, source validation, accepted rate
 -- and project proof checks. Only its fresh accepted result can mint a marker.
 result:=public.publish_operations_personnel_cost_ingress_v1(c->'snapshot',c->'raw_time_snapshot',c->'source_evidence',expected,c->>'idempotency_key');
 if result->>'status' not in ('accepted','duplicate') then raise exception 'issuer_publication_not_accepted' using errcode='40001';end if;
 select * into strict o from public.operations_personnel_cost_outbox where id=(result->>'outbox_id')::uuid;
 if o.organization_id<>org or o.source_time_stream_id<>stream or o.source_revision<>expected+1
  or o.destination_organization_id<>i.destination_organization_id then raise exception 'issuer_outbox_mismatch' using errcode='22023';end if;
 perform operations_economy_private.assert_issued_frozen_rates_v1(o.raw_body::jsonb,c->'raw_time_snapshot');
 perform operations_economy_private.assert_issued_publication_reviews_v1(org,stream,o.source_revision);
 if result->>'status'='duplicate' then
  select * into m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  if not found or m.issuer_id<>i.issuer_id or m.enrollment_epoch<>i.enrollment_epoch or m.command_sha256<>digest
   then raise exception 'legacy_shadow_publication_not_issued' using errcode='42501';end if;
 else
  issued:=clock_timestamp();
  envelope:=jsonb_build_object('schema','operations-personnel-accepted-envelope.v1','issuer_id',i.issuer_id,'enrollment_epoch',i.enrollment_epoch,
   'source_organization_id',org,'destination_organization_id',i.destination_organization_id,'source_stream_id',stream,'source_revision',o.source_revision,
   'outbox_id',o.id,'occurred_at',issued,'membership','full_stream','source_snapshot_sha256',o.body_sha256,'snapshot',o.raw_body::jsonb)::text;
  if i.metadata_required then envelope:=(envelope::jsonb||jsonb_build_object('schema','operations-personnel-accepted-envelope.v2','project_metadata_refs',refs))::text;end if;
  if octet_length(envelope)>524288 then raise exception 'accepted_envelope_too_large' using errcode='22023';end if;
  insert into operations_economy_private.personnel_accepted_issuances_v1 values(o.id,i.issuer_id,i.enrollment_epoch,digest,issued,envelope,encode(sha256(convert_to(envelope,'UTF8')),'hex')) returning * into m;
 end if;
 return jsonb_build_object('schema','operations-personnel-issued-receipt.v1','status',result->>'status','outbox_id',o.id,'source_revision',o.source_revision,'fingerprint',m.fingerprint,'occurred_at',m.occurred_at);
end;$$;
revoke all on function operations_economy_private.issue_personnel_v1(text,bigint,uuid,text) from public,anon,authenticated,service_role;
-- No exposed wrapper or caller grant: dormant until the complete source/receiver
-- and outbox mode-isolation closure is reviewed. Tests invoke as database owner.
