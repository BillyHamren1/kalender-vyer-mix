
# Plan: Logga produktpayload & lägg till prisfält

## Sammanfattning
1. Lägg till detaljerad loggning i `import-bookings` för att visa exakt vilka fält som kommer från det externa API:et för varje produkt
2. Lägg till `unit_price` och `total_price` kolumner i `booking_products` tabellen
3. Uppdatera importen för att spara prisdata om det finns tillgängligt

---

## Ändringar

### 1. Databasmigrering - Lägg till priskolumner

Skapa ny migration som lägger till:
- `unit_price` (NUMERIC) - Enhetspris per produkt
- `total_price` (NUMERIC) - Totalpris (quantity × unit_price)

```text
booking_products
├── id (UUID, PK)
├── booking_id (UUID, FK)
├── name (TEXT)
├── quantity (NUMERIC)
├── notes (TEXT)
├── unit_price (NUMERIC) ← NY
└── total_price (NUMERIC) ← NY
```

### 2. Edge Function - Detaljerad loggning

I `import-bookings/index.ts`, lägg till loggning som visar hela produktobjektet från API:et:

```text
// Logga ALLA fält som kommer från externa API:et
console.log(`RAW PRODUCT DATA from external API:`, JSON.stringify(product, null, 2))
```

Detta visar exakt vilka nycklar och värden som finns tillgängliga (t.ex. `price`, `unit_price`, `rental_price`, `cost`, etc.).

### 3. Edge Function - Uppdatera ProductData interface

Utöka interfacet för att inkludera prisfält:

```text
interface ProductData {
  booking_id: string;
  name: string;
  quantity: number;
  notes?: string;
  unit_price?: number;  ← NY
  total_price?: number; ← NY
}
```

### 4. Edge Function - Spara prisdata

Uppdatera produktimporten för att extrahera och spara prisdata:

```text
const productData: ProductData = {
  booking_id: bookingData.id,
  name: product.name || product.product_name || 'Unknown Product',
  quantity: product.quantity || 1,
  notes: product.notes || product.description || null,
  unit_price: product.price || product.unit_price || product.rental_price || null,
  total_price: (product.price || product.unit_price || 0) * (product.quantity || 1)
}
```

### 5. TypeScript Types - Uppdatera

Uppdatera `src/integrations/supabase/types.ts` för att reflektera de nya kolumnerna (genereras automatiskt från Supabase).

### 6. Frontend - Uppdatera interfaces

Uppdatera `BookingProduct` interface i:
- `src/types/booking.ts`
- `src/components/Calendar/BookingProductsDialog.tsx`

---

## Tekniska detaljer

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/migrations/[new].sql` | Lägg till `unit_price` och `total_price` kolumner |
| `supabase/functions/import-bookings/index.ts` | Lägg till loggning + uppdatera ProductData interface + spara prisdata |
| `src/types/booking.ts` | Lägg till `unitPrice?` och `totalPrice?` i BookingProduct |
| `src/components/Calendar/BookingProductsDialog.tsx` | Uppdatera interface för att visa priser |

### Loggningsformat

Efter ändringen kommer edge function-loggarna att visa:
```text
Processing 3 products for booking 2505-42
RAW PRODUCT DATA from external API: {
  "name": "Multiflex 4x12",
  "quantity": 2,
  "price": 1500,
  "rental_price": null,
  "notes": "Med LED"
}
```

### Databasmigrering

```sql
ALTER TABLE public.booking_products
ADD COLUMN unit_price NUMERIC DEFAULT NULL,
ADD COLUMN total_price NUMERIC DEFAULT NULL;
```
