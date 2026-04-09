
-- Add soft-delete column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add soft-delete column to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add soft-delete column to large_projects
ALTER TABLE public.large_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create audit log table
CREATE TABLE public.project_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_type TEXT NOT NULL CHECK (project_type IN ('small', 'medium', 'large')),
  action TEXT NOT NULL,
  booking_id TEXT,
  performed_by TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add org_id trigger
CREATE TRIGGER set_project_audit_log_org
  BEFORE INSERT ON public.project_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_id();

-- Enable RLS
ALTER TABLE public.project_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can read audit logs"
  ON public.project_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin')
  );

-- Any authenticated user can insert audit entries (the service layer controls when)
CREATE POLICY "Authenticated users can create audit entries"
  ON public.project_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
  );

-- Index for fast lookups
CREATE INDEX idx_project_audit_log_project ON public.project_audit_log (project_id, project_type);
CREATE INDEX idx_project_audit_log_org ON public.project_audit_log (organization_id);
CREATE INDEX idx_projects_deleted_at ON public.projects (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_deleted_at ON public.jobs (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_large_projects_deleted_at ON public.large_projects (deleted_at) WHERE deleted_at IS NULL;
