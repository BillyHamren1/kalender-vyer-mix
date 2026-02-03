-- Add price columns to booking_products table
ALTER TABLE public.booking_products
ADD COLUMN unit_price NUMERIC DEFAULT NULL,
ADD COLUMN total_price NUMERIC DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.booking_products.unit_price IS 'Unit price per product from external API';
COMMENT ON COLUMN public.booking_products.total_price IS 'Total price (quantity × unit_price)';