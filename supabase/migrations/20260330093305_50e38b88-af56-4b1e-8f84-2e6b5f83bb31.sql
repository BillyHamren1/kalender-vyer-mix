
-- Table for task-level comments on establishment_tasks
CREATE TABLE public.establishment_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.establishment_tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id)
);

-- Indexes
CREATE INDEX idx_establishment_task_comments_task_id ON public.establishment_task_comments(task_id);
CREATE INDEX idx_establishment_task_comments_org ON public.establishment_task_comments(organization_id);

-- Auto-set organization_id
CREATE TRIGGER set_organization_id_establishment_task_comments
  BEFORE INSERT ON public.establishment_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- Auto-update updated_at
CREATE TRIGGER update_updated_at_establishment_task_comments
  BEFORE UPDATE ON public.establishment_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.establishment_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments in their org"
  ON public.establishment_task_comments
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert comments in their org"
  ON public.establishment_task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update own comments"
  ON public.establishment_task_comments
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON public.establishment_task_comments
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());
