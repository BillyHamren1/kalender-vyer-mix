-- Step 1: Clear parent_product_id references first to avoid FK constraint issues
UPDATE booking_products SET parent_product_id = NULL;

-- Step 2: Delete duplicates (keep one per booking+name)
WITH ranked AS (
  SELECT id, booking_id, name,
    ROW_NUMBER() OVER (PARTITION BY booking_id, name ORDER BY id::text) as rn
  FROM booking_products
)
DELETE FROM booking_products WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 3: Clean up any orphaned packing_list_items
DELETE FROM packing_list_items
WHERE booking_product_id NOT IN (
  SELECT id FROM booking_products
);