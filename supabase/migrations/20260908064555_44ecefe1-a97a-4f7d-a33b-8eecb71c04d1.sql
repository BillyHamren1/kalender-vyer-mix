ALTER TABLE public.packing_list_items ADD COLUMN IF NOT EXISTS wms_line_id text;
CREATE UNIQUE INDEX IF NOT EXISTS packing_list_items_packing_wms_line_uniq
  ON public.packing_list_items (packing_id, wms_line_id)
  WHERE wms_line_id IS NOT NULL;