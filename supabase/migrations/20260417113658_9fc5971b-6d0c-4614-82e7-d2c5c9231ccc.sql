-- 1. direct_messages: add receipts + per-user archive
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_archived_by text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_unread
  ON public.direct_messages (recipient_id) WHERE read_at IS NULL;

-- Backfill: existing read messages get a synthetic read_at = created_at
UPDATE public.direct_messages
  SET read_at = created_at
  WHERE is_read = true AND read_at IS NULL;

-- All existing messages are considered delivered
UPDATE public.direct_messages
  SET delivered_at = created_at
  WHERE delivered_at IS NULL;

-- 2. job_messages: same per-user receipts + archive
ALTER TABLE public.job_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_by jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived_by text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.job_messages
  SET delivered_at = created_at
  WHERE delivered_at IS NULL;

-- 3. Realtime
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.job_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'direct_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'job_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.job_messages';
  END IF;
END $$;

-- 4. Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Chat attachments are publicly readable" ON storage.objects;
CREATE POLICY "Chat attachments are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Authenticated users can update chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can update chat attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chat-attachments');