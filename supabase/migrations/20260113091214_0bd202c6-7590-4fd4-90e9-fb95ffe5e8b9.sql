-- Create table for task comments
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES public.staff_members(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);

-- Enable RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now since no auth)
CREATE POLICY "Allow all access to task_comments" 
ON public.task_comments 
FOR ALL 
USING (true) 
WITH CHECK (true);