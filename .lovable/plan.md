
## Mål

Planning får aldrig hitta på fysisk inventory-status. Allt fysiskt scanflöde (UT och RETUR) måste först bekräftas av WMS. Lokal `quantity_packed` / `quantity_returned` får bara öka när WMS bekräftar en faktisk händelse.

Två konkreta buggar:

1. `verify_product` (UT-scan): vid `already_allocated` / "fully allocated" sätter vi i dag `incrementBy = Math.max(successfulAllocations, 1)`. Det gör att en dubblett ändå höjer lokal `quantity_packed` med 1 — utan att WMS gjort något nytt. Det leder till att en produkt visas som klar/överpackad fast WMS inte allokerat fler instanser.
2. `return_scan_sku` är en lokal-bara genväg som bumpar `quantity_returned` utan att fråga WMS. Det är OK för manuella checklist-knappar, men inte för fysiska scans (RFID/serie/QR). Det finns ingen action som kör retur som "WMS first".

## Filer

Bara: `supabase/functions/scanner-api/index.ts`

(Ingen UI ändras nu. Inga DB-migreringar. Befintliga `transitionToReturning` / `checkIfAllReturned` / `checkIfAllPacked` återanvänds.)

---

## A) Ny action: `physical_return_scan`

Body: `{ packingId, scannedValue, returnedBy }`
(Vi behåller `return_scan_sku` orörd — den används av lokal SKU-list-input. Ny action är för fysiska scans.)

Steg:

1. Validera params. Logga `physical_return_scan_start` (packingId, scannedValue prefix, returnedBy).
2. Kalla WMS `checkin-scan` (samma URL/headers som `decrement_by_serial` redan gör). Body: `{ serial_number: scannedValue }`.
3. Om `!response.ok` eller `data.success === false`: logga `wms_checkin_failed` (status, error). Returnera `{ success:false, error, wmsStatus }`. Rör inte DB.
4. Om OK: logga `wms_checkin_success` (instance_id, item_type_id, sku, item_type_name). Packa upp `data.data` på samma sätt som befintligt.
5. Hämta `packing_list_items` för packingId med `booking_products(id, sku, inventory_item_type_id, name)` där `quantity_packed > 0`.
6. Match-prio (ny ordning enligt kravet):
   a. `booking_products.inventory_item_type_id === wms.item_type_id` (case-insensitive).
   b. annars `booking_products.sku === wms.sku` (case-insensitive).
   (Namn-fallback hoppas över för fysiska retur-scans — WMS levererar alltid identitet.)
7. Om ingen match: logga `local_return_match_missing` (packingId, item_type_id, sku). Returnera `{ success:false, error:'Hittar ingen rad i packlistan som matchar WMS-svaret', wms: { item_type_id, sku, item_type_name } }`. WMS-checkin har redan skett — vi kan inte rulla tillbaka, så vi loggar tydligt och låter användaren felsöka.
8. Välj rad med största `quantity_packed - quantity_returned` (deterministisk fallback på id). Om alla rader är fulla (`quantity_returned >= quantity_packed`): returnera `alreadyReturned: true` utan att höja.
9. `newQty = Math.min(quantity_returned + 1, quantity_packed)`. Update `quantity_returned`, `returned_at`, `returned_by`. Logga `local_return_match_found` + `local_quantity_returned_incremented`.
10. Kör `transitionToReturning` → då update → `checkIfAllReturned`.
11. Returnera `{ success:true, itemId, productName, quantity_returned:newQty, quantity_packed:sentOut }`.

## B) Fixa `verify_product` så dubbletter inte höjer `quantity_packed`

Ändringar runt rad 588–760:

- Spåra `successfulAllocations` strikt (redan görs). Lägg till spårning av om svaret enbart innehöll `already_allocated` / "fully allocated" / `over_allocated`.
- Ta bort `const incrementBy = Math.max(successfulAllocations, 1)`. Ersätt med `const incrementBy = successfulAllocations`.
- Om `incrementBy === 0`:
  - Logga `duplicate_scan_blocked_no_local_increment` (serialNumbers, alreadyAllocatedSerials).
  - Returnera `{ success:true, alreadyScanned:true, overscan:true, itemId:selectedItem.id, newQuantity:currentPacked, quantityToPack, productName: '<name> (<currentPacked>/<quantityToPack>)' }`. Inget `update`. Ingen parcel-allocation. Inget statusbyte.
- Om `incrementBy > 0`: behåll nuvarande update men cap:a till `quantityToPack` (`newQuantity = Math.min(currentPacked + incrementBy, quantityToPack)`). Logga `local_quantity_packed_incremented` (itemId, from, to, source:'wms_allocations').
- Parcel-allokering körs bara när `incrementBy > 0` (oförändrad logik, men lyfts in i den grenen).

Befintliga early-returns vid `alreadyScanned` (rad 638, 655, 666) lämnas — de träffar redan korrekt utan lokal increment.

## C) Loggar (alla via `console.log` med prefix `[scanner-api]` + kontext)

- `physical_return_scan_start`
- `wms_checkin_success`
- `wms_checkin_failed`
- `local_return_match_found`
- `local_return_match_missing`
- `duplicate_scan_blocked_no_local_increment`
- `local_quantity_packed_incremented`
- `local_quantity_returned_incremented`

## Vad som INTE ändras

- `return_scan_sku`, `return_toggle_item`, `return_decrement_item`, `reset_return_item` — manuella vägar, inget WMS-anrop (per memo `scanner-return-flow-v1`).
- `decrement_by_serial` — redan WMS-first.
- UI/frontend — separat steg.
- DB-schema.

## Risk

`physical_return_scan` returnerar fel om WMS lyckas men ingen lokal rad matchar — det är korrekt enligt kravet (synliggör fel i sync). WMS-checkin kan då vara "konsumerad" på WMS-sidan utan motsvarande lokal decrement; vi loggar `local_return_match_missing` så ops kan rätta manuellt. Detta är acceptabelt eftersom WMS = sanning.
