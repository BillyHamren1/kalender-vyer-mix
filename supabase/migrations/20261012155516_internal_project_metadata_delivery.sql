-- Dormant, service-only delivery state. No source trigger, scheduler, HTTP or backfill.
-- Owner-managed enrollment is a release prerequisite, never inferred from legacy data.
CREATE TABLE public.operations_project_metadata_destinations (
  source_project_id uuid PRIMARY KEY,
  source_organization_id uuid NOT NULL,
  first_revision bigint NOT NULL CHECK(first_revision BETWEEN 1 AND 9007199254740991),
  enabled boolean NOT NULL DEFAULT false,
  FOREIGN KEY(source_project_id,first_revision) REFERENCES public.operations_project_metadata_outbox(source_project_id,revision)
);
CREATE FUNCTION public.guard_operations_metadata_destination() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND (NEW.source_project_id,NEW.source_organization_id,NEW.first_revision) IS DISTINCT FROM (OLD.source_project_id,OLD.source_organization_id,OLD.first_revision)) THEN
    RAISE EXCEPTION 'Metadata enrollment identity and floor are immutable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operations_project_metadata_outbox r
    WHERE r.source_project_id=NEW.source_project_id AND r.source_organization_id=NEW.source_organization_id AND r.revision=NEW.first_revision
      AND r.operation='upsert' AND r.metadata->>'declared_project_kind' IN ('internal_project','internal_activity') AND r.metadata->>'booking_id' IS NULL) THEN
    RAISE EXCEPTION 'Metadata enrollment requires exact explicit source receipt';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_operations_metadata_destination() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_operations_metadata_destination BEFORE INSERT OR UPDATE OR DELETE ON public.operations_project_metadata_destinations FOR EACH ROW EXECUTE FUNCTION public.guard_operations_metadata_destination();
