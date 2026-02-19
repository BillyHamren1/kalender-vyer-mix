

# Anpassa produktkostnader till Bookings API-format

## Bakgrund
Booking-systemets `planning-api` returnerar produktkostnader i detta format:
```text
{
  products: [
    { id, product_name, quantity, unit_price, total, discount,
      assembly_cost, handling_cost, purchase_cost, vat_rate, is_manual, manual_type }
  ],
  summary: { revenue, costs, margin }
}
```

Lokalt har vi en `ProductCostSummary`-interface med camelCase och egna beraknade totaler. Nu ska vi anpassa oss till Bookings falt istallet.

## Plan

### 1. Uppdatera `ProductCostData` interface (`src/services/productCostService.ts`)
Byt till Bookings faltnamn direkt:
- `product_name` istallet for `name`
- `total` istallet for `totalRevenue`
- `assembly_cost`, `handling_cost`, `purchase_cost` (per styck, som Booking lagrar det)
- Lagg till `discount`, `vat_rate`, `is_manual`, `manual_type`
- Ta bort legacy-falt som inte finns i Booking (`laborCost`, `materialCost`, `setupHours`, `externalCost`, `costNotes`)

### 2. Uppdatera `ProductCostSummary` interface
Anpassa till Bookings `summary`-objekt:
- `summary.revenue`, `summary.costs`, `summary.margin` -- precis som Booking returnerar
- Behall `products`-arrayen med Bookings faltnamn

### 3. Uppdatera `fetchProductCostsRemote` (`src/services/planningApiService.ts`)
Returnera Bookings svar direkt, ingen mappning behovs langre. Typen andras till att matcha det nya interfacet.

### 4. Uppdatera `ProductCostsCard.tsx`
Anpassa till nya faltnamn: `p.product_name` istallet for `p.name`, `p.total` istallet for `p.totalRevenue`, etc. Berakna totalCost per produkt som `(assembly_cost + handling_cost + purchase_cost) * quantity`.

### 5. Uppdatera `calculateEconomySummary` (`src/services/projectEconomyService.ts`)
Anvand `productCosts.summary.costs` istallet for `productCosts.totalProductCost`, `productCosts.summary.revenue`, etc.

### 6. Uppdatera `EconomySummaryCard` och exporttjanster
Saker pa att alla referenser till de gamla faltnamnen uppdateras.

## Filer som berors
- `src/services/productCostService.ts` -- interface-andringar
- `src/services/planningApiService.ts` -- ta bort mappning, pass-through
- `src/components/project/ProductCostsCard.tsx` -- anvand Bookings faltnamn
- `src/services/projectEconomyService.ts` -- `calculateEconomySummary` anvander nya falt
- `src/hooks/useProjectEconomy.tsx` -- eventuella typandringar
- `src/services/projectEconomyExportService.ts` -- exportformat

## Resultat
Inga transformationer, inga mappningar. Bookings falt anvands rakt igenom hela systemet.
