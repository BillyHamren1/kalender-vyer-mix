

# Plan: Produktkostnader som Budgetunderlag

## Sammanfattning
Utöka systemet så att produkter har sina egna kostnader (arbetskostnad, materialkostnad etc.) som automatiskt skapar ett budgetunderlag för projektet. Dessa kostnader kan importeras från det externa bokningssystemet och/eller justeras manuellt.

## Vad som byggs

### 1. Databasutökning för produktkostnader

Lägg till nya kolumner i `booking_products` för att lagra kostnadsinformation:

```text
booking_products
├── ... (befintliga kolumner)
├── labor_cost (numeric) - Arbetskostnad för produkten
├── material_cost (numeric) - Materialkostnad  
├── setup_hours (numeric) - Beräknade arbetstimmar för montering
├── external_cost (numeric) - Externa kostnader (underhyrning etc.)
└── cost_notes (text) - Noteringar om kostnader
```

**SQL Migration:**
```sql
ALTER TABLE booking_products
ADD COLUMN labor_cost NUMERIC DEFAULT 0,
ADD COLUMN material_cost NUMERIC DEFAULT 0,
ADD COLUMN setup_hours NUMERIC DEFAULT 0,
ADD COLUMN external_cost NUMERIC DEFAULT 0,
ADD COLUMN cost_notes TEXT;
```

### 2. Uppdatera import-funktionen

Utöka `import-bookings` Edge Function för att läsa kostnadsfält från externa produkter:

```typescript
// Nya fält att extrahera från externa produkter
const laborCost = product.labor_cost || product.work_cost || product.setup_cost || 0;
const materialCost = product.material_cost || product.material || 0;
const setupHours = product.setup_hours || product.work_hours || product.hours || 0;
const externalCost = product.external_cost || product.subrent_cost || product.rental_cost_out || 0;
```

### 3. Ny Service: Produktkostnadsberäkning

Skapa en service för att beräkna totalkostnader från produkter per projekt/bokning:

**Fil:** `src/services/productCostService.ts`

```typescript
interface ProductCostSummary {
  laborCostTotal: number;
  materialCostTotal: number;
  setupHoursTotal: number;
  externalCostTotal: number;
  totalProductCost: number;
}

export const fetchProductCosts = async (bookingId: string): Promise<ProductCostSummary>
export const updateProductCost = async (productId: string, costs: Partial<ProductCosts>): Promise<void>
```

### 4. Integrera i Ekonomisystemet

Uppdatera `calculateEconomySummary` för att inkludera produktkostnader som en del av budgeten:

**Fil:** `src/services/projectEconomyService.ts`

```typescript
// Ny budgetkomponent från produkter
const productCostBudget = productCosts.totalProductCost;

// Uppdatera total budget
const totalBudget = staffBudget + purchasesTotal + productCostBudget;
```

### 5. UI för manuell kostnadsjustering

Skapa en komponent för att visa och redigera produktkostnader:

**Fil:** `src/components/booking/ProductCostEditor.tsx`

- Visas i bokningsdetaljvyn eller projektdetaljvyn
- Tabellformat med kolumner: Produkt | Arbetstid | Arbetskostnad | Material | Externt | Totalt
- Redigerbara fält för manuell justering
- Spara-knapp som uppdaterar databasen

### 6. Uppdatera EconomySummaryCard

Lägg till sektion för produktkostnader i ekonomiöversikten:

```text
┌─────────────────────────────────────────┐
│ Produktkostnader                        │
├─────────────────────────────────────────┤
│ Arbetskostnad:     12 500 kr            │
│ Materialkostnad:    3 200 kr            │
│ Externa kostnader:  8 000 kr            │
├─────────────────────────────────────────┤
│ Totalt:            23 700 kr            │
└─────────────────────────────────────────┘
```

## Teknisk Implementation

### Steg 1: Databasmigrering
Skapa SQL-migrering för nya kolumner i `booking_products`.

### Steg 2: Uppdatera TypeScript-typer
**Fil:** `src/types/booking.ts`
```typescript
export interface BookingProduct {
  // ... befintliga
  laborCost?: number;
  materialCost?: number;
  setupHours?: number;
  externalCost?: number;
  costNotes?: string;
}
```

### Steg 3: Uppdatera Import Edge Function
**Fil:** `supabase/functions/import-bookings/index.ts`
- Lägg till extraktion av kostnadsfält
- Spara till databasen

### Steg 4: Skapa ProductCostService
**Fil:** `src/services/productCostService.ts`
- Fetch-funktion för att hämta produktkostnader per bokning
- Update-funktion för att ändra enskilda kostnader
- Summafunktion för totalkostnad

### Steg 5: Integrera i Ekonomi-hook
**Fil:** `src/hooks/useProjectEconomy.tsx`
- Lägg till query för produktkostnader
- Inkludera i summary-beräkningen

### Steg 6: Bygg UI-komponent
**Fil:** `src/components/booking/ProductCostEditor.tsx`
- Tabell med produkter och kostnader
- Inline-redigering eller dialog för ändringar

### Steg 7: Uppdatera Ekonomivy
**Fil:** `src/components/project/ProjectEconomyTab.tsx`
- Lägg till sektion för produktkostnader
- Visa budget vs. utfall per kostnadstyp

## Filer som skapas/ändras

**Nya filer:**
- `src/services/productCostService.ts`
- `src/components/booking/ProductCostEditor.tsx`

**Ändrade filer:**
- `supabase/migrations/[timestamp]_add_product_costs.sql` (ny migration)
- `src/types/booking.ts` - Utöka BookingProduct interface
- `src/integrations/supabase/types.ts` - Regenereras med nya fält
- `supabase/functions/import-bookings/index.ts` - Lägg till kostnadsfält
- `src/services/projectEconomyService.ts` - Inkludera produktkostnader
- `src/hooks/useProjectEconomy.tsx` - Lägg till produktkostnads-query
- `src/components/project/ProjectEconomyTab.tsx` - Visa produktkostnader
- `src/components/project/EconomySummaryCard.tsx` - Inkludera i totalen

## Dataflöde

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Externt System  │────▶│ Import Function │────▶│ booking_products│
│ (produktkostn.) │     │                 │     │ (med kostnader) │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┘
                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ ProductCost     │────▶│ useProjectEcon. │────▶│ EconomySummary  │
│ Service         │     │                 │     │ Card + Tabs     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲
        │
┌───────┴───────┐
│ ProductCost   │
│ Editor (UI)   │
└───────────────┘
```

## Förväntat Resultat
- Produktkostnader importeras automatiskt vid bokningsimport
- Kostnader kan justeras manuellt i UI
- Ekonomiöversikten visar budgetunderlag baserat på produkternas kostnader
- Avvikelse beräknas: Produktbudget vs Faktisk kostnad (personal + inköp)

