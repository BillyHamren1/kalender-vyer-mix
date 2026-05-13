ALTER TABLE public.warehouse_assignments
  ALTER COLUMN booking_id TYPE text USING booking_id::text;