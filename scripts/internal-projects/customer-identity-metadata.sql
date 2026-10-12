-- DRAFT ONLY: no enrollment, activation, key or caller grant.
-- Operations attests its own project/Booking relationship, not Booking-origin signature.
ALTER TABLE public.operations_project_metadata_destinations
 ADD COLUMN metadata_purpose text NOT NULL DEFAULT 'internal_metadata' CHECK(metadata_purpose IN ('internal_metadata','customer_cost_identity')),
 ADD COLUMN source_booking_id text,
 ADD CONSTRAINT metadata_purpose_booking CHECK ((metadata_purpose='internal_metadata' AND source_booking_id IS NULL) OR (metadata_purpose='customer_cost_identity' AND source_booking_id IS NOT NULL AND octet_length(source_booking_id) BETWEEN 1 AND 256));
CREATE OR REPLACE FUNCTION public.guard_operations_metadata_destination() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND
 (NEW.source_project_id,NEW.source_organization_id,NEW.first_revision,NEW.metadata_purpose,NEW.source_booking_id) IS DISTINCT FROM
 (OLD.source_project_id,OLD.source_organization_id,OLD.first_revision,OLD.metadata_purpose,OLD.source_booking_id)) THEN RAISE EXCEPTION 'Metadata enrollment identity and floor are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operations_project_metadata_outbox r WHERE r.source_project_id=NEW.source_project_id AND r.source_organization_id=NEW.source_organization_id AND r.revision=NEW.first_revision AND r.operation='upsert' AND
 ((NEW.metadata_purpose='internal_metadata' AND r.metadata->>'declared_project_kind' IN ('internal_project','internal_activity') AND r.metadata->>'booking_id' IS NULL) OR
 (NEW.metadata_purpose='customer_cost_identity' AND r.metadata=jsonb_build_object('project_kind','customer','declared_project_kind','customer','legacy_is_internal',false,'booking_id',NEW.source_booking_id,'budget_cost_minor',NULL,'budget_currency',NULL)))) THEN RAISE EXCEPTION 'Metadata enrollment requires exact explicit source receipt'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.append_customer_identity_metadata_v1(p_project uuid,p_org uuid,p_operation text,p_metadata jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.operations_project_metadata_outbox%ROWTYPE;n bigint;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project::text,173));
 SELECT * INTO r FROM public.operations_project_metadata_outbox WHERE source_project_id=p_project ORDER BY revision DESC LIMIT 1;
 IF r.revision IS NOT NULL THEN
  IF r.source_organization_id IS DISTINCT FROM p_org OR r.metadata IS DISTINCT FROM p_metadata THEN RAISE EXCEPTION 'customer_identity_lineage_conflict';END IF;
  IF r.operation='delete' THEN RETURN r.revision; END IF;
  IF p_operation='upsert' THEN RETURN r.revision; END IF;
 END IF;
 IF p_operation NOT IN ('upsert','delete') THEN RAISE EXCEPTION 'invalid_customer_identity_operation';END IF;
 n:=coalesce(r.revision,0)+1;
 INSERT INTO public.operations_project_metadata_outbox(source_project_id,source_organization_id,revision,schema_version,operation,metadata,fingerprint)
 VALUES(p_project,p_org,n,'operations-project-metadata.v1',p_operation,p_metadata,encode(sha256(convert_to(jsonb_build_object('schema','operations-project-metadata.v1','source_project_id',p_project,'source_organization_id',p_org,'revision',n,'operation',p_operation,'metadata',p_metadata)::text,'UTF8')),'hex'));
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.append_customer_identity_metadata_v1(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.enroll_customer_identity_metadata_v1(p_project uuid,p_expected_booking text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects%ROWTYPE;b public.bookings%ROWTYPE;e public.operations_project_metadata_destinations%ROWTYPE;m jsonb;n bigint;
BEGIN
 -- Lock Booking before project. Revalidate after both locks; no invented booking.
 SELECT * INTO b FROM public.bookings WHERE id=p_expected_booking FOR SHARE;
 IF NOT FOUND OR b.is_internal IS DISTINCT FROM false OR octet_length(b.id) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'customer_booking_required';END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.project_kind IS DISTINCT FROM 'customer' OR p.is_internal IS DISTINCT FROM false OR p.organization_id IS NULL OR p.organization_id IS DISTINCT FROM b.organization_id OR p.booking_id IS DISTINCT FROM b.id THEN RAISE EXCEPTION 'explicit_customer_direct_booking_required';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.id::text,173));
 SELECT * INTO e FROM public.operations_project_metadata_destinations WHERE source_project_id=p.id;
 IF FOUND THEN
  IF e.metadata_purpose<>'customer_cost_identity' OR e.source_booking_id IS DISTINCT FROM b.id OR e.source_organization_id IS DISTINCT FROM p.organization_id OR EXISTS(SELECT 1 FROM public.operations_project_metadata_outbox WHERE source_project_id=p.id AND operation='delete') THEN RAISE EXCEPTION 'customer_identity_enrollment_conflict';END IF;
  RETURN e.first_revision;
 END IF;
 IF EXISTS(SELECT 1 FROM public.operations_project_metadata_outbox WHERE source_project_id=p.id) THEN RAISE EXCEPTION 'customer_identity_existing_lineage';END IF;
 m:=jsonb_build_object('project_kind','customer','declared_project_kind','customer','legacy_is_internal',false,'booking_id',b.id,'budget_cost_minor',NULL,'budget_currency',NULL);
 n:=public.append_customer_identity_metadata_v1(p.id,p.organization_id,'upsert',m);
 INSERT INTO public.operations_project_metadata_destinations(source_project_id,source_organization_id,first_revision,enabled,metadata_purpose,source_booking_id) VALUES(p.id,p.organization_id,n,false,'customer_cost_identity',b.id);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enroll_customer_identity_metadata_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tombstone_customer_identity_metadata_v1(p_project uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.operations_project_metadata_outbox%ROWTYPE;
BEGIN
 SELECT r0.* INTO r FROM public.operations_project_metadata_outbox r0 JOIN public.operations_project_metadata_destinations e USING(source_project_id)
 WHERE r0.source_project_id=p_project AND e.metadata_purpose='customer_cost_identity' ORDER BY r0.revision DESC LIMIT 1;
 IF FOUND THEN PERFORM public.append_customer_identity_metadata_v1(r.source_project_id,r.source_organization_id,'delete',r.metadata);END IF;
END $$;
REVOKE ALL ON FUNCTION public.tombstone_customer_identity_metadata_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.customer_booking_metadata_transition_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW.organization_id,NEW.is_internal) IS NOT DISTINCT FROM (OLD.id,OLD.organization_id,OLD.is_internal) THEN RETURN NEW;END IF;
 -- Booking row already locked by mutation. Lock dependent projects in stable order.
 FOR p IN SELECT x.id FROM public.projects x JOIN public.operations_project_metadata_destinations e ON e.source_project_id=x.id
 WHERE e.metadata_purpose='customer_cost_identity' AND e.source_booking_id=OLD.id ORDER BY x.id FOR UPDATE OF x LOOP
  PERFORM public.tombstone_customer_identity_metadata_v1(p);
 END LOOP;
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.customer_booking_metadata_transition_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER customer_booking_metadata_transition AFTER UPDATE OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.customer_booking_metadata_transition_v1();
CREATE FUNCTION public.customer_booking_metadata_no_truncate_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.operations_project_metadata_destinations WHERE metadata_purpose='customer_cost_identity') THEN RAISE EXCEPTION 'customer_identity_requires_individual_booking_delete';END IF;RETURN NULL;END $$;
REVOKE ALL ON FUNCTION public.customer_booking_metadata_no_truncate_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER customer_booking_metadata_no_truncate BEFORE TRUNCATE ON public.bookings FOR EACH STATEMENT EXECUTE FUNCTION public.customer_booking_metadata_no_truncate_v1();

