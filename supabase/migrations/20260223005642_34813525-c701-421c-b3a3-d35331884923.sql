ALTER TABLE public.staff_members
ADD COLUMN employment_type text NOT NULL DEFAULT 'employed';

COMMENT ON COLUMN public.staff_members.employment_type IS 'employed = anställd, contracted = inhyrd';