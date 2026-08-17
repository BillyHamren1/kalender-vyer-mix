# Scanner V2 – lokal validering av korrigeringspaket

Datum: 2026-08-17

## Resultat

- 21/21 riktade statiska/runtime-kontrakt: PASS.
- `scripts/run-scanner-e2e.sh`: `bash -n` PASS.
- TypeScript parser/noResolve på ändrade scannerfiler: inga icke-dependency-relaterade diagnostiker.
- `supabase/functions/scanner-operation-v2/index.ts`: parserkontroll PASS.
- Kända Planning/WMS production project refs: inga träffar i V2-klient/gateway.
- `SCANNER_TRANSACTION_V2`: OFF som default.

## Kritiska kontrakt som verifierades

1. V2 runtime ligger före legacy write paths.
2. Muterande fysisk scan persistenteras före processor/WMS-anrop.
3. Ingen runtime RAM-fallback för V2-kön.
4. UNKNOWN blockerar senare operationer i samma packing-lane.
5. Enskild persisted operation får inte gå förbi tidigare unresolved operation.
6. Quantity-command skickar inte SKU som serial number.
7. Transportambiguity blir UNKNOWN.
8. Gatewayen använder verifierad mobile-session auth.
9. Supabase-konfiguration tillåter custom mobile-token att nå egen auth (`verify_jwt=false`).
10. Projection är tenant-/packing-/item-scopad.
11. Booking-verifiering failar stängt.
12. Generic duplicate kan inte ge grön success utan replay-bevis.
13. Accepted utan authoritative state degraderas till UNKNOWN.
14. WMS endpoint är endast miljökonfigurerad.
15. Planning V2 endpoint är endast miljökonfigurerad.
16. Full ScanEvent routas till aktiv vy.
17. Barcode readiness bygger på verifierad hardware health.
18. 15B exekverar scenario-runnern i stället för att blanket-markera NOT_EXECUTED.
19. 15B skickar via Planning gateway och använder WMS control endpoint read-only.
20. E2E duplicate success kräver explicit replay proof.
21. UNKNOWN/PENDING recovery körs återkommande medan scanner-vyn är öppen.

## Begränsning i denna arbetsmiljö

`npm ci` kunde inte slutföras inom den tillgängliga körmiljön och `node_modules` finns inte i uppladdningen. Därför har full Vitest/Vite build **inte** påståtts vara körd eller PASS. Full 15A + 15B mot säker LOCAL/TEST-miljö är fortsatt release-gate innan V2 aktiveras.
