
-- Add large_project_id column to establishment_tasks
ALTER TABLE public.establishment_tasks 
  ADD COLUMN large_project_id uuid REFERENCES public.large_projects(id) ON DELETE CASCADE;

-- Make booking_id nullable  
ALTER TABLE public.establishment_tasks 
  ALTER COLUMN booking_id DROP NOT NULL;

-- Add constraint: must have either booking_id or large_project_id
ALTER TABLE public.establishment_tasks 
  ADD CONSTRAINT establishment_tasks_parent_check 
  CHECK (booking_id IS NOT NULL OR large_project_id IS NOT NULL);

-- Add index for large_project_id queries
CREATE INDEX idx_establishment_tasks_large_project_id 
  ON public.establishment_tasks(large_project_id) 
  WHERE large_project_id IS NOT NULL;

-- RLS policy: allow authenticated users to manage tasks by large_project_id
CREATE POLICY "Users can manage establishment tasks for large projects"
  ON public.establishment_tasks
  FOR ALL
  TO authenticated
  USING (large_project_id IS NOT NULL)
  WITH CHECK (large_project_id IS NOT NULL);