CREATE OR REPLACE FUNCTION public.capture_internal_project_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  source_row public.projects%ROWTYPE;
  prior public.operations_project_metadata_outbox%ROWTYPE;
  next_revision bigint;
  kind text;
  event_operation text;
  body jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN source_row := OLD; event_operation := 'delete';
  ELSE source_row := NEW; event_operation := 'upsert'; END IF;
  kind := COALESCE(source_row.project_kind, CASE WHEN source_row.is_internal THEN 'internal_activity' ELSE 'customer' END);
  -- Enrolled customer proof is terminal and identity-only. No customer budget/status write.
  IF EXISTS(SELECT 1 FROM public.operations_project_metadata_destinations e WHERE e.metadata_purpose='customer_cost_identity' AND e.source_project_id=CASE WHEN TG_OP='INSERT' THEN NEW.id ELSE OLD.id END) THEN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.id,NEW.organization_id,NEW.project_kind,NEW.is_internal,NEW.booking_id,NEW.deleted_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.project_kind,OLD.is_internal,OLD.booking_id,OLD.deleted_at)) THEN
      PERFORM public.tombstone_customer_identity_metadata_v1(OLD.id);
    END IF;
    RETURN COALESCE(NEW,OLD);
  END IF;

  -- No change to ordinary customer identity or budget behavior.
  IF kind = 'customer' AND (TG_OP <> 'UPDATE' OR COALESCE(OLD.project_kind, CASE WHEN OLD.is_internal THEN 'internal_activity' ELSE 'customer' END) = 'customer') AND NOT EXISTS (
    SELECT 1 FROM public.operations_project_metadata_outbox WHERE source_project_id = source_row.id
  ) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Internal metadata source identity is immutable';
  END IF;
  IF source_row.organization_id IS NULL THEN RAISE EXCEPTION 'Internal metadata organization required'; END IF;
  -- Same UUID lock domain as create_internal_project_atomic. Reinsert keeps lineage.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_row.id::text, 173));
  SELECT * INTO prior FROM public.operations_project_metadata_outbox
    WHERE source_project_id = source_row.id ORDER BY revision DESC LIMIT 1;
  IF prior.source_organization_id IS NOT NULL AND prior.source_organization_id <> source_row.organization_id THEN
    RAISE EXCEPTION 'Internal metadata source tenant cannot be reassigned';
  END IF;
  IF kind NOT IN ('internal_project', 'internal_activity') THEN
    RAISE EXCEPTION 'Internal metadata source classification cannot be removed';
  END IF;
  body := jsonb_build_object(
    'project_kind', kind, 'declared_project_kind', source_row.project_kind,
    'legacy_is_internal', source_row.is_internal, 'booking_id', source_row.booking_id,
    'budget_cost_minor', source_row.budget_cost_minor, 'budget_currency', source_row.budget_currency
  );
  IF prior.operation = event_operation AND prior.metadata = body THEN RETURN COALESCE(NEW, OLD); END IF;
  next_revision := COALESCE(prior.revision, 0) + 1;
  INSERT INTO public.operations_project_metadata_outbox
    (source_project_id, source_organization_id, revision, schema_version, operation, metadata, fingerprint)
  VALUES (source_row.id, source_row.organization_id, next_revision, 'operations-project-metadata.v1', event_operation, body,
    encode(sha256(convert_to(jsonb_build_object(
      'schema', 'operations-project-metadata.v1', 'source_project_id', source_row.id,
      'source_organization_id', source_row.organization_id, 'revision', next_revision,
      'operation', event_operation, 'metadata', body
    )::text, 'UTF8')), 'hex'));
  RETURN COALESCE(NEW, OLD);
END;
$$;
