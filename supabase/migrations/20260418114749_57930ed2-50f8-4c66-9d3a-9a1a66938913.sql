-- Step 3: server-anchored start for booking/project/location timers
--
-- 1. Idempotency: a client_dedupe_key uniquely identifies a single user
--    intent ("start this timer") across retries. Same key => same row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lte_client_dedupe_key
  ON public.location_time_entries (client_dedupe_key)
  WHERE client_dedupe_key IS NOT NULL;

-- 2. Partial unique: max one OPEN entry per (staff, booking)
--    Mirrors the existing rule for (staff, location).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lte_one_open_per_staff_booking
  ON public.location_time_entries (staff_id, booking_id)
  WHERE exited_at IS NULL AND booking_id IS NOT NULL;

-- 3. Partial unique: max one OPEN entry per (staff, large_project)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lte_one_open_per_staff_project
  ON public.location_time_entries (staff_id, large_project_id)
  WHERE exited_at IS NULL AND large_project_id IS NOT NULL;

-- 4. Helpful indexes for restoration queries on app start.
CREATE INDEX IF NOT EXISTS idx_lte_open_by_staff
  ON public.location_time_entries (staff_id)
  WHERE exited_at IS NULL;