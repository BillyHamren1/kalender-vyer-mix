
-- Create activity log table for project history tracking
CREATE TABLE public.project_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_activity_log ENABLE ROW LEVEL SECURITY;

-- Allow all operations (consistent with other project tables)
CREATE POLICY "Allow all operations on project_activity_log"
  ON public.project_activity_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups by project
CREATE INDEX idx_project_activity_log_project_id ON public.project_activity_log(project_id);
CREATE INDEX idx_project_activity_log_created_at ON public.project_activity_log(created_at DESC);
