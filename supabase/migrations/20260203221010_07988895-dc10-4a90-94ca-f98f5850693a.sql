-- Fix parent_product_id relationships based on product name patterns
-- Main products (no prefix) should have NULL parent_product_id
-- Package components (⦿ prefix) and accessories (↳ prefix) need to link to their parent

-- First, identify all main products (packages) - those without ⦿ or ↳ prefix
-- For each booking, we need to re-establish the hierarchy

-- Step 1: Get all products that need parent assignment, ordered by their position
-- Package components (⦿) should link to the previous main product in sequence

WITH product_order AS (
  SELECT 
    bp.id,
    bp.booking_id,
    bp.name,
    bp.is_package_component,
    -- Determine if this is a main product (no special prefix)
    CASE 
      WHEN bp.name NOT LIKE '  ⦿%' AND bp.name NOT LIKE '  ↳%' AND bp.name NOT LIKE '↳%' THEN true
      ELSE false
    END as is_main_product,
    ROW_NUMBER() OVER (PARTITION BY bp.booking_id ORDER BY bp.id::text) as seq
  FROM booking_products bp
),
main_products AS (
  SELECT id, booking_id, name, seq
  FROM product_order
  WHERE is_main_product = true
),
child_products AS (
  SELECT 
    c.id,
    c.booking_id,
    c.name,
    c.seq,
    -- Find the closest preceding main product
    (
      SELECT m.id 
      FROM main_products m 
      WHERE m.booking_id = c.booking_id AND m.seq < c.seq
      ORDER BY m.seq DESC 
      LIMIT 1
    ) as parent_id
  FROM product_order c
  WHERE c.is_main_product = false
)
UPDATE booking_products bp
SET parent_product_id = cp.parent_id
FROM child_products cp
WHERE bp.id = cp.id AND cp.parent_id IS NOT NULL;