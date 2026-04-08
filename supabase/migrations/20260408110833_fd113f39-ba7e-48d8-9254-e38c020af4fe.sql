
ALTER TABLE public.large_projects ADD COLUMN IF NOT EXISTS project_number TEXT;

CREATE OR REPLACE FUNCTION public.generate_large_project_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  date_prefix TEXT;
  seq_num INT;
  new_number TEXT;
BEGIN
  date_prefix := to_char(NEW.created_at, 'YYMMDD');
  SELECT COUNT(*) + 1 INTO seq_num
  FROM public.large_projects
  WHERE organization_id = NEW.organization_id
    AND to_char(created_at, 'YYMMDD') = date_prefix
    AND id != NEW.id;
  new_number := date_prefix || '-Projekt' || LPAD(seq_num::TEXT, 2, '0');
  NEW.project_number := new_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_large_project_number ON public.large_projects;
CREATE TRIGGER trg_generate_large_project_number
  BEFORE INSERT ON public.large_projects
  FOR EACH ROW
  WHEN (NEW.project_number IS NULL)
  EXECUTE FUNCTION public.generate_large_project_number();

UPDATE public.large_projects lp
SET project_number = sub.new_number
FROM (
  SELECT id,
    to_char(created_at, 'YYMMDD') || '-Projekt' || LPAD(
      (ROW_NUMBER() OVER (PARTITION BY organization_id, to_char(created_at, 'YYMMDD') ORDER BY created_at))::TEXT,
      2, '0'
    ) AS new_number
  FROM public.large_projects
  WHERE project_number IS NULL
) sub
WHERE lp.id = sub.id;
