-- Atomic mobile staffing commands; canonical staff_assignments triggers own BSA.
CREATE SCHEMA IF NOT EXISTS planning_mobile_private;
REVOKE ALL ON SCHEMA planning_mobile_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA planning_mobile_private TO service_role;
CREATE TABLE planning_mobile_private.staff_command_receipts (
  organization_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload jsonb NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, actor_user_id, idempotency_key)
);
ALTER TABLE planning_mobile_private.staff_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planning_mobile_private.staff_command_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON planning_mobile_private.staff_command_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.planning_mobile_staff_command_v1(
  p_actor_user_id uuid, p_organization_id uuid, p_event_id uuid,
  p_staff_id text, p_operation text, p_idempotency_key uuid,
  p_expected_membership_id uuid, p_expected_team_id text, p_expected_date date, p_expected_booking_ids text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_event record;
  v_existing uuid;
  v_payload jsonb;
  v_previous record;
  v_receipt jsonb;
  v_id uuid;
  v_date date;
  v_booking_ids text[];
BEGIN
  IF p_actor_user_id IS NULL OR p_organization_id IS NULL OR p_event_id IS NULL OR
     p_idempotency_key IS NULL OR p_staff_id IS NULL OR length(p_staff_id) NOT BETWEEN 1 AND 128 OR
     p_operation IS NULL OR p_operation NOT IN ('assign','remove') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id=p_actor_user_id AND organization_id=p_organization_id)
     OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=p_actor_user_id AND organization_id=p_organization_id AND role IN ('admin','projekt')) THEN
    RAISE EXCEPTION 'actor_not_authorized' USING ERRCODE='42501';
  END IF;
  v_payload := jsonb_build_object('eventId',p_event_id,'staffId',p_staff_id,'operation',p_operation,'expectedMembershipId',p_expected_membership_id,'expectedTeamId',p_expected_team_id,'expectedDate',p_expected_date,'expectedBookingIds',p_expected_booking_ids);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_actor_user_id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO v_previous FROM planning_mobile_private.staff_command_receipts
    WHERE organization_id=p_organization_id AND actor_user_id=p_actor_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_previous.payload<>v_payload THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='40001'; END IF;
    RETURN v_previous.receipt||jsonb_build_object('replayed',true);
  END IF;
  SELECT id, resource_id, source_date, start_time INTO v_event FROM calendar_events
    WHERE id=p_event_id AND organization_id=p_organization_id FOR SHARE;
  IF NOT FOUND OR v_event.resource_id IS NULL OR v_event.resource_id IN ('activity','project','location','project_team') THEN
    RAISE EXCEPTION 'calendar_team_not_found' USING ERRCODE='22023';
  END IF;
  v_date:=coalesce(v_event.source_date,(v_event.start_time AT TIME ZONE 'Europe/Stockholm')::date);
  IF v_event.resource_id IS DISTINCT FROM p_expected_team_id OR v_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'calendar_changed' USING ERRCODE='40001'; END IF;
  IF v_date IS NULL THEN RAISE EXCEPTION 'calendar_date_missing' USING ERRCODE='22023'; END IF;
  -- Read-committed review check, not a serializable freeze of calendar/project sources.
  -- Canonical team/day membership also applies to bookings added later.
  SELECT coalesce(array_agg(DISTINCT booking_id ORDER BY booking_id),ARRAY[]::text[]) INTO v_booking_ids FROM (
    SELECT ce.booking_id FROM calendar_events ce JOIN bookings b ON b.id=ce.booking_id AND b.organization_id=p_organization_id
      WHERE ce.organization_id=p_organization_id AND ce.resource_id=v_event.resource_id
        AND coalesce(ce.source_date,(ce.start_time AT TIME ZONE 'Europe/Stockholm')::date)=v_date
    UNION
    SELECT lpb.booking_id FROM large_project_bookings lpb JOIN large_projects lp ON lp.id=lpb.large_project_id
      JOIN bookings b ON b.id=lpb.booking_id AND b.organization_id=p_organization_id
      WHERE lpb.organization_id=p_organization_id AND lp.organization_id=p_organization_id AND lp.deleted_at IS NULL
        AND (v_date::text=ANY(coalesce(lp.start_date,ARRAY[]::text[])) OR v_date::text=ANY(coalesce(lp.event_date,ARRAY[]::text[])) OR v_date::text=ANY(coalesce(lp.end_date,ARRAY[]::text[])))
  ) targets;
  IF p_expected_booking_ids IS NULL OR v_booking_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT unnest(p_expected_booking_ids) ORDER BY 1) THEN
    RAISE EXCEPTION 'affected_bookings_changed' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE id=p_staff_id AND organization_id=p_organization_id AND is_active=true) THEN
    RAISE EXCEPTION 'staff_not_in_organization' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_staff_id||':'||v_date::text,0));
  SELECT id INTO v_existing FROM staff_assignments
    WHERE organization_id=p_organization_id AND staff_id=p_staff_id AND team_id=v_event.resource_id AND assignment_date=v_date FOR UPDATE;
  IF v_existing IS DISTINCT FROM p_expected_membership_id THEN
    RAISE EXCEPTION 'membership_conflict' USING ERRCODE='40001';
  END IF;
  IF p_operation='assign' THEN
    IF v_existing IS NULL THEN
      INSERT INTO staff_assignments(staff_id,team_id,assignment_date,organization_id)
        VALUES(p_staff_id,v_event.resource_id,v_date,p_organization_id) RETURNING id INTO v_id;
    ELSE v_id:=v_existing;
    END IF;
  ELSE
    IF v_existing IS NULL THEN RAISE EXCEPTION 'membership_conflict' USING ERRCODE='40001'; END IF;
    DELETE FROM staff_assignments WHERE id=v_existing AND organization_id=p_organization_id;
    v_id:=v_existing;
  END IF;
  -- The existing INSERT/DELETE triggers synchronously derive BSA; no direct BSA writes here.
  IF (p_operation='assign') IS DISTINCT FROM EXISTS(
    SELECT 1 FROM staff_assignments WHERE organization_id=p_organization_id AND staff_id=p_staff_id AND team_id=v_event.resource_id AND assignment_date=v_date
  ) THEN RAISE EXCEPTION 'membership_not_persisted'; END IF;
  v_receipt:=jsonb_build_object('persisted',true,'replayed',false,'idempotencyKey',p_idempotency_key,
    'actorUserId',p_actor_user_id,'organizationId',p_organization_id,'operation',p_operation,
    'calendarEventId',p_event_id,'staffId',p_staff_id,'teamId',v_event.resource_id,'date',v_date,'membershipId',v_id,'affectedBookingIds',v_booking_ids);
  INSERT INTO planning_mobile_private.staff_command_receipts VALUES(p_organization_id,p_actor_user_id,p_idempotency_key,v_payload,v_receipt,now());
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.planning_mobile_staff_command_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,date,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planning_mobile_staff_command_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,date,text[]) TO service_role;
