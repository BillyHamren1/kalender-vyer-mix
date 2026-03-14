ALTER TABLE public.direct_messages 
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS booking_id text;

CREATE INDEX IF NOT EXISTS idx_direct_messages_booking_id 
  ON public.direct_messages(booking_id) 
  WHERE booking_id IS NOT NULL;