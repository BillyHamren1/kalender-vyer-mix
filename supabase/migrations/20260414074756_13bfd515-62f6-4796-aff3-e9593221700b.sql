-- Add is_internal column to projects
ALTER TABLE public.projects ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT false;

-- Add location_id column to link internal projects to organization_locations
ALTER TABLE public.projects ADD COLUMN location_id UUID REFERENCES public.organization_locations(id) ON DELETE SET NULL;

-- Create the permanent Lager project for the existing organization
INSERT INTO public.projects (name, client, status, is_internal, location_id, organization_id)
SELECT 
  'Lager',
  'Intern',
  'in_progress',
  true,
  '0b9d94df-e46e-4987-8b7f-ef04b663dac5',
  'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects WHERE is_internal = true AND name = 'Lager' AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);