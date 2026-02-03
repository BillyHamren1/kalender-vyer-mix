
# Plan: Lägg till SKU-nummer i bokningsimport

## Analys av nuläget

### Vad API:n skickar (bekräftat från dina loggar)
```json
{
  "product_name": "⦿ M Ben",
  "quantity": 6,
  "inventory_item_type_id": "1616390d-1a55-4d50-912a-c615bc77c4ba",  ← Finns!
  "is_package_component": true,
  "parent_package_id": "5dde8204-24ed-4c1e-9aeb-f3e360f398c9"
}
```

### Vad systemet sparar idag
- `name`, `quantity`, `notes`
- `unit_price`, `total_price`
- `is_package_component`, `parent_package_id`, `parent_product_id`

**SKU/inventory_item_type_id ignoreras helt!**

---

## Ändringar

### 1. Databas-migration
Lägg till `sku` kolumn i `booking_products`:

```sql
ALTER TABLE booking_products 
ADD COLUMN sku TEXT;
```

### 2. Edge Function (`import-bookings`)

**ProductData interface** (rad 359-369):
```typescript
interface ProductData {
  // ...befintliga fält
  sku?: string;  // Ny!
}
```

**Produktmappning** (rad 1086-1097):
```typescript
const productData: ProductData = {
  // ...befintliga fält
  sku: product.sku || product.inventory_item_type_id || product.article_number || null
}
```

Samma logik ska tillämpas på "Product Recovery"-sektionen (~rad 870-920).

### 3. Frontend-typer

**`src/types/booking.ts`** - BookingProduct:
```typescript
export interface BookingProduct {
  // ...befintliga fält
  sku?: string;
}
```

**`src/types/packing.ts`** - PackingListItem.product:
```typescript
product?: {
  // ...befintliga fält
  sku: string | null;  // Ny!
}
```

### 4. Transformering

**`src/services/booking/bookingUtils.ts`**:
```typescript
products: dbBooking.booking_products?.map((product: any) => ({
  // ...befintliga fält
  sku: product.sku || undefined
}))
```

### 5. UI - Packlistan

**`src/components/packing/PackingListItemRow.tsx`**:
Visa SKU bredvid produktnamnet om det finns:

```tsx
<p className="...">
  {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
  {(item.product?.name || "Okänd produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
  {item.product?.sku && (
    <span className="text-xs text-muted-foreground ml-2">
      [{item.product.sku.substring(0, 8)}]
    </span>
  )}
</p>
```

---

## Sammanfattning av filer som ändras

| Fil | Ändring |
|-----|---------|
| Migration | Ny kolumn `sku` i `booking_products` |
| `supabase/functions/import-bookings/index.ts` | Extrahera SKU från API |
| `src/types/booking.ts` | Lägg till `sku` i BookingProduct |
| `src/types/packing.ts` | Lägg till `sku` i product-objektet |
| `src/services/booking/bookingUtils.ts` | Mappa SKU i transformering |
| `src/components/packing/PackingListItemRow.tsx` | Visa SKU i UI |

---

## Resultat efter implementation

Packlistan kommer visa:
```
☐ M Ben [1616390d]  6 st
☐ M Sidorör [a7e2b1c9]  12 st
```

SKU:n (eller inventory_item_type_id) visas som en kort kod efter produktnamnet.
