-- Create table for Large Project Gantt milestones
CREATE TABLE public.large_project_gantt_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL, -- 'establishment', 'construction', 'event', 'deestablishment'
  step_name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_milestone BOOLEAN DEFAULT false, -- true for 'construction' and 'event' (info-only)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(large_project_id, step_key)
);

-- Enable RLS
ALTER TABLE public.large_project_gantt_steps ENABLE ROW LEVEL SECURITY;

-- Create policy for access
CREATE POLICY "Allow all operations on large_project_gantt_steps" 
ON public.large_project_gantt_steps 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create updated_at trigger
CREATE TRIGGER update_large_project_gantt_steps_updated_at
BEFORE UPDATE ON public.large_project_gantt_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();