ALTER TABLE public.staff_day_report_cache
ADD COLUMN IF NOT EXISTS workday_allocation_segments_json JSONB;