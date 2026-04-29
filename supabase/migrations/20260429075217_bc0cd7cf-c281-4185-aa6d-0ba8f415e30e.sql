-- ============================================================================
-- Inbox dedup: matcha mot existerande warehouse_projects, undvik duplikat
-- ============================================================================

-- 1. Backfill source_project_id på existerande warehouse_projects där det saknas
UPDATE public.warehouse_projects wp
SET source_project_id = p.id
FROM public.projects p
JOIN public.bookings b ON b.id::text = p.booking_id
WHERE wp.source_project_id IS NULL
  AND wp.source_project_number IS NOT NULL
  AND wp.source_project_number = b.booking_number
  AND wp.organization_id = p.organization_id;

-- 2. Smartare trigger för PROJECTS: hoppa över inbox-insert om
--    samma source_project_number redan har en warehouse_projects-rad
CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD;
  _client text;
  _event_date date;
  _project_number text;
  _existing_wp_id uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT client, eventdate, booking_number
    INTO _booking
    FROM public.bookings
    WHERE id::text = NEW.booking_id;
    _client := _booking.client;
    _event_date := _booking.eventdate::date;
    _project_number := _booking.booking_number;
  ELSE
    _client := NEW.name;
  END IF;

  -- DEDUP: om det redan finns ett warehouse_projects för samma org +
  -- source_project_number (dvs. samma underliggande booking), så är detta
  -- bara en re-import av samma projekt — inte ett nytt. Länka istället
  -- om wp.source_project_id till det nya projects.id och skippa inbox.
  IF _project_number IS NOT NULL THEN
    SELECT id INTO _existing_wp_id
    FROM public.warehouse_projects
    WHERE organization_id = NEW.organization_id
      AND source_project_number = _project_number
    LIMIT 1;

    IF _existing_wp_id IS NOT NULL THEN
      UPDATE public.warehouse_projects
      SET source_project_id = NEW.id
      WHERE id = _existing_wp_id
        AND (source_project_id IS NULL OR source_project_id <> NEW.id);
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id,
    source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'project', NEW.id,
    _project_number, _client, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Smartare trigger för LARGE PROJECTS: samma idé via source_large_project_id
CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_large_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _event_date date;
  _existing_wp_id uuid;
BEGIN
  IF NEW.event_date IS NOT NULL AND array_length(NEW.event_date, 1) > 0 THEN
    SELECT min(d::date) INTO _event_date FROM unnest(NEW.event_date) AS d WHERE d IS NOT NULL;
  END IF;

  -- DEDUP: matcha på project_number inom samma org
  IF NEW.project_number IS NOT NULL THEN
    SELECT id INTO _existing_wp_id
    FROM public.warehouse_projects
    WHERE organization_id = NEW.organization_id
      AND source_project_number = NEW.project_number
    LIMIT 1;

    IF _existing_wp_id IS NOT NULL THEN
      UPDATE public.warehouse_projects
      SET source_large_project_id = NEW.id
      WHERE id = _existing_wp_id
        AND (source_large_project_id IS NULL OR source_large_project_id <> NEW.id);
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id,
    source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'large_project', NEW.id,
    NEW.project_number, NEW.name, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 4. Städa Bergman-fallet: länka existerande Lager-2603-126 till nya projects.id
--    och markera den nya inbox-raden som converted/processed.
UPDATE public.warehouse_projects
SET source_project_id = '1c2c01d4-e9e5-4c82-9b95-88461092219f'
WHERE project_number = 'Lager-2603-126'
  AND source_project_id IS NULL;

UPDATE public.warehouse_project_inbox
SET status = 'converted',
    processed_at = now(),
    warehouse_project_id = (
      SELECT id FROM public.warehouse_projects
      WHERE project_number = 'Lager-2603-126'
      LIMIT 1
    )
WHERE id = '51f7b85a-b8b3-4c78-800f-9da0c0a1aefb'
  AND status = 'new';