CREATE TRIGGER guard_operations_metadata_destination_truncate BEFORE TRUNCATE ON public.operations_project_metadata_destinations FOR EACH STATEMENT EXECUTE FUNCTION public.guard_operations_metadata_destination();
ALTER TABLE public.operations_project_metadata_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_project_metadata_destinations FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.operations_project_metadata_delivery (
  source_project_id uuid NOT NULL,
  revision bigint NOT NULL,
  destination text NOT NULL DEFAULT 'finance-project-metadata-v1' CHECK (destination = 'finance-project-metadata-v1'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_failure text CHECK (last_failure IN ('transport_failure', 'invalid_ack', 'remote_rejected')),
  PRIMARY KEY (source_project_id, revision, destination),
  FOREIGN KEY (source_project_id, revision) REFERENCES public.operations_project_metadata_outbox(source_project_id, revision)
);
CREATE UNIQUE INDEX metadata_delivery_lease ON public.operations_project_metadata_delivery(lease_token) WHERE lease_token IS NOT NULL;
CREATE INDEX metadata_delivery_pending ON public.operations_project_metadata_delivery(next_attempt_at) WHERE delivered_at IS NULL;
ALTER TABLE public.operations_project_metadata_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_project_metadata_delivery FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.operations_project_metadata_delivery TO service_role;
CREATE POLICY metadata_delivery_service_read ON public.operations_project_metadata_delivery FOR SELECT TO service_role USING (true);

CREATE FUNCTION public.claim_operations_project_metadata_delivery() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.operations_project_metadata_delivery%ROWTYPE; r public.operations_project_metadata_outbox%ROWTYPE;
BEGIN
  -- Populate transport state only when a configured worker explicitly polls.
  INSERT INTO public.operations_project_metadata_delivery(source_project_id, revision)
    SELECT src.source_project_id, src.revision FROM public.operations_project_metadata_outbox src
      JOIN public.operations_project_metadata_destinations e ON e.source_project_id=src.source_project_id
        AND e.source_organization_id=src.source_organization_id AND e.enabled AND src.revision>=e.first_revision
    -- Do not attempt a conflicting INSERT for committed queue rows: another
    -- worker may be renewing that row's lease. Such an INSERT waits on its
    -- UPDATE before execution can reach the nonblocking SKIP LOCKED claim.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.operations_project_metadata_delivery existing
      WHERE existing.source_project_id=src.source_project_id
        AND existing.revision=src.revision
        AND existing.destination='finance-project-metadata-v1'
    )
    -- Retain uniqueness protection when two workers discover a new receipt.
    ON CONFLICT DO NOTHING;
  SELECT q.* INTO d FROM public.operations_project_metadata_delivery q
    WHERE EXISTS (SELECT 1 FROM public.operations_project_metadata_destinations e
        JOIN public.operations_project_metadata_outbox src ON src.source_project_id=q.source_project_id AND src.revision=q.revision
        WHERE e.source_project_id=q.source_project_id AND e.source_organization_id=src.source_organization_id AND e.enabled AND q.revision>=e.first_revision)
      AND q.delivered_at IS NULL AND q.last_failure IS DISTINCT FROM 'remote_rejected' AND q.next_attempt_at <= clock_timestamp()
      AND (q.lease_until IS NULL OR q.lease_until <= clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.operations_project_metadata_delivery older
        WHERE older.source_project_id=q.source_project_id AND older.destination=q.destination
          AND older.revision<q.revision AND older.delivered_at IS NULL)
    ORDER BY q.next_attempt_at, q.source_project_id, q.revision FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.operations_project_metadata_delivery SET lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1
    WHERE source_project_id=d.source_project_id AND revision=d.revision AND destination=d.destination RETURNING * INTO d;
  SELECT * INTO STRICT r FROM public.operations_project_metadata_outbox WHERE source_project_id=d.source_project_id AND revision=d.revision;
  RETURN jsonb_build_object('lease_token',d.lease_token,'destination',d.destination,'body',jsonb_build_object(
    'schema',r.schema_version,'source_project_id',r.source_project_id,'source_organization_id',r.source_organization_id,
    'revision',r.revision,'operation',r.operation,'metadata',r.metadata,'fingerprint',r.fingerprint,'captured_at',r.captured_at)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_operations_project_metadata_delivery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_operations_project_metadata_delivery() TO service_role;

CREATE FUNCTION public.finish_operations_project_metadata_delivery(p_lease_token uuid, p_ack jsonb, p_failure text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.operations_project_metadata_delivery%ROWTYPE; r public.operations_project_metadata_outbox%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.operations_project_metadata_delivery WHERE lease_token=p_lease_token
    AND delivered_at IS NULL AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_failure IS NOT NULL THEN
    IF p_failure NOT IN ('transport_failure','invalid_ack','remote_rejected') OR p_ack IS NOT NULL THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
    UPDATE public.operations_project_metadata_delivery SET lease_token=NULL,lease_until=NULL,last_failure=p_failure,
      next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600, 5*power(2,least(d.attempts,9)))::integer)
      WHERE source_project_id=d.source_project_id AND revision=d.revision AND destination=d.destination;
    RETURN true;
  END IF;
  SELECT * INTO STRICT r FROM public.operations_project_metadata_outbox WHERE source_project_id=d.source_project_id AND revision=d.revision;
  IF p_ack IS NULL OR p_ack->>'schema' IS DISTINCT FROM 'finance-operations-project-metadata-ack.v1'
    OR p_ack->>'destination' IS DISTINCT FROM d.destination
    OR p_ack->>'source_project_id' IS DISTINCT FROM r.source_project_id::text
    OR p_ack->>'source_organization_id' IS DISTINCT FROM r.source_organization_id::text
    OR p_ack->'revision' IS DISTINCT FROM to_jsonb(r.revision)
    OR p_ack->>'fingerprint' IS DISTINCT FROM r.fingerprint THEN RAISE EXCEPTION 'Mismatched delivery acknowledgement'; END IF;
  UPDATE public.operations_project_metadata_delivery SET delivered_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_failure=NULL
    WHERE source_project_id=d.source_project_id AND revision=d.revision AND destination=d.destination;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_operations_project_metadata_delivery(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_operations_project_metadata_delivery(uuid,jsonb,text) TO service_role;
