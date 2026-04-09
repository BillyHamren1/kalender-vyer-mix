-- Make booking_product_id nullable for manual rows
ALTER TABLE public.packing_list_items
  ALTER COLUMN booking_product_id DROP NOT NULL;

-- Add excluded flag
ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

-- Add manual_name for manual/inventory rows
ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS manual_name text;