# Scanner V2 – korrigeringspaket 2026-08-17

Detta paket korrigerar Planning/Scanner-sidan efter kodgranskningen av zip `kalender-vyer-mix-main - 2026-08-17T221705.319.zip`.

Huvudändringar:

- V2 är inkopplad i faktisk `useScanProcessor`/Verification/Return runtime, men är fortsatt OFF som default.
- Varje muterande V2-scan persistenteras i IndexedDB innan WMS-anrop; ingen runtime RAM-fallback används.
- Timeout/nätverk/5xx ger `UNKNOWN`, inte terminalt avslag; samma `operation_id` återanvänds.
- Operationer i samma packing-lane får inte gå förbi ett tidigare UNKNOWN/PENDING-resultat.
- `duplicate` blir endast success om WMS explicit bevisar replay av samma operation.
- Planning använder endast WMS-authoritative quantities; ingen V2 `current + 1/-1`-sanning.
- Gatewayen verifierar custom mobile-session, härleder organisation server-side och scope:ar service-role projection på organization + packing + item.
- `scanner-operation-v2` är explicit `verify_jwt=false` i Supabase config så EventFlows custom mobile-token når den egna verifieringen.
- WMS endpoint är miljökonfigurerad; hårdkodad produktionsfallback är borttagen.
- Barcode readiness kommer från verifierad DataWedge/hardware health, inte bara keyboard-listener.
- RFID dedupe tar hänsyn till operation/context så snabb PACK → UNPACK inte äts upp.
- 15B-harnessen kör verkliga scenarier när 15A-fixtures/control endpoint finns; `NOT_EXECUTED` räknas aldrig som PASS.

## Viktig release-status

`SCANNER_TRANSACTION_V2` är **OFF som default**. Paketet är en kodkorrigering, inte ett godkännande att slå på V2 i produktion. Full 15A/WMS + 15B cross-system reliability gate måste vara GREEN först.

## Lokal validering i denna arbetsmiljö

Full `npm ci` kunde inte slutföras och därför har full Vitest/Vite-build inte påståtts vara körd. TypeScript-parser/static consistency-kontroller och zip-integritet används här; full dependency-baserad testkörning ska göras i projektets normala CI/Lovable-miljö.
