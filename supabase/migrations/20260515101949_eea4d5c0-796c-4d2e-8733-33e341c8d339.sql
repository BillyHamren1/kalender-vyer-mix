-- Backup snapshot of projects.<phase>date before phase-date consolidation v1.
-- READ-ONLY snapshot. No data is changed by this migration.
CREATE TABLE IF NOT EXISTS public._backup_projects_phase_dates_20260515 AS
SELECT
  id            AS project_id,
  booking_id,
  organization_id,
  rigdaydate,
  eventdate,
  rigdowndate,
  updated_at,
  now()         AS snapshot_taken_at
FROM public.projects;

-- Add an index so the dry-run / migration B can join fast.
CREATE INDEX IF NOT EXISTS ix_backup_projects_phase_dates_20260515_booking
  ON public._backup_projects_phase_dates_20260515 (booking_id);

COMMENT ON TABLE public._backup_projects_phase_dates_20260515 IS
'Read-only snapshot of projects.{rigdaydate,eventdate,rigdowndate} taken before phase_date_consolidation_v1. Safe to drop once consolidation is verified stable.';