-- Align job_messages with direct_messages for attachment support
ALTER TABLE public.job_messages
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text;

-- Allow empty content when an attachment is present
ALTER TABLE public.job_messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.job_messages
  ADD CONSTRAINT job_messages_content_or_attachment_check
  CHECK (
    (content IS NOT NULL AND length(trim(content)) > 0)
    OR file_url IS NOT NULL
  );