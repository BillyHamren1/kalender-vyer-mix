
-- Ta bort dubbletter ur booking_products, behåll äldsta raden per (booking_id, name)
DELETE FROM booking_products
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY booking_id, name
             ORDER BY sort_index ASC NULLS LAST, id ASC
           ) AS rn
    FROM booking_products
  ) sub
  WHERE rn > 1
);
