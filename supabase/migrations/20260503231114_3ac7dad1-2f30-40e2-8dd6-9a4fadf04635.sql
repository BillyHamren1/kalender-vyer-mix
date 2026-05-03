-- Add QR code field to packing_parcels for free-form QR-stickered physical parcels.
-- Same physical QR can be reused across different bookings over time, but cannot
-- appear twice on the same packing (per-packing uniqueness only).
ALTER TABLE public.packing_parcels
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS is_qr_only BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS packing_parcels_packing_qr_unique
  ON public.packing_parcels (packing_id, qr_code)
  WHERE qr_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS packing_parcels_qr_code_idx
  ON public.packing_parcels (organization_id, qr_code)
  WHERE qr_code IS NOT NULL;