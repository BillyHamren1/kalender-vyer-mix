-- Create enum for availability types
CREATE TYPE availability_type AS ENUM ('available', 'unavailable', 'blocked');

-- Create staff_availability table
CREATE TABLE IF NOT EXISTS public.staff_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id TEXT NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  availability_type availability_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add is_active column to staff_members
ALTER TABLE public.staff_members 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_availability_staff_id ON public.staff_availability(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_availability_dates ON public.staff_availability(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_staff_members_is_active ON public.staff_members(is_active);

-- Enable RLS on staff_availability
ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for staff_availability
CREATE POLICY "Allow all operations on staff_availability"
  ON public.staff_availability
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for updated_at on staff_availability
CREATE TRIGGER update_staff_availability_updated_at
  BEFORE UPDATE ON public.staff_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all existing staff to be active
UPDATE public.staff_members SET is_active = true WHERE is_active IS NULL;