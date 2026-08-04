CREATE TABLE IF NOT EXISTS public.booking_source_state (
  organization_id uuid NOT NULL,
  booking_id text NOT NULL,
  revision_kind text,
  applied_source_updated_at timestamptz,
  applied_source_version bigint,
  applied_source_status text,
  pending_source_updated_at timestamptz,
  pending_source_version bigint,
  pending_source_status text,
  pending_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_source_state_pkey PRIMARY KEY (organization_id, booking_id)
);

GRANT ALL ON public.booking_source_state TO service_role;

ALTER TABLE public.booking_source_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_source_state'
      AND policyname = 'service_role_only_booking_source_state'
  ) THEN
    CREATE POLICY "service_role_only_booking_source_state"
      ON public.booking_source_state
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.advance_booking_source_revision(
  p_organization_id uuid,
  p_booking_id text,
  p_source_updated_at timestamptz,
  p_source_version bigint,
  p_source_status text,
  p_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.booking_source_state%ROWTYPE;
  v_status text := upper(nullif(btrim(coalesce(p_source_status, '')), ''));
  v_incoming_kind text;
  v_applied_kind text;
  v_pending_kind text;
  v_has_older boolean := false;
  v_has_newer boolean := false;
  v_all_equal boolean := true;
BEGIN
  IF p_organization_id IS NULL OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN jsonb_build_object('decision', 'invalid_input', 'error', 'missing_identifiers');
  END IF;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('decision', 'invalid_input', 'error', 'missing_canonical_source_status_for_revision');
  END IF;
  IF p_source_updated_at IS NULL AND p_source_version IS NULL THEN
    RETURN jsonb_build_object('decision', 'invalid_input', 'error', 'missing_source_revision');
  END IF;

  v_incoming_kind := CASE
    WHEN p_source_updated_at IS NOT NULL AND p_source_version IS NOT NULL THEN 'both'
    WHEN p_source_updated_at IS NOT NULL THEN 'timestamp'
    ELSE 'version' END;

  INSERT INTO public.booking_source_state (organization_id, booking_id)
  VALUES (p_organization_id, p_booking_id)
  ON CONFLICT (organization_id, booking_id) DO NOTHING;

  SELECT * INTO v_row FROM public.booking_source_state
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id
  FOR UPDATE;

  v_applied_kind := CASE
    WHEN v_row.applied_source_updated_at IS NOT NULL AND v_row.applied_source_version IS NOT NULL THEN 'both'
    WHEN v_row.applied_source_updated_at IS NOT NULL THEN 'timestamp'
    WHEN v_row.applied_source_version IS NOT NULL THEN 'version'
    ELSE NULL END;

  v_pending_kind := CASE
    WHEN v_row.pending_source_updated_at IS NOT NULL AND v_row.pending_source_version IS NOT NULL THEN 'both'
    WHEN v_row.pending_source_updated_at IS NOT NULL THEN 'timestamp'
    WHEN v_row.pending_source_version IS NOT NULL THEN 'version'
    ELSE NULL END;

  IF p_mode = 'release' THEN
    UPDATE public.booking_source_state
      SET pending_source_updated_at = NULL,
          pending_source_version = NULL,
          pending_source_status = NULL,
          pending_started_at = NULL,
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id
      AND (pending_source_updated_at IS NOT DISTINCT FROM p_source_updated_at)
      AND (pending_source_version IS NOT DISTINCT FROM p_source_version);
    RETURN jsonb_build_object('decision', 'released');
  END IF;

  IF p_mode = 'commit' THEN
    IF v_pending_kind IS NOT NULL
       AND v_row.pending_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
       AND v_row.pending_source_version IS NOT DISTINCT FROM p_source_version THEN
      UPDATE public.booking_source_state
        SET applied_source_updated_at = p_source_updated_at,
            applied_source_version = p_source_version,
            applied_source_status = v_status,
            revision_kind = v_incoming_kind,
            pending_source_updated_at = NULL,
            pending_source_version = NULL,
            pending_source_status = NULL,
            pending_started_at = NULL,
            updated_at = now()
      WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
      RETURN jsonb_build_object('decision', 'applied');
    END IF;
    IF v_applied_kind IS NOT NULL
       AND v_row.applied_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
       AND v_row.applied_source_version IS NOT DISTINCT FROM p_source_version
       AND v_row.applied_source_status = v_status THEN
      RETURN jsonb_build_object('decision', 'already_current');
    END IF;
    RETURN jsonb_build_object('decision', 'commit_without_reservation');
  END IF;

  -- p_mode = 'reserve'
  IF v_applied_kind IS NOT NULL THEN
    IF (v_row.applied_source_updated_at IS NOT NULL AND p_source_updated_at IS NULL)
       OR (v_row.applied_source_version IS NOT NULL AND p_source_version IS NULL) THEN
      RETURN jsonb_build_object('decision', 'incomparable_source_revision');
    END IF;

    IF v_row.applied_source_updated_at IS NOT NULL THEN
      IF p_source_updated_at < v_row.applied_source_updated_at THEN v_has_older := true; v_all_equal := false; END IF;
      IF p_source_updated_at > v_row.applied_source_updated_at THEN v_has_newer := true; v_all_equal := false; END IF;
    END IF;
    IF v_row.applied_source_version IS NOT NULL THEN
      IF p_source_version < v_row.applied_source_version THEN v_has_older := true; v_all_equal := false; END IF;
      IF p_source_version > v_row.applied_source_version THEN v_has_newer := true; v_all_equal := false; END IF;
    END IF;

    IF v_has_older THEN
      RETURN jsonb_build_object('decision', 'stale_source_revision');
    END IF;
    IF v_all_equal THEN
      IF v_row.applied_source_status IS DISTINCT FROM v_status THEN
        RETURN jsonb_build_object('decision', 'conflicting_source_status_for_revision');
      END IF;
      RETURN jsonb_build_object('decision', 'already_current');
    END IF;
  END IF;

  IF v_pending_kind IS NOT NULL THEN
    IF (v_row.pending_source_updated_at IS NOT NULL AND p_source_updated_at IS NULL)
       OR (v_row.pending_source_version IS NOT NULL AND p_source_version IS NULL) THEN
      RETURN jsonb_build_object('decision', 'incomparable_source_revision');
    END IF;
    IF (v_row.pending_source_updated_at IS NOT NULL AND p_source_updated_at < v_row.pending_source_updated_at)
       OR (v_row.pending_source_version IS NOT NULL AND p_source_version < v_row.pending_source_version) THEN
      RETURN jsonb_build_object('decision', 'stale_source_revision');
    END IF;
    IF v_row.pending_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
       AND v_row.pending_source_version IS NOT DISTINCT FROM p_source_version
       AND v_row.pending_source_status IS DISTINCT FROM v_status THEN
      RETURN jsonb_build_object('decision', 'conflicting_source_status_for_revision');
    END IF;
  END IF;

  UPDATE public.booking_source_state
    SET pending_source_updated_at = p_source_updated_at,
        pending_source_version = p_source_version,
        pending_source_status = v_status,
        pending_started_at = now(),
        updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;

  RETURN jsonb_build_object('decision', 'reserved');
END;
$fn$;

REVOKE ALL ON FUNCTION public.advance_booking_source_revision(uuid, text, timestamptz, bigint, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_booking_source_revision(uuid, text, timestamptz, bigint, text, text) TO service_role;

INSERT INTO public.booking_source_state (
  organization_id, booking_id, revision_kind,
  applied_source_updated_at, applied_source_version, applied_source_status
)
SELECT
  b.organization_id,
  b.id,
  CASE
    WHEN (b.last_applied_source_revision->>'source_updated_at') IS NOT NULL
     AND (b.last_applied_source_revision->>'source_version') IS NOT NULL THEN 'both'
    WHEN (b.last_applied_source_revision->>'source_updated_at') IS NOT NULL THEN 'timestamp'
    ELSE 'version' END,
  NULLIF(b.last_applied_source_revision->>'source_updated_at','')::timestamptz,
  NULLIF(b.last_applied_source_revision->>'source_version','')::bigint,
  upper(b.last_applied_source_revision->>'source_status')
FROM public.bookings b
WHERE b.last_applied_source_revision IS NOT NULL
  AND b.organization_id IS NOT NULL
  AND NULLIF(b.last_applied_source_revision->>'source_status','') IS NOT NULL
  AND (
    NULLIF(b.last_applied_source_revision->>'source_updated_at','') IS NOT NULL
    OR NULLIF(b.last_applied_source_revision->>'source_version','') IS NOT NULL
  )
ON CONFLICT (organization_id, booking_id) DO NOTHING;