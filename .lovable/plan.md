

# Fix: 540 booking_products har fortfarande fel organization_id

## Problem
De 4 migrationerna som skapades tidigare innehåller alla samma `UPDATE`-sats, men den blockeras av RLS-policyn `org_filter_booking_products` som kräver att `organization_id` matchar användarens org. En UPDATE som ändrar `organization_id` till ett annat värde blockeras av `WITH CHECK`-uttrycket.

**Data just nu:**
- 224 produkter: korrekt org (Frans August)
- 540 produkter: fel org (Doomie Design) men tillhör Frans August-bokningar
- 64 produkter: korrekt Doomie Design

## Åtgärd

### Steg 1: Ta bort de 4 duplicerade tomma migrationerna
De gör samma sak och bör rensas.

### Steg 2: Skapa EN ny migration med `SECURITY DEFINER`-wrapper
Eftersom RLS blockerar direkt UPDATE måste vi wrappa i en temporär `SECURITY DEFINER`-funktion som kör med ägarens privilegier:

```sql
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
```

Detta kringgår RLS och fixar alla 540 felaktiga rader i en körning.

