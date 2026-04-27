-- Add subdivision tracking to time_reports
ALTER TABLE public.time_reports
  ADD COLUMN IF NOT EXISTS is_subdivision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_time_report_id uuid NULL
    REFERENCES public.time_reports(id) ON DELETE CASCADE;

-- Index for fast lookup of breakdown rows belonging to a project total
CREATE INDEX IF NOT EXISTS idx_time_reports_parent
  ON public.time_reports(parent_time_report_id)
  WHERE parent_time_report_id IS NOT NULL;

-- Index for filtering out subdivisions in payroll/invoicing queries
CREATE INDEX IF NOT EXISTS idx_time_reports_is_subdivision
  ON public.time_reports(is_subdivision)
  WHERE is_subdivision = true;

-- Safety: a subdivision must reference a parent; a parent must NOT itself be a subdivision
ALTER TABLE public.time_reports
  DROP CONSTRAINT IF EXISTS time_reports_subdivision_requires_parent;
ALTER TABLE public.time_reports
  ADD CONSTRAINT time_reports_subdivision_requires_parent
  CHECK (
    (is_subdivision = false AND parent_time_report_id IS NULL)
    OR
    (is_subdivision = true  AND parent_time_report_id IS NOT NULL)
  );

COMMENT ON COLUMN public.time_reports.is_subdivision IS
  'True when this row is a per-address breakdown of a large_project total. Never summed with parent.';
COMMENT ON COLUMN public.time_reports.parent_time_report_id IS
  'The authoritative project-total time_report this breakdown row belongs to.';