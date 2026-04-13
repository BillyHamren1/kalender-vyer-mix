ALTER TABLE public.booking_attachments 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import';