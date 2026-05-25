ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rental_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bookings.rental_only IS 'True = endast uthyrning. Ingen rigg upp/ner utförs. Hanteras som leverans ut + retur in via lagerkolumnen.';
CREATE INDEX IF NOT EXISTS idx_bookings_rental_only ON public.bookings (organization_id, rental_only) WHERE rental_only = true;