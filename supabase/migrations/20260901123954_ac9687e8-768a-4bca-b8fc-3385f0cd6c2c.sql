DO $$
DECLARE
  v_booking text;
BEGIN
  SELECT id::text INTO v_booking FROM public.bookings WHERE booking_number = '2603-113' LIMIT 1;
  IF v_booking IS NULL THEN RAISE EXCEPTION 'booking 2603-113 not found'; END IF;

  CREATE TEMP TABLE _legacy_cmp ON COMMIT DROP AS
  SELECT bp.id
  FROM public.booking_products bp
  WHERE bp.booking_id::text = v_booking
    AND bp.sync_key IS NULL
    AND bp.is_package_component = true
    AND NOT EXISTS (
      SELECT 1 FROM public.packing_list_items pli
      WHERE pli.booking_product_id = bp.id AND coalesce(pli.quantity_packed,0) > 0
    );

  DELETE FROM public.packing_list_item_allocations a
  USING public.packing_list_items pli
  WHERE a.packing_list_item_id = pli.id
    AND pli.booking_product_id IN (SELECT id FROM _legacy_cmp);

  DELETE FROM public.packing_list_items pli
  WHERE pli.booking_product_id IN (SELECT id FROM _legacy_cmp);

  DELETE FROM public.booking_products bp
  WHERE bp.id IN (SELECT id FROM _legacy_cmp);
END $$;