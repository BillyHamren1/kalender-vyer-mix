ALTER TABLE public.establishment_tasks
ADD COLUMN IF NOT EXISTS calendar_event_id uuid NULL
REFERENCES public.calendar_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_establishment_tasks_calendar_event_id
ON public.establishment_tasks(calendar_event_id)
WHERE calendar_event_id IS NOT NULL;