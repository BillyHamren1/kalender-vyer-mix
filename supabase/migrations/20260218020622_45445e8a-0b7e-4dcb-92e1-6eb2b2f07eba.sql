
-- Step 1: Nullify parent_product_id references that point to duplicate (soon-to-be-deleted) rows
UPDATE booking_products
SET parent_product_id = NULL
WHERE parent_product_id IN (
  SELECT id FROM booking_products
  WHERE id NOT IN (
    SELECT DISTINCT ON (booking_id, name) id
    FROM booking_products
    ORDER BY booking_id, name, sort_index ASC NULLS LAST, id ASC
  )
);

-- Step 2: Now delete the duplicates
DELETE FROM booking_products
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id, name) id
  FROM booking_products
  ORDER BY booking_id, name, sort_index ASC NULLS LAST, id ASC
);
