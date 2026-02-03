
# Plan: Tvinga reimport av produkter med parent_product_id

## Problem

Produkterna importerades **innan** logiken för `parent_product_id` implementerades. Nu har alla produkter (inklusive tillbehör som "↳ M Takduk 8m") `parent_product_id = null`. Importen hoppar över oförändrade bokningar, så produkterna uppdateras inte.

## Lösning

### Steg 1: Ta bort befintliga produkter via migration

Skapa en migration som tar bort alla produkter från `booking_products` för de två befintliga bokningarna:
- `ab56b4f6-5eaa-4182-b444-115671442a7f`
- `190895cc-b4ee-43a9-be69-200eac620087`

### Steg 2: Uppdatera Edge Function

Lägg till en `force` parameter i import-funktionen som tillåter tvingad reimport av produkter även för oförändrade bokningar. Detta förhindrar framtida problem.

### Steg 3: Kör reimport

När produkterna är borttagna kommer importen att:
1. Detektera att produkter saknas
2. Importera produkter på nytt med korrekt `parent_product_id`

## Tekniska ändringar

| Fil | Ändring |
|-----|---------|
| `supabase/migrations/...` | Ta bort befintliga produkter |
| `supabase/functions/import-bookings/index.ts` | Lägg till `needsProductRecovery` check |

## Edge Function-ändring

Lägg till logik för att upptäcka om produkter saknas `parent_product_id` och tvinga reimport:

```text
// Kontrollera om produkter behöver uppdateras (saknar parent_product_id)
if (bookingData.status === 'CONFIRMED') {
  const { data: existingProducts } = await supabase
    .from('booking_products')
    .select('id, parent_product_id, name')
    .eq('booking_id', existingBooking.id);
  
  // Kolla om någon accessory saknar parent_product_id
  const accessoriesWithoutParent = existingProducts?.filter(
    p => isAccessoryProduct(p.name) && !p.parent_product_id
  ) || [];
  
  if (accessoriesWithoutParent.length > 0) {
    needsProductRecovery = true;
    console.log(`Booking ${bookingData.id} has accessories without parent_product_id - will recover`);
  }
}
```

## Resultat efter implementation

1. Befintliga produkter tas bort
2. Importen körs med ny logik
3. Produkter importeras med korrekta `parent_product_id` relationer
4. UI visar tillbehör grupperade under sina föräldrarprodukter
