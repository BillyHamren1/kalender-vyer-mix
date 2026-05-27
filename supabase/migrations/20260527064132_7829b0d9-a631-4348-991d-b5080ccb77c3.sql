ALTER TABLE public.large_project_booking_plan_items
  ADD COLUMN IF NOT EXISTS booking_product_id uuid NULL
    REFERENCES public.booking_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lp_plan_items_booking_product
  ON public.large_project_booking_plan_items(booking_product_id)
  WHERE booking_product_id IS NOT NULL;