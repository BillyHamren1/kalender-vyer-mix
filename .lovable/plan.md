
## Fixa economics-visning — ny datastruktur + line_items-tabell

### Problemet i detalj

API:et skickar nu detta format:
```json
{
  "revenue": { "total_ex_vat": 85000, "currency": "SEK" },
  "costs": { "assembly": 4200, "handling": 1800, "purchase": 9600, "total": 15600 },
  "margin": { "gross": 69400, "pct": 82 },
  "line_items": [
    { "product_name": "Multiflex 10x21", "quantity": 1,
      "total_revenue": 45000, "assembly_cost": 2000,
      "handling_cost": 800, "purchase_cost": 5000, "total_cost": 7800 }
  ]
}
```

Men koden är byggd för det gamla formatet (`total_revenue_ex_vat`, `total_assembly_cost` etc.). Tre saker är trasiga:

1. **Typen är fel** — `BookingEconomics` matchar inte API:ets nya struktur
2. **Edge-funktionen lagrar okartlagt** — `externalBooking.economics` sparas rakt in i DB utan att mappas, dvs fälten heter `revenue.total_ex_vat` inte `total_revenue_ex_vat`
3. **UI:et saknar line_items** — den mest värdefulla delen (per-produkt-kalkyl) visas aldrig

### Vad som byggs

**Steg 1: Uppdatera typen `BookingEconomics`** (`src/types/booking.ts`)

Lägg till den nya strukturen med bakåtkompatibilitet för det gamla formatet:

```typescript
export interface BookingEconomicsLineItem {
  product_name: string;
  quantity: number;
  total_revenue: number;
  assembly_cost: number;
  handling_cost: number;
  purchase_cost: number;
  total_cost: number;
}

export interface BookingEconomics {
  // Nytt format (från API)
  revenue?: { total_ex_vat?: number; currency?: string };
  costs?: { assembly?: number; handling?: number; purchase?: number; total?: number };
  margin?: { gross?: number; pct?: number };
  line_items?: BookingEconomicsLineItem[];
  // Gammalt format (bakåtkompatibilitet)
  total_revenue_ex_vat?: number;
  total_assembly_cost?: number;
  total_handling_cost?: number;
  total_purchase_cost?: number;
  total_costs?: number;
  gross_margin?: number;
  margin_pct?: number;
}
```

**Steg 2: Bygg om `BookingEconomicsCard`** (`src/components/booking/BookingEconomicsCard.tsx`)

Skapa en hjälpfunktion `normalizeEconomics()` som hanterar båda formaten:

```typescript
const normalizeEconomics = (e: BookingEconomics) => ({
  revenue: e.revenue?.total_ex_vat ?? e.total_revenue_ex_vat,
  assemblyCost: e.costs?.assembly ?? e.total_assembly_cost,
  handlingCost: e.costs?.handling ?? e.total_handling_cost,
  purchaseCost: e.costs?.purchase ?? e.total_purchase_cost,
  totalCosts: e.costs?.total ?? e.total_costs,
  grossMargin: e.margin?.gross ?? e.gross_margin,
  marginPct: e.margin?.pct ?? e.margin_pct,
  lineItems: e.line_items ?? [],
});
```

Kortet visar:
- 3 KPI-rutor: Intäkter / Kostnader / Bruttomarginal (med %badge)
- Kostnadsrad: Montage + Lager + Inköp
- **Ny: line_items-tabell** med per-produkt-kalkyl, kollapsbar med en "Visa produktkalkyl"-knapp

Layout för line_items-tabellen:
```
Produkt              Antal   Intäkt    Montage  Lager   Inköp   Totalt
Multiflex 10x21       1     45 000    2 000     800    5 000   7 800
Tält 6x12             2     40 000    2 200    1 000   4 600   7 800
────────────────────────────────────────────────────────────────────
TOTALT                      85 000    4 200    1 800   9 600  15 600
```

**Steg 3: Flytta kortet till fullbredd i bokning** (`src/components/booking/detail/BookingDetailContent.tsx`)

Flytta `BookingEconomicsCard` ur den trånga högerkolumnen (som du visade i skärmbilden) till en separat full-bredd-sektion nedanför tvåkolumnslayouten:

```
┌──────────────────┬──────────────────┐
│  Klientinfo      │  Schema          │
│  Leverans        │  Produkter       │
│  Karta           │  Bilagor         │
│  Projekt         │  Interna noter   │
└──────────────────┴──────────────────┘
──── Ekonomisk kalkyl (full bredd) ────
┌──────────────────────────────────────┐
│  KPI-kort  |  KPI-kort  |  KPI-kort │
│  Kostnadsuppdelning rad              │
│  [Visa produktkalkyl ▼]              │
│  Produkttabell (kollapsbar)          │
└──────────────────────────────────────┘
```

**Steg 4: Visa offertunderlag i projektvyn** (`src/hooks/useProjectEconomy.tsx` + `src/components/project/ProjectEconomyTab.tsx`)

Hämta `economics_data` från bokningen via `bookingId` och visa det överst i Ekonomi-fliken som ett "Offertunderlag"-kort — exakt samma `BookingEconomicsCard`-komponent återanvänds men med etikett "Offertunderlag (från bokningsoffert)".

### Filer att ändra

| Fil | Vad som ändras |
|-----|----------------|
| `src/types/booking.ts` | Utöka `BookingEconomics` med ny struktur + `BookingEconomicsLineItem` |
| `src/components/booking/BookingEconomicsCard.tsx` | Normalisera båda format, lägg till line_items-tabell, bättre layout |
| `src/components/booking/detail/BookingDetailContent.tsx` | Flytta kortet till full-bredd-sektion utanför kolumnerna |
| `src/hooks/useProjectEconomy.tsx` | Lägg till query för `bookingEconomics` via `bookingId` |
| `src/components/project/ProjectEconomyTab.tsx` | Visa `BookingEconomicsCard` överst som offertunderlag |

Inga databasändringar behövs — data sparas redan korrekt i `economics_data`-kolumnen.
