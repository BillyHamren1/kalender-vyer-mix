-- Migrate staff_location_history.staff_id from uuid to text
-- so legacy text-based staff IDs can be persisted

ALTER TABLE public.staff_location_history
  ALTER COLUMN staff_id TYPE text USING staff_id::text;