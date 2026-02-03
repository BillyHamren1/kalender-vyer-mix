-- Ta bort befintliga produkter för de två bokningarna så att de kan reimporteras med korrekta parent_product_id
DELETE FROM public.booking_products 
WHERE booking_id IN (
  'ab56b4f6-5eaa-4182-b444-115671442a7f',
  '190895cc-b4ee-43a9-be69-200eac620087'
);