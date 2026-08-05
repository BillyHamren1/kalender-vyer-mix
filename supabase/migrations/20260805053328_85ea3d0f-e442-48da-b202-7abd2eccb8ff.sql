-- STEG 2H: exklusivt lease-baserat importlås + atomisk commit

ALTER TABLE public.booking_source_state
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS lock_owner_job_id text,
  ADD COLUMN IF NOT EXISTS lock_acquired_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS highest_seen_source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS highest_seen_source_version bigint,
  ADD COLUMN IF NOT EXISTS takeover_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_takeover_at timestamptz;

CREATE TABLE IF NOT EXISTS public.booking_source_state_backfill_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  booking_id text,
  reason text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.booking_source_state_backfill_issues TO service_role;
ALTER TABLE public.booking_source_state_backfill_issues ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_source_state_backfill_issues'
      AND policyname = 'service_role_only_bss_backfill_issues'
  ) THEN
    CREATE POLICY "service_role_only_bss_backfill_issues"
      ON public.booking_source_state_backfill_issues
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Gamla 6-argumentsversionen ersätts helt (undvik överlagringstvetydighet)
DROP FUNCTION IF EXISTS public.advance_booking_source_revision(uuid, text, timestamptz, bigint, text, text);

CREATE OR REPLACE FUNCTION public.advance_booking_source_revision(
  p_organization_id uuid,
  p_booking_id text,
  p_source_updated_at timestamptz,
  p_source_version bigint,
  p_source_status text,
  p_mode text,
  p_reservation_token uuid DEFAULT NULL,
  p_owner_job_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300
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
  v_lock_active boolean := false;
  v_new_token uuid;
  v_lease integer := greatest(coalesce(p_lease_seconds, 300), 30);
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

  v_lock_active := v_row.lock_token IS NOT NULL
    AND v_row.lock_expires_at IS NOT NULL
    AND v_row.lock_expires_at > now();

  v_applied_kind := CASE
    WHEN v_row.applied_source_updated_at IS NOT NULL AND v_row.applied_source_version IS NOT NULL THEN 'both'
    WHEN v_row.applied_source_updated_at IS NOT NULL THEN 'timestamp'
    WHEN v_row.applied_source_version IS NOT NULL THEN 'version'
    ELSE NULL END;

  -- ── RENEW ────────────────────────────────────────────────────────────
  IF p_mode = 'renew' THEN
    IF NOT v_lock_active OR p_reservation_token IS NULL OR v_row.lock_token IS DISTINCT FROM p_reservation_token THEN
      RETURN jsonb_build_object('decision', 'reservation_lost');
    END IF;
    UPDATE public.booking_source_state
      SET lock_expires_at = now() + make_interval(secs => v_lease), updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    RETURN jsonb_build_object('decision', 'renewed', 'reservation_token', v_row.lock_token,
                              'lock_expires_at', now() + make_interval(secs => v_lease));
  END IF;

  -- ── RELEASE (endast ägaren) ──────────────────────────────────────────
  IF p_mode = 'release' THEN
    IF p_reservation_token IS NULL OR v_row.lock_token IS DISTINCT FROM p_reservation_token THEN
      RETURN jsonb_build_object('decision', 'not_lock_owner');
    END IF;
    UPDATE public.booking_source_state
      SET pending_source_updated_at = NULL,
          pending_source_version = NULL,
          pending_source_status = NULL,
          pending_started_at = NULL,
          lock_token = NULL,
          lock_owner_job_id = NULL,
          lock_acquired_at = NULL,
          lock_expires_at = NULL,
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    RETURN jsonb_build_object('decision', 'released');
  END IF;

  -- ── COMMIT (endast ägaren, exakt reserverad revision) ────────────────
  IF p_mode = 'commit' THEN
    IF p_reservation_token IS NULL OR v_row.lock_token IS DISTINCT FROM p_reservation_token OR NOT v_lock_active THEN
      IF v_applied_kind IS NOT NULL
         AND v_row.applied_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
         AND v_row.applied_source_version IS NOT DISTINCT FROM p_source_version
         AND v_row.applied_source_status = v_status THEN
        RETURN jsonb_build_object('decision', 'already_current');
      END IF;
      RETURN jsonb_build_object('decision', 'reservation_lost');
    END IF;

    IF v_row.pending_source_updated_at IS DISTINCT FROM p_source_updated_at
       OR v_row.pending_source_version IS DISTINCT FROM p_source_version
       OR v_row.pending_source_status IS DISTINCT FROM v_status THEN
      RETURN jsonb_build_object('decision', 'reservation_mismatch');
    END IF;

    UPDATE public.booking_source_state
      SET applied_source_updated_at = p_source_updated_at,
          applied_source_version = p_source_version,
          applied_source_status = v_status,
          revision_kind = v_incoming_kind,
          pending_source_updated_at = NULL,
          pending_source_version = NULL,
          pending_source_status = NULL,
          pending_started_at = NULL,
          lock_token = NULL,
          lock_owner_job_id = NULL,
          lock_acquired_at = NULL,
          lock_expires_at = NULL,
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;

    -- Samma transaktion: bokningens speglade fält + auditlogg
    UPDATE public.bookings
      SET last_applied_source_revision = jsonb_strip_nulls(jsonb_build_object(
            'source_updated_at', to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'source_version', p_source_version,
            'source_status', v_status,
            'change_type', 'source_revision',
            'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ))
    WHERE id = p_booking_id AND organization_id = p_organization_id;

    INSERT INTO public.booking_changes (
      booking_id, organization_id, change_type, changed_fields, previous_values, new_values
    ) VALUES (
      p_booking_id, p_organization_id, 'source_revision', ARRAY['source_revision']::text[], '{}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'source_revision', coalesce(
          p_source_version::text,
          to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        'source_updated_at', to_char(p_source_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'source_version', p_source_version,
        'source_status', v_status,
        'logged_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ))
    );

    RETURN jsonb_build_object('decision', 'applied');
  END IF;

  -- ── RESERVE ──────────────────────────────────────────────────────────
  IF p_mode <> 'reserve' THEN
    RETURN jsonb_build_object('decision', 'invalid_input', 'error', 'unknown_mode');
  END IF;

  IF v_lock_active AND (p_reservation_token IS NULL OR v_row.lock_token IS DISTINCT FROM p_reservation_token) THEN
    RETURN jsonb_build_object('decision', 'booking_import_locked',
                              'lock_expires_at', v_row.lock_expires_at,
                              'lock_owner_job_id', v_row.lock_owner_job_id);
  END IF;

  IF v_row.lock_token IS NOT NULL AND NOT v_lock_active THEN
    -- Leasen har bevisligen löpt ut → takeover. Gammalt token blir ogiltigt.
    UPDATE public.booking_source_state
      SET takeover_count = coalesce(takeover_count, 0) + 1,
          last_takeover_at = now(),
          pending_source_updated_at = NULL,
          pending_source_version = NULL,
          pending_source_status = NULL,
          pending_started_at = NULL,
          lock_token = NULL,
          lock_owner_job_id = NULL,
          lock_acquired_at = NULL,
          lock_expires_at = NULL,
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    RAISE NOTICE 'booking_source_state lease takeover org=% booking=%', p_organization_id, p_booking_id;
  END IF;

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

  -- Watermark: en revision som är äldre än högsta sedda får aldrig appliceras,
  -- inte ens efter att en nyare revision delvis misslyckats.
  IF (v_row.highest_seen_source_updated_at IS NOT NULL AND p_source_updated_at IS NOT NULL
      AND p_source_updated_at < v_row.highest_seen_source_updated_at)
     OR (v_row.highest_seen_source_version IS NOT NULL AND p_source_version IS NOT NULL
      AND p_source_version < v_row.highest_seen_source_version) THEN
    RETURN jsonb_build_object('decision', 'stale_source_revision');
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.booking_source_state
    SET pending_source_updated_at = p_source_updated_at,
        pending_source_version = p_source_version,
        pending_source_status = v_status,
        pending_started_at = now(),
        lock_token = v_new_token,
        lock_owner_job_id = p_owner_job_id,
        lock_acquired_at = now(),
        lock_expires_at = now() + make_interval(secs => v_lease),
        highest_seen_source_updated_at = GREATEST(coalesce(highest_seen_source_updated_at, p_source_updated_at), p_source_updated_at),
        highest_seen_source_version = GREATEST(coalesce(highest_seen_source_version, p_source_version), p_source_version),
        updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;

  RETURN jsonb_build_object('decision', 'reserved',
                            'reservation_token', v_new_token,
                            'lock_expires_at', now() + make_interval(secs => v_lease));
END;
$fn$;

REVOKE ALL ON FUNCTION public.advance_booking_source_revision(uuid, text, timestamptz, bigint, text, text, uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_booking_source_revision(uuid, text, timestamptz, bigint, text, text, uuid, text, integer) TO service_role;

-- ── SÄKER BACKFILL (validerad, med karantän och explicit konfliktpolicy) ──
DO $backfill$
DECLARE
  r record;
  v_ts timestamptz;
  v_ver bigint;
  v_status text;
  v_backfilled int := 0;
  v_skipped int := 0;
  v_conflicts int := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.organization_id, b.last_applied_source_revision AS rev
    FROM public.bookings b
    WHERE b.last_applied_source_revision IS NOT NULL
      AND b.organization_id IS NOT NULL
  LOOP
    v_ts := NULL; v_ver := NULL;
    v_status := upper(nullif(btrim(coalesce(r.rev->>'source_status','')), ''));

    IF nullif(btrim(coalesce(r.rev->>'source_updated_at','')), '') IS NOT NULL THEN
      BEGIN
        v_ts := (r.rev->>'source_updated_at')::timestamptz;
      EXCEPTION WHEN others THEN
        v_ts := NULL;
        INSERT INTO public.booking_source_state_backfill_issues(organization_id, booking_id, reason, payload)
        VALUES (r.organization_id, r.id, 'invalid_source_updated_at', r.rev);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END;
    END IF;

    IF nullif(btrim(coalesce(r.rev->>'source_version','')), '') IS NOT NULL THEN
      IF (r.rev->>'source_version') ~ '^[0-9]+$' THEN
        v_ver := (r.rev->>'source_version')::bigint;
      ELSE
        INSERT INTO public.booking_source_state_backfill_issues(organization_id, booking_id, reason, payload)
        VALUES (r.organization_id, r.id, 'invalid_source_version', r.rev);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    IF v_status IS NULL OR (v_ts IS NULL AND v_ver IS NULL) THEN
      INSERT INTO public.booking_source_state_backfill_issues(organization_id, booking_id, reason, payload)
      VALUES (r.organization_id, r.id, 'missing_status_or_revision', r.rev);
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.booking_source_state (
      organization_id, booking_id, revision_kind,
      applied_source_updated_at, applied_source_version, applied_source_status,
      highest_seen_source_updated_at, highest_seen_source_version
    ) VALUES (
      r.organization_id, r.id,
      CASE WHEN v_ts IS NOT NULL AND v_ver IS NOT NULL THEN 'both'
           WHEN v_ts IS NOT NULL THEN 'timestamp' ELSE 'version' END,
      v_ts, v_ver, v_status, v_ts, v_ver
    )
    ON CONFLICT (organization_id, booking_id) DO UPDATE
      SET applied_source_updated_at = EXCLUDED.applied_source_updated_at,
          applied_source_version = EXCLUDED.applied_source_version,
          applied_source_status = EXCLUDED.applied_source_status,
          revision_kind = EXCLUDED.revision_kind,
          highest_seen_source_updated_at = GREATEST(
            coalesce(public.booking_source_state.highest_seen_source_updated_at, EXCLUDED.highest_seen_source_updated_at),
            EXCLUDED.highest_seen_source_updated_at),
          highest_seen_source_version = GREATEST(
            coalesce(public.booking_source_state.highest_seen_source_version, EXCLUDED.highest_seen_source_version),
            EXCLUDED.highest_seen_source_version),
          updated_at = now()
      WHERE public.booking_source_state.lock_token IS NULL
        AND (
          public.booking_source_state.applied_source_updated_at IS NULL
          AND public.booking_source_state.applied_source_version IS NULL
          OR coalesce(public.booking_source_state.applied_source_updated_at, '-infinity'::timestamptz)
             < coalesce(EXCLUDED.applied_source_updated_at, '-infinity'::timestamptz)
          OR coalesce(public.booking_source_state.applied_source_version, -1)
             < coalesce(EXCLUDED.applied_source_version, -1)
        );

    v_backfilled := v_backfilled + 1;
  END LOOP;

  SELECT count(*) INTO v_conflicts FROM public.booking_source_state_backfill_issues;
  RAISE NOTICE 'booking_source_state backfill: backfilled=% skipped=% issues_total=%', v_backfilled, v_skipped, v_conflicts;
END
$backfill$;