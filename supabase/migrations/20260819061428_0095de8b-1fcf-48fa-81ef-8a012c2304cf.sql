ALTER TABLE public.booking_products
  ADD COLUMN IF NOT EXISTS source_missing_since timestamptz;

COMMENT ON COLUMN public.booking_products.source_missing_since IS
  'Sätts när produkten saknas i Bookings produktlista men inte får raderas (products_complete saknas). NULL = finns i källan.';

CREATE INDEX IF NOT EXISTS idx_booking_products_source_missing
  ON public.booking_products (booking_id)
  WHERE source_missing_since IS NOT NULL;