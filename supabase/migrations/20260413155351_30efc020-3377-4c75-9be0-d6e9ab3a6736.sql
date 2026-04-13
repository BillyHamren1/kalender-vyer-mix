-- Delete duplicate attachments, keeping only the newest per booking_id + file_name
DELETE FROM booking_attachments
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id, file_name) id
  FROM booking_attachments
  ORDER BY booking_id, file_name, uploaded_at DESC
);

-- Add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_attachments_unique_file
ON booking_attachments (booking_id, file_name);