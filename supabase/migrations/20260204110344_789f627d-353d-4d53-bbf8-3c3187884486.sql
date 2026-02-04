-- Step 1: Create a temp table to track which products to keep (first occurrence of each unique combo)
CREATE TEMP TABLE products_to_keep AS
SELECT DISTINCT ON (booking_id, name, COALESCE(parent_product_id::text, 'root'))
  id
FROM booking_products
ORDER BY booking_id, name, COALESCE(parent_product_id::text, 'root'), id;

-- Step 2: Update child products to point to the "keeper" parent instead of duplicate parent
UPDATE booking_products bp
SET parent_product_id = keeper_mapping.keeper_id
FROM (
  SELECT 
    dup.id as duplicate_id,
    keep.id as keeper_id
  FROM booking_products dup
  JOIN booking_products keep ON 
    dup.booking_id = keep.booking_id 
    AND dup.name = keep.name 
    AND COALESCE(dup.parent_product_id::text, 'root') = COALESCE(keep.parent_product_id::text, 'root')
  WHERE dup.id NOT IN (SELECT id FROM products_to_keep)
    AND keep.id IN (SELECT id FROM products_to_keep)
) keeper_mapping
WHERE bp.parent_product_id = keeper_mapping.duplicate_id;

-- Step 3: Delete packing list items that reference duplicates
DELETE FROM packing_list_items
WHERE booking_product_id NOT IN (SELECT id FROM products_to_keep);

-- Step 4: Delete the duplicate products
DELETE FROM booking_products
WHERE id NOT IN (SELECT id FROM products_to_keep);

-- Step 5: Clean up temp table
DROP TABLE products_to_keep