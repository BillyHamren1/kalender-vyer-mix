-- STEG 2K: fail-closed revisionstypkontroll i den atomiska cancellation-RPC:n.

-- ── Backfill: normalisera gamla giltiga booking_source_state-rader ────────
DO $backfill$
DECLARE
  v_fixed int := 0;
  v_unknown int := 0;
BEGIN
  UPDATE public.booking_source_state
    SET revision_kind = CASE
          WHEN applied_source_updated_at IS NOT NULL AND applied_source_version IS NOT NULL THEN 'both'
          WHEN applied_source_updated_at IS NOT NULL THEN 'timestamp'
          ELSE 'version' END,
        updated_at = now()
  WHERE (applied_source_updated_at IS NOT NULL OR applied_source_version IS NOT NULL)
    AND (revision_kind IS NULL OR btrim(lower(revision_kind)) NOT IN ('timestamp', 'version', 'both'));
  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  -- Motsägelsefulla rader: kind satt men kolumnerna matchar inte typen.
  SELECT count(*) INTO v_unknown FROM public.booking_source_state
  WHERE (applied_source_updated_at IS NOT NULL OR applied_source_version IS NOT NULL)
    AND (
      (btrim(lower(revision_kind)) = 'both' AND (applied_source_updated_at IS NULL OR applied_source_version IS NULL))
      OR (btrim(lower(revision_kind)) = 'timestamp' AND applied_source_updated_at IS NULL)
      OR (btrim(lower(revision_kind)) = 'version' AND applied_source_version IS NULL)
    );

  RAISE NOTICE '[2K backfill] revision_kind normaliserad: % rader, motsägelsefulla kvar: %', v_fixed, v_unknown;
END;
$backfill$;

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
  v_state_kind text;
  v_ts_cmp int;
  v_ver_cmp int;
  v_lock_active boolean := false;
  v_rev text;
  v_keep_hidden boolean := false;
  v_has_active_links boolean := false;
  v_has_cancelled_links boolean := false;
  v_was_manually_hidden boolean := false;
  v_audit_exists boolean := false;
  v_same_revision boolean := false;
  m_bookings int := 0;
  m_cal int := 0;
  m_wh int := 0;
  m_projects int := 0;
  m_jobs int := 0;
  m_packing int := 0;
  m_products int := 0;
  m_audit int := 0;
BEGIN
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

  INSERT INTO public.booking_source_state (organization_id, booking_id)
  VALUES (p_organization_id, p_booking_id)
  ON CONFLICT (organization_id, booking_id) DO NOTHING;

  SELECT * INTO v_state FROM public.booking_source_state
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id
  FOR UPDATE;

  v_lock_active := v_state.lock_token IS NOT NULL
    AND v_state.lock_expires_at IS NOT NULL
    AND v_state.lock_expires_at > now();

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
    IF v_state.pending_source_updated_at IS DISTINCT FROM p_source_updated_at
       OR v_state.pending_source_version IS DISTINCT FROM p_source_version
       OR upper(coalesce(v_state.pending_source_status, '')) IS DISTINCT FROM v_status THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'reservation_mismatch');
    END IF;
  ELSIF v_lock_active THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'reservation_lost');
  END IF;

  -- ── STEG 2K: fail-closed revisionstypkontroll ───────────────────────
  IF v_state.applied_source_updated_at IS NOT NULL OR v_state.applied_source_version IS NOT NULL THEN
    v_state_kind := nullif(btrim(lower(coalesce(v_state.revision_kind, ''))), '');

    -- 3. Saknad/ogiltig lagrad revisionstyp → fail-closed, ingen gissning.
    IF v_state_kind IS NULL OR v_state_kind NOT IN ('timestamp', 'version', 'both') THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'stored_revision_kind_missing');
    END IF;

    -- 4. Lagrad both måste vara komplett.
    IF v_state_kind = 'both'
       AND (v_state.applied_source_updated_at IS NULL OR v_state.applied_source_version IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'incomplete_composite_revision');
    END IF;
    IF (v_state_kind = 'timestamp' AND v_state.applied_source_updated_at IS NULL)
       OR (v_state_kind = 'version' AND v_state.applied_source_version IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'stored_revision_kind_missing');
    END IF;

    -- 1/2. Ingen implicit typuppgradering: endast identiska typer jämförs.
    IF v_state_kind IS DISTINCT FROM v_kind THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                'error', 'incomparable_source_revision_kind');
    END IF;

    IF v_kind = 'both' THEN
      IF p_source_updated_at IS NULL OR p_source_version IS NULL THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                  'error', 'incomplete_composite_revision');
      END IF;
      v_ts_cmp := CASE
        WHEN p_source_updated_at > v_state.applied_source_updated_at THEN 1
        WHEN p_source_updated_at < v_state.applied_source_updated_at THEN -1
        ELSE 0 END;
      v_ver_cmp := CASE
        WHEN p_source_version > v_state.applied_source_version THEN 1
        WHEN p_source_version < v_state.applied_source_version THEN -1
        ELSE 0 END;

      -- Motsägelsefull composite revision → fail-closed.
      IF (v_ts_cmp > 0 AND v_ver_cmp < 0) OR (v_ts_cmp < 0 AND v_ver_cmp > 0) THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'revision_conflict',
                                  'error', 'inconsistent_composite_revision');
      END IF;
      IF v_ts_cmp < 0 OR v_ver_cmp < 0 THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'stale_revision');
      END IF;
      v_same_revision := (v_ts_cmp = 0 AND v_ver_cmp = 0);
    ELSIF v_kind = 'timestamp' THEN
      IF p_source_updated_at < v_state.applied_source_updated_at THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'stale_revision');
      END IF;
      v_same_revision := (p_source_updated_at = v_state.applied_source_updated_at);
    ELSE
      IF p_source_version < v_state.applied_source_version THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'stale_revision');
      END IF;
      v_same_revision := (p_source_version = v_state.applied_source_version);
    END IF;

    -- 5. Exakt samma revision.
    IF v_same_revision THEN
      IF upper(coalesce(v_state.applied_source_status, '')) = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_cancelled',
                                  'already_current', true,
                                  'booking_id', p_booking_id,
                                  'organization_id', p_organization_id,
                                  'source_revision', v_rev);
      END IF;
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

  BEGIN
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
            'revision_kind', v_kind,
            'change_type', 'cancellation_source',
            'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )),
          updated_at = now()
    WHERE id = p_booking_id AND organization_id = p_organization_id;
    GET DIAGNOSTICS m_bookings = ROW_COUNT;

    DELETE FROM public.calendar_events
    WHERE organization_id = p_organization_id
      AND booking_id = p_booking_id
      AND todo_id IS NULL
      AND coalesce(event_type, '') NOT IN ('activity', 'todo');
    GET DIAGNOSTICS m_cal = ROW_COUNT;

    DELETE FROM public.warehouse_calendar_events
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_wh = ROW_COUNT;

    UPDATE public.projects
      SET status = 'cancelled', updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id
      AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS m_projects = ROW_COUNT;

    UPDATE public.jobs
      SET status = 'cancelled', updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id
      AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS m_jobs = ROW_COUNT;

    DELETE FROM public.packing_projects
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_packing = ROW_COUNT;

    DELETE FROM public.booking_products
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    GET DIAGNOSTICS m_products = ROW_COUNT;

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
          'revision_kind', v_kind,
          'source_updated_at', to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'source_version', p_source_version,
          'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )),
        coalesce(v_booking.version, 1) + 1
      );
      m_audit := 1;
    END IF;

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
    'revision_kind', v_kind,
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