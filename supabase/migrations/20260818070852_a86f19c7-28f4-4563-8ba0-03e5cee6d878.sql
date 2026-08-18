ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS wms_item_type_id TEXT,
  ADD COLUMN IF NOT EXISTS wms_sku TEXT,
  ADD COLUMN IF NOT EXISTS wms_identity_source TEXT,
  ADD COLUMN IF NOT EXISTS wms_identity_needs_repair BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_packing_list_items_org_wms_item_type
  ON public.packing_list_items (organization_id, wms_item_type_id)
  WHERE wms_item_type_id IS NOT NULL;

COMMENT ON COLUMN public.packing_list_items.wms_item_type_id IS
  'Immutable-at-floor-start snapshot of canonical WMS item_types.id copied from booking_products while packing is planning.';
COMMENT ON COLUMN public.packing_list_items.wms_sku IS
  'WMS SKU snapshot for diagnostics/fallback. Never stronger identity than wms_item_type_id.';
COMMENT ON COLUMN public.packing_list_items.wms_identity_source IS
  'Identity provenance, e.g. booking_item_type_id, booking_sku_legacy, scanner_wms.';
COMMENT ON COLUMN public.packing_list_items.wms_identity_needs_repair IS
  'True when a legacy row lacks a canonical WMS item_type_id. Data-quality warning, not an operational packing block.';