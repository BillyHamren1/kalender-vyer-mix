-- Step 1: Add column
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_date date;

-- Step 2: Disable specific user triggers
ALTER TABLE public.calendar_events DISABLE TRIGGER set_org_id;
ALTER TABLE public.calendar_events DISABLE TRIGGER sync_calendar_events_trigger;
ALTER TABLE public.calendar_events DISABLE TRIGGER trigger_sync_booking_staff_on_calendar_event;

-- Step 3: Backfill
UPDATE public.calendar_events
SET source_date = (start_time::date)
WHERE source_date IS NULL;

-- Step 4: Re-enable triggers
ALTER TABLE public.calendar_events ENABLE TRIGGER set_org_id;
ALTER TABLE public.calendar_events ENABLE TRIGGER sync_calendar_events_trigger;
ALTER TABLE public.calendar_events ENABLE TRIGGER trigger_sync_booking_staff_on_calendar_event;

-- Step 5: NOT NULL
ALTER TABLE public.calendar_events
  ALTER COLUMN source_date SET NOT NULL;

-- Step 6: Deduplicate before constraint
DELETE FROM public.calendar_events a
USING public.calendar_events b
WHERE a.booking_id = b.booking_id
  AND a.event_type = b.event_type
  AND a.source_date = b.source_date
  AND a.organization_id = b.organization_id
  AND a.created_at < b.created_at;

-- Step 7: Unique constraint
ALTER TABLE public.calendar_events
  ADD CONSTRAINT uq_calendar_event_identity
  UNIQUE (booking_id, event_type, source_date, organization_id);