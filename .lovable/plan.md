
# Plan: Fixa produktsynk och automatisk uppdatering av packsidan

## 1. Sammanfattning
Produktändringar i externa systemet upptäcks inte av den nuvarande synklogiken, och packvyn uppdateras inte heller automatiskt. Denna plan åtgärdar båda problemen och hanterar packlista-kopplingarna korrekt.

---

## 2. Ändringar

### 2.1 Utöka `hasBookingChanged` med produktjämförelse (Edge Function)

**Fil:** `supabase/functions/import-bookings/index.ts`

Lägg till en funktion som hämtar nuvarande antal produkter och deras namn/kvantitet från databasen och jämför med externa produkter.

```text
+--------------------------------------------+
|  hasBookingChanged + hasProductsChanged    |
|  - Jämför antal produkter                  |
|  - Jämför produktnamn + kvantiteter hash   |
|  - Returnera sant om produkter avviker     |
+--------------------------------------------+
```

**Ny logik:**
- Skapa en snabb produktsignatur (t.ex. sortera namn+kvantitet och skapa en hash/sträng).
- Om signaturen skiljer sig → sätt `needsProductUpdate = true`.
- Om `needsProductUpdate` och ingen annan ändring → kör produktsynk men visa popover-info.

### 2.2 Återkoppla packing_list_items vid produktuppdatering

**Fil:** `supabase/functions/import-bookings/index.ts`

Vid produktändring:
1. Hämta befintliga `packing_list_items` med koppling till den gamla produkten (via namn/SKU).
2. Radera gamla `booking_products`.
3. Skapa nya `booking_products`.
4. Mappa om `packing_list_items.booking_product_id` till nya IDn baserat på matchning (namn/SKU).
5. Lägg till nya rader för nya produkter, ta bort rader för borttagna produkter.
6. Returnera en lista med justeringar (tillagda, borttagna, kvantitetsändringar).

### 2.3 Lägg till "products_updated"-flagga i import-resultatet

**Fil:** `supabase/functions/import-bookings/index.ts`

Utöka `results`-objektet:
- `products_updated_bookings: string[]` – boknings-IDn där produkter ändrades.
- `product_changes: { bookingId, added: [], removed: [], updated: [] }[]`

### 2.4 Auto-uppdatering av PackingDetail (Frontend)

**Fil:** `src/pages/PackingDetail.tsx`

1. Lägg till en `refetch`-funktion som hämtar produkter och packlistor på nytt.
2. Lägg till en `useEffect` som lyssnar på `visibilitychange` (när fönstret får fokus → refetch).
3. Lägg till en synlig "Uppdatera"-knapp.
4. Visa ett toast-meddelande/popover när produkter har ändrats.

### 2.5 Visa popover med produktjusteringar

**Fil:** `src/pages/PackingDetail.tsx`

När nya produktdata laddas:
- Jämför med tidigare data i state.
- Om skillnader finns → visa en popover/toast som listar:
  - Tillagda produkter
  - Borttagna produkter
  - Ändringar i kvantitet

---

## 3. Teknisk implementation i Edge Function

### 3.1 Produktsignatur-funktion (pseudo)
```typescript
const getProductsSignature = (products: any[]): string => {
  const sorted = products
    .map(p => `${p.name || ''}_${p.quantity || 0}`)
    .sort();
  return sorted.join('|');
};
```

### 3.2 Jämförelse mot databas
```typescript
const { data: existingProducts } = await supabase
  .from('booking_products')
  .select('name, quantity')
  .eq('booking_id', bookingId);

const existingSignature = getProductsSignature(existingProducts || []);
const externalSignature = getProductsSignature(externalProducts);

const productsChanged = existingSignature !== externalSignature;
```

### 3.3 Återkoppling av packing_list_items
```typescript
// 1. Spara mappning gamla produkt-id -> namn
const oldProductMap = new Map(existingProducts.map(p => [p.id, p.name]));

// 2. Radera och skapa nya produkter (befintlig logik)

// 3. Skapa mappning nya produkt-id -> namn
const newProductMap = new Map(newProducts.map(p => [p.name, p.id]));

// 4. Uppdatera packing_list_items
for (const packItem of packingListItems) {
  const oldName = oldProductMap.get(packItem.booking_product_id);
  const newId = newProductMap.get(oldName);
  if (newId) {
    await supabase
      .from('packing_list_items')
      .update({ booking_product_id: newId })
      .eq('id', packItem.id);
  } else {
    // Produkt borttagen → logga/visa varning
  }
}
```

---

## 4. Frontend-flöde

```text
Sidan öppnas/fokus → refetch data
        ↓
Jämför med tidigare state
        ↓
  ┌─────────────────────────────────┐
  │ Skillnader?                     │
  │   Ja → Visa toast/popover       │
  │   Nej → Inget meddelande        │
  └─────────────────────────────────┘
```

---

## 5. Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Produktjämförelse, packing_list_items-återkoppling |
| `src/pages/PackingDetail.tsx` | Auto-refetch, uppdateringsknapp, change-popover |
| `src/hooks/usePackingList.tsx` | Eventuellt refetchQuery-exponering |

---

## 6. Säkerhetskontroller

- Förhindra att packlistor förloras vid import.
- Logga alla produktändringar för spårbarhet.
- Visa tydligt vilka produkter som lagts till/tagits bort.

