-- STEG 4N: Stäng legacy BSA-tenantytan (ingen DROP, ingen datamutation)

-- 1. Legacy tenant-osäker RPC: ta bort all runtime-EXECUTE.
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day(text, date) FROM anon;
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day(text, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day(text, date) FROM service_role;

COMMENT ON FUNCTION public.recompute_booking_staff_for_day(text, date) IS
  'DEPRECATED (STEG 4N): tenant-osäker (saknar organization_id). EXECUTE återkallat för PUBLIC/anon/authenticated/service_role. Använd recompute_booking_staff_for_day_v2(p_organization_id, p_booking_id, p_date). Behålls endast för migrationskompatibilitet.';

-- 2. Tenant-säker V2: endast authenticated + service_role (ingen anon, ingen PUBLIC).
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) TO service_role;