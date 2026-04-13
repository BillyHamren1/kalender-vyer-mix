
-- Step 1: Delete duplicate attachments, keeping the earliest uploaded one per (booking_id, url_base)
DELETE FROM booking_attachments
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id, split_part(url, '?', 1)) id
  FROM booking_attachments
  ORDER BY booking_id, split_part(url, '?', 1), uploaded_at ASC
);

-- Step 2: Add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS booking_attachments_booking_url_base_unique
ON booking_attachments (booking_id, (split_part(url, '?', 1)));
