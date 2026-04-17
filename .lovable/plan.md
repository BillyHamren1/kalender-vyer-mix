
## Mål
Två förbättringar i scanner-packflödet:
1. **Överscan-räkning**: när 12 av 10 scannas ska räknaren visa 12/10 (idag stannar den vid 10).
2. **Okänd produkt** ska inte längre bara ge en toast — scanningen ska pausas och en dialog frågar: *"Du har scannat XXX, den finns inte i packlistan. Lägg till? Ja/Nej"* → om Ja → ange antal → produkten läggs till i packlistan med 1/X redan packade och synkas till bokningen.

## Vad jag hittade

### 1. Överscan-bugg (cap vid quantity_to_pack)
- **Backend** (`scanner-api/index.ts` rad 528-553): Backend räknar faktiskt korrekt — `newQuantity = currentPacked + incrementBy` utan tak. Och vid full-cap returneras `overscan: true`, `newQuantity` (verkligt tal).
- **UI-bugg #1** (`useOptimisticPacking.ts` rad 52): `Math.min(quantity_packed, quantity_to_pack)` cappar progress-bar — det är OK för procenten men felaktigt för **UI-räknaren per rad** är inte cappad där.
- **UI-bugg #2 (huvudboven)** (`VerificationView.tsx` rad 213): `isOverscan = packed > total` markeras rött — bra. Men `applyOptimisticIncrement` ökar bara med +1 lokalt. Backend kan returnera `newQuantity` (t.ex. 12) men optimistic UI har +1, +1, +1 → räknaren matchar **om** realtime-sync hämtar in serverns värde. Det gör den (`useScannerRealtime`), så troligen fungerar siffran men rendering visar **fel**: `info.packed = quantity_packed` direkt från items — så 12/10 borde visas.
- **Verklig bugg är troligen i `mergeServerData`** (rad 93): `if (localItem.quantity_packed > serverItem.quantity_packed) → behåll local`. Det är OK. Men räknaren i raden visar `{packed}/{total}` — låt mig kolla det exakt. Faktiskt ser raden ut att visa `packed > total` korrekt.
- **Sannolik orsak**: Backend cappar inte `quantity_packed` i DB heller, så 12/10 ska gå igenom. Måste verifiera om något annat ställe (sortering / partial-detektion) döljer värdet. Plan: testa, men jag adderar också säker garanti i `applyOptimisticIncrement` att den inte tappar increments.

**Korrigeringar**:
- Säkerställ att `applyOptimisticIncrement` accepterar ett valfritt `serverQuantity`-värde från backend och sätter detta direkt (istället för +1) — så 12 alltid visas direkt.
- Säkerställ att raden alltid visar `{packed}/{total}` även när `packed > total` (är redan så, men dubbelkolla röd badge-text).
- Ta bort eventuell cap i progress-procentberäkning så att ej över 100% visas (eller visa "11/10" tydligt).

### 2. Okänd produkt → dialog "Lägg till?"

Idag: backend returnerar `{ success: false, error: 'Artikeltyp "X" finns inte i packlistan' }` → frontend visar `toast.error(...)`.

**Ny plan**:
- Backend: när artikel inte hittas i packlistan, returnera distinkt flagga `notInPackingList: true` + metadata: `scannedSku`, `scannedName` (från allokerings-API:s svar), `bookingId`.
- Frontend (`useScanProcessor`): när `notInPackingList === true`:
  - **Pausa scanning** — sätt en flagga `pendingUnknownProduct` så att kö-processorn väntar.
  - Öppna en `AddUnknownProductDialog` som visar:
    - "Du har scannat **{scannedSku}** — finns inte i packlistan."
    - "Vill du lägga till den?" → **Ja** / **Nej**
    - Om Ja: input för antal (default 1), namn-fält (förifyllt med scannedName)
  - Vid bekräft: anrop ny edge-action `add_unknown_product` som:
    1. Lägger till en rad i `booking_products` (kopplad till bokningen) — så projektet/bokningen uppdateras automatiskt.
    2. Skapar matchande rad i `packing_list_items` med `quantity_to_pack = X`, `quantity_packed = 1`, `verified_by`, `verified_at`.
    3. Returnerar nya `itemId` så UI kan highlighta direkt.
  - Vid Nej / cancel: rensa pausen, fortsätt scanna nästa.

## Filer som ändras

**Backend (edge function):**
- `supabase/functions/scanner-api/index.ts`:
  - `verify_product`: när ingen lokal match → returnera `{ success: false, notInPackingList: true, scannedSku, scannedName, bookingId }` istället för bara error.
  - Ny case `add_unknown_product`: insert i `booking_products` + `packing_list_items` (med `organization_id` från ORG_ID).

**Frontend:**
- `src/services/scannerService.ts`: ny `addUnknownProduct(packingId, sku, name, quantityToPack, verifiedBy)`.
- `src/hooks/scanner/useScanProcessor.ts`:
  - Ny pending-state för okänd produkt (pausar `processNext` tills user svarar).
  - Returnera `pendingUnknownProduct` + handlers `confirmAddUnknown(qty)`, `dismissUnknown()`.
- `src/components/scanner/AddUnknownProductDialog.tsx` (ny): två-stegs AlertDialog (Ja/Nej → antal).
- `src/components/scanner/VerificationView.tsx`: rendera dialogen, koppla handlers, anropa `loadData()` efter add för att visa nya raden.
- `src/hooks/scanner/useOptimisticPacking.ts`: tillåt `applyOptimisticSet(itemId, qty)` för exakt server-värde (ej bara +1).

## Säkerhet & integritet
- Allt går via `scanner-api` med org-isolering (`ORG_ID`).
- Realtime-sync uppdaterar packlistan automatiskt så bokningen syns för andra användare direkt.
- Inga befintliga rader rörs — bara nya inserts.

## Inga risker för dataförlust
- Backend ändrar bara felgrenens svarsformat (lägger till fält, behåller `success: false`).
- Ny insert-action är additiv.
- Överscan: ingen DB-cap idag, så ändringen är ren UI-fix.
