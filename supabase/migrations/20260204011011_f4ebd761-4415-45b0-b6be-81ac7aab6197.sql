-- Add approval fields to time_reports table
ALTER TABLE public.time_reports 
ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by text;

-- Add an index for quick filtering of pending reports
CREATE INDEX IF NOT EXISTS idx_time_reports_approved ON public.time_reports(approved);

-- Comment for documentation
COMMENT ON COLUMN public.time_reports.approved IS 'Whether the time report has been approved by a project leader';
COMMENT ON COLUMN public.time_reports.approved_at IS 'Timestamp when the report was approved';
COMMENT ON COLUMN public.time_reports.approved_by IS 'Name of the person who approved the report';