-- Add columns for external transport companies
ALTER TABLE public.vehicles 
ADD COLUMN is_external BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN company_name TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.vehicles.is_external IS 'True if this is an external transport company, false for internal vehicles';
COMMENT ON COLUMN public.vehicles.company_name IS 'Name of the external transport company (only used when is_external = true)';