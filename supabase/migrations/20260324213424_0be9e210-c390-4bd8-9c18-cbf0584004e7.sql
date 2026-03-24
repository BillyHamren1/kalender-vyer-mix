
-- Step 1: Add new column referencing project_supplier_links
ALTER TABLE public.project_messages
  ADD COLUMN project_supplier_link_id UUID REFERENCES public.project_supplier_links(id) ON DELETE SET NULL;

-- Step 2: Best-effort migration - match old related_supplier_id (project_suppliers) to project_supplier_links
-- by matching project_id + supplier_id where project_suppliers.id was used as supplier_id in links
UPDATE public.project_messages pm
SET project_supplier_link_id = psl.id
FROM public.project_supplier_links psl
WHERE pm.related_supplier_id IS NOT NULL
  AND pm.related_supplier_id = psl.id;

-- Step 3: Drop old column and its FK
ALTER TABLE public.project_messages
  DROP COLUMN related_supplier_id;
