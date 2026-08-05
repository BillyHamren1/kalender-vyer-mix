-- STEG 2J: atomisk canonical cancellation-cleanup i EN transaktion.
-- Ersätter edge-funktionens sekventiella tabell-för-tabell-mutationer.

-- Snabb uppslagning av tidigare cancellation-audit (idempotenskontroll).
CREATE INDEX IF NOT EXISTS idx_booking_changes_cancellation_source
  ON public.booking_changes (organization_id, booking_id, change_type);

CREATE OR REPLACE FUNCTION public.apply_booking_cancellation_atomic(
  p_organization_id uuid,
  p_booking_id text,
  p_source_status text,
  p_source_updated_at timestamptz DEFAULT NULL,
  p_source_version bigint DEFAULT NULL,
  p_reason text DEFAULT 'cancelled',
  p_reservation_token uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_state public.booking_source_state%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_status text := upper(nullif(btrim(coalesce(p_source_status, '')), ''));
  v_kind text;
  v_lock_active boolean := false;
  v_rev text;
  v_keep_hidden boolean := false;
  v_has_active_links boolean := false;
  v_has_cancelled_links boolean := false;
  v_was_manually_hidden boolean := false;
  v_audit_exists boolean := false;
  m_bookings int := 0;
  m_cal int := 0;
  m_wh int := 0;
  m_projects int := 0;
  m_jobs int := 0;
  m_packing int := 0;
  m_products int := 0;
  m_audit int := 0;
BEGIN
  -- ── UPPGIFT 4/5: grundvalidering ────────────────────────────────────
  IF p_organization_id IS NULL OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'invalid_input', 'error', 'missing_identifiers');
  END IF;
  IF v_status IS DISTINCT FROM 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'invalid_input', 'error', 'source_status_must_be_cancelled');
  END IF;
  IF p_source_updated_at IS NULL AND p_source_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'invalid_input', 'error', 'missing_source_revision');
  END IF;

  v_kind := CASE
    WHEN p_source_updated_at IS NOT NULL AND p_source_version IS NOT NULL THEN 'both'
    WHEN p_source_updated_at IS NOT NULL THEN 'timestamp'
    ELSE 'version' END;
  v_rev := coalesce(
    p_source_version::text,
    to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));

  -- Serialisera per (org, booking): all vidare logik sker under radlås.
  INSERT INTO public.booking_source_state (organization_id, booking_id)
  VALUES (p_organization_id, p_booking_id)
  ON CONFLICT (organization_id, booking_id) DO NOTHING;

  SELECT * INTO v_state FROM public.booking_source_state
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id
  FOR UPDATE;

  v_lock_active := v_state.lock_token IS NOT NULL
    AND v_state.lock_expires_at IS NOT NULL
    AND v_state.lock_expires_at > now();

  -- ── UPPGIFT 3: lease-ägarskap ───────────────────────────────────────
  IF p_reservation_token IS NOT NULL THEN
    IF v_state.lock_token IS NULL THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'reservation_lost');
    END IF;
    IF v_state.lock_token IS DISTINCT FROM p_reservation_token THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'invalid_reservation_token');
    END IF;
    IF NOT v_lock_active THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'reservation_expired');
    END IF;
    -- Tombstone-revisionen måste matcha den reserverade revisionen.
    IF v_state.pending_source_updated_at IS DISTINCT FROM p_source_updated_at
       OR v_state.pending_source_version IS DISTINCT FROM p_source_version
       OR upper(coalesce(v_state.pending_source_status, '')) IS DISTINCT FROM v_status THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'reservation_mismatch');
    END IF;
  ELSIF v_lock_active THEN
    -- Ett annat jobb äger låset just nu → vi får inte mutera.
    RETURN jsonb_build_object('success', false, 'outcome', 'reservation_lost');
  END IF;

  -- ── UPPGIFT 4: revisionskontroll i databasen ────────────────────────
  IF v_state.applied_source_updated_at IS NOT NULL OR v_state.applied_source_version IS NOT NULL THEN
    IF (v_state.applied_source_updated_at IS NOT NULL AND p_source_updated_at IS NULL)
       OR (v_state.applied_source_version IS NOT NULL AND p_source_version IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'incomparable_source_revision');
    END IF;
    IF (v_state.applied_source_updated_at IS NOT NULL AND p_source_updated_at < v_state.applied_source_updated_at)
       OR (v_state.applied_source_version IS NOT NULL AND p_source_version < v_state.applied_source_version) THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'stale_revision');
    END IF;
    IF v_state.applied_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
       AND v_state.applied_source_version IS NOT DISTINCT FROM p_source_version THEN
      IF upper(coalesce(v_state.applied_source_status, '')) = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_cancelled',
                                  'already_current', true,
                                  'booking_id', p_booking_id,
                                  'organization_id', p_organization_id,
                                  'source_revision', v_rev);
      END IF;
      -- Samma revision applicerad med aktiv status → konflikt, ingen mutation.
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'same_revision_applied_with_active_status');
    END IF;
  END IF;

  -- Watermark: aldrig applicera under högsta sedda revision.
  IF (v_state.highest_seen_source_updated_at IS NOT NULL AND p_source_updated_at IS NOT NULL
      AND p_source_updated_at < v_state.highest_seen_source_updated_at)
     OR (v_state.highest_seen_source_version IS NOT NULL AND p_source_version IS NOT NULL
      AND p_source_version < v_state.highest_seen_source_version) THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'stale_revision');
  END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'not_found');
  END IF;

  -- ── UPPGIFT 2/8: all mutation i en subtransaktion → full rollback ───
  BEGIN
    -- 1. bookings: status + versionshöjning + revisionsspegel.
    SELECT EXISTS (
      SELECT 1 FROM public.projects
      WHERE organization_id = p_organization_id AND booking_id = p_booking_id AND status <> 'cancelled'
    ) OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE organization_id = p_organization_id AND booking_id = p_booking_id
        AND status NOT IN ('completed', 'cancelled')
    ) INTO v_has_active_links;

    SELECT EXISTS (
      SELECT 1 FROM public.projects
      WHERE organization_id = p_organization_id AND booking_id = p_booking_id AND status = 'cancelled'
    ) OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE organization_id = p_organization_id AND booking_id = p_booking_id AND status = 'cancelled'
    ) INTO v_has_cancelled_links;

    v_was_manually_hidden := coalesce(v_booking.assigned_to_project, false) = true
      AND v_booking.assigned_project_id IS NULL
      AND v_booking.assigned_project_name IS NULL;

    v_keep_hidden := (NOT v_has_active_links) AND (v_was_manually_hidden OR v_has_cancelled_links);

    UPDATE public.bookings
      SET status = 'CANCELLED',
          assigned_to_project = CASE WHEN v_keep_hidden THEN true ELSE false END,
          assigned_project_id = CASE WHEN v_keep_hidden THEN NULL ELSE v_booking.assigned_project_id END,
          assigned_project_name = CASE WHEN v_keep_hidden THEN NULL ELSE v_booking.assigned_project_name END,
          version = coalesce(v_booking.version, 1) + 1,
          last_applied_source_revision = jsonb_strip_nulls(jsonb_build_object(
            'source_updated_at', to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'source_version', p_source_version,
            'source_status', v_status,
            'change_type', 'cancellation_source',
            'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )),
          updated_at = now()
    WHERE id = p_booking_id AND organization_id = p_organization_id;
    GET DIAGNOSTICS m_bookings = ROW_COUNT;

    -- 2. calendar_events: endast bokningsgenererade dagar.
    --    UPPGIFT 6: manuella aktiviteter (event_type='activity') och
    --    to-do-events (event_type='todo' / todo_id) bevaras alltid.
    DELETE FROM public.calendar_events
    WHERE organization_id = p_organization_id
      AND booking_id = p_booking_id
      AND todo_id IS NULL
      AND coalesce(event_type, '') NOT IN ('activity', 'todo');
    GET DIAGNOSTICS m_cal = ROW_COUNT;

    -- 3. warehouse_calendar_events: bokningsgenererade logistikdagar.
    DELETE FROM public.warehouse_calendar_events
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_wh = ROW_COUNT;

    -- 4. projects: soft-cancel, historik bevaras (redan avslutade rörs ej).
    UPDATE public.projects
      SET status = 'cancelled', updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id
      AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS m_projects = ROW_COUNT;

    -- 5. jobs: soft-cancel, avslutade jobb bevaras.
    UPDATE public.jobs
      SET status = 'cancelled', updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id
      AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS m_jobs = ROW_COUNT;

    -- 6. packing_projects: hard-delete (planeringsdata, ej historik).
    DELETE FROM public.packing_projects
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_packing = ROW_COUNT;

    -- 7. booking_products: hard-delete (speglar Booking-systemets orderrader).
    DELETE FROM public.booking_products
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_products = ROW_COUNT;

    -- 8. audit: exakt en cancellation-post per revision (UPPGIFT 7).
    SELECT EXISTS (
      SELECT 1 FROM public.booking_changes
      WHERE organization_id = p_organization_id
        AND booking_id = p_booking_id
        AND change_type = 'cancellation_source'
        AND coalesce(new_values->>'source_revision', '') = v_rev
    ) INTO v_audit_exists;

    IF NOT v_audit_exists THEN
      INSERT INTO public.booking_changes (
        booking_id, organization_id, change_type, changed_fields,
        previous_values, new_values, version
      ) VALUES (
        p_booking_id, p_organization_id, 'cancellation_source', ARRAY['status']::text[],
        jsonb_build_object('status', v_booking.status),
        jsonb_strip_nulls(jsonb_build_object(
          'status', 'CANCELLED',
          'source_reason', coalesce(p_reason, 'cancelled'),
          'source_status', v_status,
          'source_revision', v_rev,
          'source_updated_at', to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'source_version', p_source_version,
          'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )),
        coalesce(v_booking.version, 1) + 1
      );
      m_audit := 1;
    END IF;

    -- 9. current-state: applied cancellation + rensad reservation/lås.
    UPDATE public.booking_source_state
      SET applied_source_updated_at = p_source_updated_at,
          applied_source_version = p_source_version,
          applied_source_status = v_status,
          revision_kind = v_kind,
          pending_source_updated_at = NULL,
          pending_source_version = NULL,
          pending_source_status = NULL,
          pending_started_at = NULL,
          lock_token = NULL,
          lock_owner_job_id = NULL,
          lock_acquired_at = NULL,
          lock_expires_at = NULL,
          highest_seen_source_updated_at = GREATEST(
            coalesce(highest_seen_source_updated_at, p_source_updated_at), p_source_updated_at),
          highest_seen_source_version = GREATEST(
            coalesce(highest_seen_source_version, p_source_version), p_source_version),
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;

  EXCEPTION WHEN OTHERS THEN
    -- Subtransaktionen rullas tillbaka i sin helhet: ingen tabell muteras.
    RETURN jsonb_build_object('success', false, 'outcome', 'failed',
                              'error', SQLERRM, 'sqlstate', SQLSTATE,
                              'booking_id', p_booking_id,
                              'organization_id', p_organization_id);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'cancelled',
    'already_current', false,
    'booking_id', p_booking_id,
    'organization_id', p_organization_id,
    'source_revision', v_rev,
    'mutations', jsonb_build_object(
      'bookings', m_bookings,
      'calendar_events', m_cal,
      'warehouse_events', m_wh,
      'projects', m_projects,
      'jobs', m_jobs,
      'packing_projects', m_packing,
      'booking_products', m_products,
      'audit', m_audit
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_booking_cancellation_atomic(uuid, text, text, timestamptz, bigint, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_booking_cancellation_atomic(uuid, text, text, timestamptz, bigint, text, uuid) TO service_role;