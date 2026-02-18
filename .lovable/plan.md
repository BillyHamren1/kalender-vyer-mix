
## Spara och visa economics-objektet från API-payloaden

### Vad som händer idag

API:et skickar nu ett `economics`-objekt med kalkyler på bokningsnivå. Edge-funktionen ignorerar det helt — ingen av fälten sparas. Per-produkt-kostnaderna (`assembly_cost`, `handling_cost`, `purchase_cost`) importeras redan korrekt till `booking_products`.

### Vad som saknas

`bookings`-tabellen har inga kolumner för intäkter eller marginal. Economics-data behöver:
1. Sparas i databasen vid import
2. Visas i bokningens detaljvy

### Strategi: Ny JSONB-kolumn på bookings

Istället för 5+ separata kolumner lagras hela `economics`-objektet som en JSONB-kolumn (`economics_data`) på `bookings`. Det ger:
- Enkel migration (en kolumn)
- Flexibilitet om API:et lägger till fler fält framöver
- Lätt att läsa enskilda värden ur objektet i UI:t

```text
bookings.economics_data = {
  "total_revenue_ex_vat": 12500,
  "total_assembly_cost": 2000,
  "total_handling_cost": 500,
  "total_purchase_cost": 1035,
  "total_costs": 3535,
  "gross_margin": 8965,
  "margin_pct": 72
}
```

### Tekniska ändringar

**1. Databasmigration** — lägg till kolumn på `bookings`:
```sql
ALTER TABLE bookings ADD COLUMN economics_data jsonb;
```

**2. Edge-funktionen** (`import-bookings/index.ts`):
- Plocka upp `externalBooking.economics` och `externalBooking.totals`
- Spara som `economics_data` vid INSERT och UPDATE av bokning
- Preferens: `economics`-objektet om det finns, annars bygg ihop från `totals`

```typescript
// I bookingData-objektet:
economics_data: externalBooking.economics || (externalBooking.totals ? {
  total_revenue_ex_vat: externalBooking.totals.total_ex_vat,
  total_costs: externalBooking.totals.total_costs,
  gross_margin: externalBooking.totals.gross_margin,
} : null)
```

**3. TypeScript-typ** (`src/types/booking.ts`):
```typescript
economics?: {
  total_revenue_ex_vat?: number;
  total_assembly_cost?: number;
  total_handling_cost?: number;
  total_purchase_cost?: number;
  total_costs?: number;
  gross_margin?: number;
  margin_pct?: number;
} | null;
```

**4. UI-komponent** — ett nytt kort `BookingEconomicsCard` visas i `BookingDetailContent` bredvid produktlistan:

```text
┌─────────────────────────────────────────────────┐
│  Ekonomisk kalkyl  (från offert)                │
├──────────────┬──────────────┬───────────────────┤
│ Intäkter     │ Kostnader    │ Bruttomarginal    │
│ 12 500 kr    │  3 535 kr    │  8 965 kr (72%)   │
├──────────────┴──────────────┴───────────────────┤
│ Montage: 2 000 kr  Lager: 500 kr  Inköp: 1 035 kr│
└─────────────────────────────────────────────────┘
```

Kortet visas **bara** om `economics_data` finns — dvs. inte för gamla bokningar utan data.

### Filer att ändra

1. **Databasmigration** — ny JSONB-kolumn `economics_data` på `bookings`
2. **`supabase/functions/import-bookings/index.ts`** — lägg till `economics_data` i `bookingData` och i `updateData`
3. **`src/types/booking.ts`** — lägg till `economics` i `Booking`-interfacet
4. **`src/components/booking/BookingEconomicsCard.tsx`** — ny komponent (skapas)
5. **`src/components/booking/detail/BookingDetailContent.tsx`** — lägg till `<BookingEconomicsCard>` i layouten

Ingen ändring av `booking_products` behövs — per-produkt-fälten importeras redan.
