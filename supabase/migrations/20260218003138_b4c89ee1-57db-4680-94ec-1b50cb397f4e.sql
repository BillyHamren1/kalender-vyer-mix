-- Rensa befintliga duplikat i booking_attachments, behåll äldsta per (booking_id, url)
DELETE FROM booking_attachments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY booking_id, url ORDER BY uploaded_at ASC
    ) AS rn
    FROM booking_attachments
  ) sub
  WHERE rn > 1
);