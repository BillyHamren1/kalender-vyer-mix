CREATE OR REPLACE FUNCTION public.reserve_booking_calendar_repair(p_organization_id uuid, p_booking_id text, p_source_updated_at timestamp with time zone, p_source_version bigint, p_source_status text, p_owner_job_id text DEFAULT NULL::text, p_lease_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Same-revision kalenderreparation: revisionen är redan applicerad men en
-- ofullbordad kalender-baseline finns kvar (kalendern speglar ännu inte R).
-- Samma lease/revisionskrav som produktreparationen; rör inga produktmarkörer.
DECLARE v_row public.booking_source_state%ROWTYPE; v_status text := upper(nullif(btrim(coalesce(p_source_status, '')), ''));
  v_token uuid; v_lease integer := greatest(coalesce(p_lease_seconds, 300), 30);
BEGIN
  IF p_organization_id IS NULL OR nullif(btrim(coalesce(p_booking_id,'')),'') IS NULL OR v_status IS NULL
     OR (p_source_updated_at IS NULL AND p_source_version IS NULL) THEN RETURN jsonb_build_object('decision', 'invalid_input'); END IF;
  SELECT * INTO v_row FROM public.booking_source_state WHERE organization_id = p_organization_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  IF v_row.lock_token IS NOT NULL AND v_row.lock_expires_at > now() THEN RETURN jsonb_build_object('decision', 'booking_import_locked'); END IF;
  IF v_row.applied_source_updated_at IS DISTINCT FROM p_source_updated_at OR v_row.applied_source_version IS DISTINCT FROM p_source_version
     OR v_row.applied_source_status IS DISTINCT FROM v_status THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  IF v_row.calendar_baseline IS NULL THEN RETURN jsonb_build_object('decision', 'not_pending'); END IF;
  v_token := gen_random_uuid();
  UPDATE public.booking_source_state SET pending_source_updated_at = p_source_updated_at, pending_source_version = p_source_version,
    pending_source_status = v_status, pending_started_at = now(), lock_token = v_token, lock_owner_job_id = p_owner_job_id,
    lock_acquired_at = now(), lock_expires_at = now() + make_interval(secs => v_lease), updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
  RETURN jsonb_build_object('decision', 'reserved', 'reservation_token', v_token, 'lock_expires_at', now() + make_interval(secs => v_lease));
END $function$;
REVOKE ALL ON FUNCTION public.reserve_booking_calendar_repair(uuid, text, timestamptz, bigint, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_booking_calendar_repair(uuid, text, timestamptz, bigint, text, text, integer) TO service_role;