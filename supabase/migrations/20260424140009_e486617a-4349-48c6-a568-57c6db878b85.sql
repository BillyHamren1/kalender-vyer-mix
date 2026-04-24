-- Drop triggers that auto-write into warehouse_project_changes
DROP TRIGGER IF EXISTS track_warehouse_product_changes_trg ON public.booking_products;
DROP TRIGGER IF EXISTS track_warehouse_date_changes_trg ON public.bookings;

DROP FUNCTION IF EXISTS public.track_warehouse_product_changes();
DROP FUNCTION IF EXISTS public.track_warehouse_date_changes();

-- Clear out the noise that has accumulated
TRUNCATE TABLE public.warehouse_project_changes;