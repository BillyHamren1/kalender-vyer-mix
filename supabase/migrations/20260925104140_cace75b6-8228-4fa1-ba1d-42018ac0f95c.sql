-- Härdning av grupprojektmigreringen: stäng PUBLIC-standardrätten till kopplingsfunktionen.
-- Funktionen förblir SECURITY INVOKER och RLS gäller oförändrat. Ingen dataskrivning.

REVOKE EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) TO service_role;