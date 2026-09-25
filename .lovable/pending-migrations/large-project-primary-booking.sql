-- EJ APPLICERAD. Additiv migration för grupprojekt. Kör endast efter granskning.
-- Verifierade typer (information_schema, 2026-09-25):
--   bookings.id text, bookings.large_project_id uuid, bookings.organization_id uuid
--   large_projects.id uuid, large_projects.organization_id uuid
--   large_project_bookings.booking_id text, .large_project_id uuid, .organization_id uuid
-- Koden fungerar utan migrationen (grundbokning = första medlem i sort_order;
-- konfliktkontroll görs i appen via findActiveLargeProjectForBooking).
--
-- MEDVETET INGET ovillkorligt UNIQUE(booking_id) på large_project_bookings:
-- deleteLargeProject soft-raderar projektet och lämnar medlemsraderna kvar så
-- att restoreLargeProject kan återställa. En unik index skulle hindra att
-- bokningen återanvänds efter soft-delete. En partiell unik index kan inte
-- referera large_projects.deleted_at, så aktiv-kontrollen görs i en
-- transaktionell RPC med radlås i stället.

-- 1) Explicit grundbokning (nullable, FK med samma typ som bookings.id = text).
ALTER TABLE public.large_projects
  ADD COLUMN IF NOT EXISTS primary_booking_id text
  REFERENCES public.bookings(id) ON DELETE SET NULL;

-- 2) Atomisk koppling: konfliktkontroll mot AKTIVA (ej soft-raderade) projekt,
--    join-rad + legacy-fält i samma transaktion, org-scope via RLS (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.link_booking_to_large_project(
  p_large_project_id uuid,
  p_booking_id text,
  p_make_primary boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_conflict uuid;
  v_link uuid;
  v_next int;
BEGIN
  -- Lås bokningsraden så samtidiga kopplingar serialiseras.
  PERFORM 1 FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT organization_id INTO v_org FROM public.large_projects
   WHERE id = p_large_project_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT lp.id INTO v_conflict
    FROM public.large_projects lp
   WHERE lp.deleted_at IS NULL AND lp.id <> p_large_project_id
     AND (lp.id IN (SELECT large_project_id FROM public.large_project_bookings WHERE booking_id = p_booking_id)
          OR lp.id = (SELECT large_project_id FROM public.bookings WHERE id = p_booking_id))
   LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_IN_OTHER_PROJECT:%', v_conflict USING ERRCODE = '23505';
  END IF;

  SELECT id INTO v_link FROM public.large_project_bookings
   WHERE large_project_id = p_large_project_id AND booking_id = p_booking_id;
  IF v_link IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
      FROM public.large_project_bookings WHERE large_project_id = p_large_project_id;
    INSERT INTO public.large_project_bookings (large_project_id, booking_id, sort_order, organization_id)
    VALUES (p_large_project_id, p_booking_id, v_next, v_org)
    RETURNING id INTO v_link;
  END IF;

  UPDATE public.bookings SET large_project_id = p_large_project_id WHERE id = p_booking_id;

  IF p_make_primary THEN
    UPDATE public.large_projects SET primary_booking_id = p_booking_id
     WHERE id = p_large_project_id AND primary_booking_id IS NULL;
  END IF;

  RETURN v_link;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.link_booking_to_large_project(uuid, text, boolean) FROM anon;

-- 3) Restore-säkerhet (hanteras i appen innan restoreLargeProject): om någon
--    medlemsbokning under soft-delete kopplats till ett annat aktivt projekt
--    ska återställning stoppas med konflikt, inte skapa dubbelt medlemskap.
