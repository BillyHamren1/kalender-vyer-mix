-- A3 + B4 + C5: Inaktivera location_auto-trigger, lägg till constraints, skapa arrival_prompt_log

-- 1. Inaktivera triggern som auto-skapar time_reports från location_time_entries
DROP TRIGGER IF EXISTS sync_location_entry_to_time_report_trigger ON public.location_time_entries;
DROP TRIGGER IF EXISTS sync_location_to_time_report ON public.location_time_entries;
DROP TRIGGER IF EXISTS trg_sync_location_entry_to_time_report ON public.location_time_entries;

-- 2. UNIQUE partial index: max en öppen location_time_entry per (staff, location)
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_time_entries_one_open_per_staff_loc
  ON public.location_time_entries (staff_id, location_id)
  WHERE exited_at IS NULL;

-- 3. UNIQUE partial index: max en öppen time_report per (staff, report_date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_reports_one_open_per_staff_day
  ON public.time_reports (staff_id, report_date)
  WHERE end_time IS NULL;

-- 4. Ny tabell: arrival_prompt_log
CREATE TABLE IF NOT EXISTS public.arrival_prompt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  location_id uuid NOT NULL,
  arrived_at timestamptz NOT NULL,
  prompt_count integer NOT NULL DEFAULT 0,
  last_prompt_at timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arrival_prompt_log_unique_open
    UNIQUE (staff_id, location_id, arrived_at)
);

CREATE INDEX IF NOT EXISTS idx_arrival_prompt_log_unresolved
  ON public.arrival_prompt_log (organization_id, resolved, last_prompt_at)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_arrival_prompt_log_staff
  ON public.arrival_prompt_log (staff_id, resolved, arrived_at DESC);

ALTER TABLE public.arrival_prompt_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages arrival prompts"
  ON public.arrival_prompt_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Staff can view their own arrival prompts"
  ON public.arrival_prompt_log
  FOR SELECT
  USING (
    staff_id IN (
      SELECT id FROM public.staff_members WHERE user_id = auth.uid()
    )
  );