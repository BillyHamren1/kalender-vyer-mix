ALTER TABLE public.workdays
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approval_override_reason text;

CREATE INDEX IF NOT EXISTS idx_workdays_approved_at ON public.workdays(approved_at) WHERE approved_at IS NOT NULL;