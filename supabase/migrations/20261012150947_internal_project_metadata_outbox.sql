-- Prospective source metadata only. No backfill, Finance enrollment or dispatcher.
-- This is NOT cost evidence and must never enable financial close or trusted totals.
CREATE TABLE public.operations_project_metadata_outbox (
  source_project_id uuid NOT NULL,
  source_organization_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  schema_version text NOT NULL CHECK (schema_version = 'operations-project-metadata.v1'),
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (source_project_id, revision)
);
ALTER TABLE public.operations_project_metadata_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_project_metadata_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.operations_project_metadata_outbox TO service_role;
CREATE POLICY operations_project_metadata_service_read ON public.operations_project_metadata_outbox
  FOR SELECT TO service_role USING (true);

CREATE FUNCTION public.reject_project_metadata_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Project metadata receipts are append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.reject_project_metadata_receipt_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER operations_project_metadata_immutable BEFORE UPDATE OR DELETE
  ON public.operations_project_metadata_outbox FOR EACH ROW EXECUTE FUNCTION public.reject_project_metadata_receipt_mutation();
CREATE TRIGGER operations_project_metadata_no_truncate BEFORE TRUNCATE
  ON public.operations_project_metadata_outbox FOR EACH STATEMENT EXECUTE FUNCTION public.reject_project_metadata_receipt_mutation();

CREATE FUNCTION public.capture_internal_project_metadata() RETURNS trigger
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
REVOKE ALL ON FUNCTION public.capture_internal_project_metadata() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER capture_internal_project_metadata AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.capture_internal_project_metadata();

-- Prevent deletion without a tombstone; normal scoped DELETE remains unchanged.
CREATE FUNCTION public.guard_internal_project_metadata_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operations_project_metadata_outbox)
    OR EXISTS (SELECT 1 FROM public.projects WHERE COALESCE(project_kind, CASE WHEN is_internal THEN 'internal_activity' ELSE 'customer' END) <> 'customer') THEN
    RAISE EXCEPTION 'Internal project metadata requires individual deletion receipts';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_internal_project_metadata_truncate() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_internal_project_metadata_truncate BEFORE TRUNCATE ON public.projects
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_internal_project_metadata_truncate();
