-- Add local_tags column for manually-set tags (separate from external Booking tags)
ALTER TABLE public.booking_products
  ADD COLUMN IF NOT EXISTS local_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_booking_products_local_tags
  ON public.booking_products USING GIN (local_tags);