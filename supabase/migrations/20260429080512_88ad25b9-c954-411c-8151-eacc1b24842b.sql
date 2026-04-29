ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS quantity_returned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by text;

COMMENT ON COLUMN public.packing_list_items.quantity_returned IS 'Number of units scanned back to the shelf during the return (IN) flow. Never exceeds quantity_packed.';
COMMENT ON COLUMN public.packing_list_items.returned_at IS 'Timestamp of last return scan for this row.';
COMMENT ON COLUMN public.packing_list_items.returned_by IS 'Identifier (user id or name) of the staff who last scanned the item back.';

-- Index to speed up "fully returned?" checks per packing
CREATE INDEX IF NOT EXISTS idx_packing_list_items_packing_returned
  ON public.packing_list_items (packing_id)
  WHERE quantity_returned > 0;