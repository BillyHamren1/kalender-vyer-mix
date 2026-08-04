ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_applied_source_revision jsonb;

COMMENT ON COLUMN public.bookings.last_applied_source_revision IS
  'Dedikerad, authoritative canonical source-revision senast applicerad på bokningen. Form: {"source_updated_at": text|null, "source_version": integer|null, "source_status": text, "change_type": text, "revision": text, "logged_at": timestamptz}. Ersätter booking_changes som revisionskälla (tar bort historik-taket och gör both-fallet naturligt).';