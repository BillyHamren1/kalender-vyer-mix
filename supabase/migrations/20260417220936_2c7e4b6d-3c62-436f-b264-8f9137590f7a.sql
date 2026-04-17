-- Remove duplicate UNIQUE partial index on location_time_entries.
-- We have two functionally identical indexes:
--   uniq_open_location_entry_per_staff
--   idx_location_time_entries_one_open_per_staff_loc
-- Keep the descriptive one, drop the older duplicate.
DROP INDEX IF EXISTS public.uniq_open_location_entry_per_staff;