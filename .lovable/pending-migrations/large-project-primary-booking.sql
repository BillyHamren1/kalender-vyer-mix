-- EJ APPLICERAD. Additiv migration för explicit grundbokning i grupprojekt.
-- Koden fungerar utan den (grundbokning = första medlem i sort_order).
ALTER TABLE public.large_projects
  ADD COLUMN IF NOT EXISTS primary_booking_id text REFERENCES public.bookings(id) ON DELETE SET NULL;
-- En bokning får ingå i högst ett grupprojekt (idag 0 dubbletter bland 153 medlemmar).
CREATE UNIQUE INDEX IF NOT EXISTS large_project_bookings_one_project_per_booking
  ON public.large_project_bookings (booking_id);
-- RLS: befintliga org-scopade policies på large_projects/large_project_bookings täcker kolumnen.
