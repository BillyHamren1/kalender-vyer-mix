
-- ============================================
-- FIX PARENT-CHILD RELATIONSHIPS
-- Uses parent_package_id to correctly group products
-- ============================================

-- Step 1: Fix F12 components - all F12/20 components belong to F12 - 12x10/300
-- parent_package_id: 00b1ca3b-de36-4ec4-a7a8-dd441152748a
UPDATE booking_products
SET parent_product_id = '4be34fff-95d2-4dda-8429-b1a8e13ee255'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '00b1ca3b-de36-4ec4-a7a8-dd441152748a';

-- Step 2: Fix Multiflex components based on parent_package_id groupings
-- Each parent_package_id group needs to be linked to the appropriate Multiflex parent

-- Group: 35c8d855-e9df-4e7f-b97c-50e42702082a (M förlängningsben)
-- This is a general component, link to first Multiflex (8x3 = smallest)
UPDATE booking_products
SET parent_product_id = '29d7d95c-a4d0-4860-a9df-bc5d2f8d76a3'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '35c8d855-e9df-4e7f-b97c-50e42702082a'
  AND parent_product_id IS DISTINCT FROM '29d7d95c-a4d0-4860-a9df-bc5d2f8d76a3';

-- Group: 3d15cb86-55a8-4744-9a07-0c918bf08cd0 (RÖD components - Gavelrör, Mittstolpe, Takbalk)
-- Red components = Multiflex 8x6
UPDATE booking_products
SET parent_product_id = '5161c086-a245-49d3-8c87-54fddec1c548'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '3d15cb86-55a8-4744-9a07-0c918bf08cd0'
  AND parent_product_id IS DISTINCT FROM '5161c086-a245-49d3-8c87-54fddec1c548';

-- Group: 4c7ec3aa-8f8f-45eb-8d72-36a3675eb4ba (M Knoppstag)
-- Link to Multiflex 8x12
UPDATE booking_products
SET parent_product_id = 'd74b1c83-3a6b-4e70-aebd-f0ae655f4bfb'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '4c7ec3aa-8f8f-45eb-8d72-36a3675eb4ba'
  AND parent_product_id IS DISTINCT FROM 'd74b1c83-3a6b-4e70-aebd-f0ae655f4bfb';

-- Group: 51c3325f-6100-46e5-85ed-875c0b73e671 (M Ben, M Snabblås)
-- Link to Multiflex 8x15
UPDATE booking_products
SET parent_product_id = '3ea1ee17-c51c-4e37-9f87-156eedaacde9'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '51c3325f-6100-46e5-85ed-875c0b73e671'
  AND parent_product_id IS DISTINCT FROM '3ea1ee17-c51c-4e37-9f87-156eedaacde9';

-- Group: 5262f9ee-cbe0-4582-bc87-16cf7b252ff6 (M Mittstolpe GRÖN)
-- Link to Multiflex 8x21
UPDATE booking_products
SET parent_product_id = '029a7635-dee9-4e69-bc57-abdebd40d25d'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '5262f9ee-cbe0-4582-bc87-16cf7b252ff6'
  AND parent_product_id IS DISTINCT FROM '029a7635-dee9-4e69-bc57-abdebd40d25d';

-- Group: 5dde8204-24ed-4c1e-9aeb-f3e360f398c9 (GRÖN components - main set)
-- Link to Multiflex 8x21/300 (largest)
UPDATE booking_products
SET parent_product_id = '441b0164-2903-4f25-a3ea-4eb03100f5a0'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '5dde8204-24ed-4c1e-9aeb-f3e360f398c9'
  AND parent_product_id IS DISTINCT FROM '441b0164-2903-4f25-a3ea-4eb03100f5a0';

-- Step 3: Fix accessory (↳) products - link to nearest preceding main product
-- The accessory "Dubbeldörr till MF & F" should stay linked to Multiflex 8x21
-- (Already correct from earlier, but verify)
UPDATE booking_products
SET parent_product_id = '029a7635-dee9-4e69-bc57-abdebd40d25d'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND name LIKE '%↳%Dubbeldörr%'
  AND parent_product_id IS DISTINCT FROM '029a7635-dee9-4e69-bc57-abdebd40d25d';
