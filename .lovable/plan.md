

# Analys: Scanner-packlistor

## Resultat av undersökning

**API:et fungerar korrekt.** Nätverksloggarna visar att `get_packing_items` returnerar produkter (15+ artiklar) för packningen som öppnades. Datan inkluderar `booking_products` med namn, kvantiteter och SKU:er.

**Men det finns en timing-bugg** som gör att progressen visar **0/0** trots att produkter finns:

### Problem: `get_progress` körs innan items skapats

`get_packing_items` auto-genererar `packing_list_items` från `booking_products` om de inte finns. Men `useOptimisticPacking.loadData()` kör `get_progress` parallellt med `get_packing_items` via `Promise.all`. Resultatet:

1. `get_packing_items` → skapar items i databasen → returnerar dem ✅
2. `get_progress` → räknar items som *inte finns ännu* → returnerar `{total: 0}` ❌

Progressen visar "0/0 — 0%" trots att produktlistan visas.

### Problem: Samma sak i ManualChecklistView

`ManualChecklistView.loadData()` kör `fetchPackingListItems` och `getItemParcels` parallellt. `getItemParcels` kan också returnera tom data om items inte existerade före anropet.

## Åtgärd

### Fil: `supabase/functions/scanner-api/index.ts`

Ändra `get_progress` att **inte** räkna items oberoende, utan istället anropa samma auto-genererings-logik som `get_packing_items`, ELLER: ändra ordningen i frontend så att `get_progress` körs *efter* `get_packing_items`.

**Enklaste fix:** I `useOptimisticPacking.ts` och `ManualChecklistView.tsx` — kör `get_progress` EFTER `fetchPackingListItems` istället för parallellt. Samma sak med `getItemParcels`.

### Fil: `src/hooks/scanner/useOptimisticPacking.ts`
- Ändra `Promise.all([fetchPackingForScanner, fetchPackingListItems, getVerificationProgress])` till sekventiell ordning: hämta items först, sedan progress

### Fil: `src/components/scanner/ManualChecklistView.tsx`  
- Samma fix: hämta items först, sedan parcels
- Beräkna progress lokalt från returnerade items istället för att anropa `get_progress` separat (som redan görs via `recalcProgress`)

### Bonus: Ta bort onödig `get_progress`-anrop
`recalcProgress()` beräknar redan progress lokalt från items. `get_progress`-anropet till servern är redundant vid initial load — items-datan räcker.

## Filer som ändras
1. `src/hooks/scanner/useOptimisticPacking.ts` — Ta bort `getVerificationProgress` från initial load, använd `recalcProgress` enbart
2. `src/components/scanner/ManualChecklistView.tsx` — Flytta `getItemParcels` efter items-hämtning

