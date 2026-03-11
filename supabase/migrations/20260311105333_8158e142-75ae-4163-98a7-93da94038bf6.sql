UPDATE booking_products bp
SET organization_id = b.organization_id
FROM bookings b
WHERE b.id = bp.booking_id
  AND bp.organization_id != b.organization_id;