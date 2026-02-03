-- Add package component fields to booking_products table
ALTER TABLE public.booking_products 
ADD COLUMN IF NOT EXISTS is_package_component BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_package_id TEXT;

-- Add index for efficient filtering of package components
CREATE INDEX IF NOT EXISTS idx_booking_products_is_package_component 
ON public.booking_products(is_package_component) 
WHERE is_package_component = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.booking_products.is_package_component IS 'True if this product is a component of a package/kit (e.g., tent poles, roof sheets)';
COMMENT ON COLUMN public.booking_products.parent_package_id IS 'External ID of the parent package this component belongs to';