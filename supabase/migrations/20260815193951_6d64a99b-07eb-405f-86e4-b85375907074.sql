CREATE OR REPLACE FUNCTION public.recompute_booking_staff_for_day(p_booking_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.bookings WHERE id = p_booking_id;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'organization_not_resolved', 'added', 0, 'removed', 0);
  END IF;

  RETURN public.recompute_booking_staff_for_day_v2(v_org, p_booking_id, p_date);
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day(text, date) FROM PUBLIC, anon, authenticated;