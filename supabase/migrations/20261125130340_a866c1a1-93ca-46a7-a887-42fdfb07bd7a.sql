ALTER TABLE public.warehouse_project_changes ALTER COLUMN warehouse_project_id DROP NOT NULL;
ALTER TABLE public.warehouse_project_changes
  ADD COLUMN IF NOT EXISTS booking_id text,
  ADD COLUMN IF NOT EXISTS booking_number text,
  ADD COLUMN IF NOT EXISTS packing_id uuid REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_project_changes_dedupe_key_uq
  ON public.warehouse_project_changes (organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS warehouse_project_changes_open_date_idx
  ON public.warehouse_project_changes (organization_id, acknowledged, created_at DESC) WHERE change_type = 'booking_date_changed';
CREATE INDEX IF NOT EXISTS warehouse_project_changes_packing_idx
  ON public.warehouse_project_changes (packing_id) WHERE packing_id IS NOT NULL;

GRANT SELECT, UPDATE ON public.warehouse_project_changes TO authenticated;
GRANT ALL ON public.warehouse_project_changes TO service_role;

CREATE OR REPLACE FUNCTION public.notify_warehouse_booking_date_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_src text; v_headers text; v_packing uuid; v_rev text; v_state public.booking_source_state%ROWTYPE;
  f text; o text; n text;
BEGIN
  IF NEW.organization_id IS NULL OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN RETURN NULL; END IF;
  IF upper(coalesce(NEW.status,'')) = 'CANCELLED' THEN RETURN NULL; END IF;
  BEGIN
    v_headers := current_setting('request.headers', true);
    IF v_headers IS NOT NULL AND v_headers <> '' THEN v_src := NULLIF(v_headers::jsonb ->> 'x-lovable-change-source',''); END IF;
  EXCEPTION WHEN OTHERS THEN v_src := NULL; END;
  v_src := coalesce(v_src, NULLIF(current_setting('app.current_user', true),''));
  IF v_src IS NULL OR v_src NOT IN ('booking-import','booking-webhook') THEN RETURN NULL; END IF;

  SELECT pp.id INTO v_packing FROM public.packing_projects pp
   WHERE pp.organization_id = NEW.organization_id AND pp.booking_id = NEW.id
     AND coalesce(pp.status,'') <> 'cancelled'
   ORDER BY pp.created_at LIMIT 1;
  IF v_packing IS NULL THEN
    SELECT pp.id INTO v_packing FROM public.packing_project_bookings ppb
      JOIN public.packing_projects pp ON pp.id = ppb.packing_id AND pp.organization_id = ppb.organization_id
     WHERE ppb.organization_id = NEW.organization_id AND ppb.booking_id = NEW.id
       AND coalesce(pp.status,'') <> 'cancelled'
     ORDER BY pp.created_at LIMIT 1;
  END IF;
  IF v_packing IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_state FROM public.booking_source_state
   WHERE organization_id = NEW.organization_id AND booking_id = NEW.id;
  v_rev := coalesce(
    NULLIF(concat_ws('/', v_state.pending_source_updated_at::text, v_state.pending_source_version::text), ''),
    NULLIF(concat_ws('/', v_state.applied_source_updated_at::text, v_state.applied_source_version::text), ''),
    'v' || coalesce(NEW.version::text, '0'));

  FOREACH f IN ARRAY ARRAY['rigdaydate','eventdate','rigdowndate'] LOOP
    o := CASE f WHEN 'rigdaydate' THEN OLD.rigdaydate::text WHEN 'eventdate' THEN OLD.eventdate::text ELSE OLD.rigdowndate::text END;
    n := CASE f WHEN 'rigdaydate' THEN NEW.rigdaydate::text WHEN 'eventdate' THEN NEW.eventdate::text ELSE NEW.rigdowndate::text END;
    -- Första datum (tidigare tomt) är ingen ändring.
    IF o IS NULL OR o IS NOT DISTINCT FROM n THEN CONTINUE; END IF;
    INSERT INTO public.warehouse_project_changes
      (organization_id, booking_id, booking_number, packing_id, change_type, field_name, old_value, new_value, source_revision, dedupe_key)
    VALUES (NEW.organization_id, NEW.id, NEW.booking_number, v_packing, 'booking_date_changed', f, o, n, v_rev,
      concat_ws('|', 'date', NEW.id, f, o, coalesce(n,'∅'), v_rev))
    ON CONFLICT (organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.notify_warehouse_booking_date_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_warehouse_booking_date_change ON public.bookings;
CREATE TRIGGER trg_notify_warehouse_booking_date_change
  AFTER UPDATE OF rigdaydate, eventdate, rigdowndate ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_warehouse_booking_date_change();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_project_changes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;