ALTER TABLE public.booking_products
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS tags_en text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_booking_products_tags ON public.booking_products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_booking_products_tags_en ON public.booking_products USING GIN(tags_en);