

# Fix: Inkludera alla paketmedlemmar i export och visa hierarki korrekt

## Problem
Paketmedlemmar (package components) och hierarki-information saknas pa grund av tva problem:

1. **export-bookings** skickar bara `name`, `quantity` och `notes` for produkter -- all information om priser, kostnader, hierarki (`is_package_component`, `parent_package_id`, `parent_product_id`) kastas bort. Om det externa systemet anvander var export for att synka data tillbaka sa forsvinner all hierarki-information.

2. **Projektdetalj-vyn** (`establishmentPlanningService.ts`) hamtar inte `parent_product_id` fran databasen, vilket gor att produkter inte grupperas korrekt under sina foraldrar.

3. **Flera andra vyer** saknar ocksa hierarki-falt, t.ex. `BookingProductsDialog.tsx` och `packingService.ts`.

## Losning

### 1. Fixa export-bookings -- inkludera alla produktfalt

**Fil:** `supabase/functions/export-bookings/index.ts`

Uppdatera `fetchBookingProducts` (rad 219-223) fran:
```text
return data.map(product => ({
  name: product.name,
  quantity: product.quantity,
  notes: product.notes || undefined
}))
```
Till att inkludera alla relevanta falt:
```text
return data.map(product => ({
  name: product.name,
  quantity: product.quantity,
  notes: product.notes || undefined,
  unit_price: product.unit_price || undefined,
  total_price: product.total_price || undefined,
  is_package_component: product.is_package_component || false,
  parent_package_id: product.parent_package_id || undefined,
  parent_product_id: product.parent_product_id || undefined,
  sku: product.sku || undefined,
  setup_hours: product.setup_hours || undefined,
  labor_cost: product.labor_cost || undefined,
  material_cost: product.material_cost || undefined,
  external_cost: product.external_cost || undefined,
  cost_notes: product.cost_notes || undefined
}))
```

### 2. Fixa establishmentPlanningService -- lagg till parent_product_id

**Fil:** `src/services/establishmentPlanningService.ts`

Lagg till `parent_product_id` i `.select()`-fragan (rad 127-140) sa att produktgrupperingen fungerar i projektdetaljvyn.

### 3. Fixa BookingProductsDialog -- lagg till hierarki-falt

**Fil:** `src/components/Calendar/BookingProductsDialog.tsx`

Lagg till `parent_product_id`, `parent_package_id` och `is_package_component` i fragan (rad 87-88).

### 4. Fixa packingService -- lagg till saknade falt

**Fil:** `src/services/packingService.ts`

Lagg till `parent_package_id` och `is_package_component` i fragan (rad 231-232).

## Filer som andras

| Fil | Andring |
|-----|---------|
| `supabase/functions/export-bookings/index.ts` | Inkludera alla produktfalt i export-payloaden |
| `src/services/establishmentPlanningService.ts` | Lagg till `parent_product_id` i select |
| `src/components/Calendar/BookingProductsDialog.tsx` | Lagg till hierarki-falt i select |
| `src/services/packingService.ts` | Lagg till `parent_package_id`, `is_package_component` i select |

## Resultat
- Export-funktionen skickar komplett produktdata inklusive paketmedlemmar och hierarki
- Projektdetaljvyn visar produkter korrekt grupperade under sina foraldrar
- Kalender-dialogen visar hierarki korrekt
- Packningsvyn visar komplett hierarki

