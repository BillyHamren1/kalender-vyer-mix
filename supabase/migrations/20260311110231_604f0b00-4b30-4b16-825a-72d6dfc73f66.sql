CREATE OR REPLACE FUNCTION fix_booking_products_org()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE booking_products bp
  SET organization_id = b.organization_id
  FROM bookings b
  WHERE b.id = bp.booking_id
    AND bp.organization_id != b.organization_id;
END;
$$;

SELECT fix_booking_products_org();

DROP FUNCTION fix_booking_products_org();