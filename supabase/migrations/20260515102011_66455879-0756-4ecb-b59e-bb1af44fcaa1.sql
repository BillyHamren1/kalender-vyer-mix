ALTER TABLE public._backup_projects_phase_dates_20260515 ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only service_role (dry-run edge function + admin) can read.