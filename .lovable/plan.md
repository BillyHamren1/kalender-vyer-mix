
# Plan: Lägg till SKU-nummer i bokningsimport ✅ IMPLEMENTERAD

## Genomförda ändringar

### 1. ✅ Databas-migration
Lagt till `sku` kolumn i `booking_products` (TEXT).

### 2. ✅ Edge Function (`import-bookings`)
- Uppdaterat `ProductData` interface med `sku?: string`
- Produktmappning extraherar nu SKU: `product.sku || product.inventory_item_type_id || product.article_number || null`
- Både huvudimport och product recovery hanterar SKU

### 3. ✅ Frontend-typer
- `src/types/booking.ts`: Lagt till `sku?: string` i BookingProduct
- `src/types/packing.ts`: Lagt till `sku: string | null` i product-objektet

### 4. ✅ Transformering
- `src/services/booking/bookingUtils.ts`: Mappar `sku` från databas

### 5. ✅ UI - Packlistan
- `src/components/packing/PackingListItemRow.tsx`: Visar SKU i hakparenteser efter produktnamnet

---

## Resultat

Vid nästa import kommer produkter med SKU/inventory_item_type_id att sparas och visas i packlistan:
```
☐ M Ben [1616390d]  6 st
☐ M Sidorör [a7e2b1c9]  12 st
```
