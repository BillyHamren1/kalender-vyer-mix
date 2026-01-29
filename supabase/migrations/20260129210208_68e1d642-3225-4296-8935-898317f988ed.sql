-- Create jobs table - a simpler alternative to projects
-- Jobs only contain schedule info and staff assignments

CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT UNIQUE, -- Link to booking, one-to-one
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned', -- planned, in_progress, completed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Create policy for full access
CREATE POLICY "Allow all operations on jobs"
ON public.jobs
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Job staff assignments - which staff is assigned to which job for which date
CREATE TABLE public.job_staff_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_id, staff_id, assignment_date)
);

-- Enable RLS
ALTER TABLE public.job_staff_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for full access
CREATE POLICY "Allow all operations on job_staff_assignments"
ON public.job_staff_assignments
FOR ALL
USING (true)
WITH CHECK (true);