
-- Create establishment_subtasks table for detailed sub-task planning on Gantt bars
CREATE TABLE public.establishment_subtasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id text NOT NULL,
  parent_task_id text NOT NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  assigned_to text REFERENCES public.staff_members(id),
  completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.establishment_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on establishment_subtasks"
ON public.establishment_subtasks FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_establishment_subtasks_booking_task 
ON public.establishment_subtasks(booking_id, parent_task_id);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE establishment_subtasks;
