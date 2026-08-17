# Scanner Hardening V2 – Release Gate

**Status: NOT GREEN – DO NOT ACTIVATE**

`SCANNER_TRANSACTION_V2` är fail-closed och är OFF när `VITE_SCANNER_TRANSACTION_V2=true` inte uttryckligen sätts. Ingen produktionsdeploy, ingen produktionsmigration och ingen global aktivering har gjorts i detta kodpaket.

Den tidigare rapporten i repot markerade flera invariants som PASS trots att V2 inte var inkopplat i faktisk runtime och 15B-scenarierna inte exekverades. Den rapporteringen är ersatt. PASS får nu endast komma från verklig exekvering/evidens.

## Invariants

| # | Invariant | Status | Evidens / blocker |
|---|---|---|---|
| 1 | En fysisk användaroperation har exakt ett operation_id | IMPLEMENTERAD / EJ FULL E2E | Durable operation queue skapar id en gång; 15B måste köras mot 15A. |
| 2 | Retry av samma operation kan aldrig skapa extra mutation | IMPLEMENTERAD / EJ FULL E2E | Samma operation_id återanvänds vid UNKNOWN/retry; `duplicate` räknas endast som commit när WMS explicit bevisar replay av samma operation. WMS-idempotency måste verifieras i 15A/15B. |
| 3 | Samma item_instance kan inte aktivt packas på två bokningar samtidigt | EXTERN WMS GATE | Måste bevisas av WMS 15A concurrency/invariant. |
| 4 | Planning kan inte skapa scanner-sanning som saknas i WMS | IMPLEMENTERAD I V2 RUNTIME | V2 går WMS-first; legacy finns endast när flaggan är OFF. Kräver full E2E. |
| 5 | WMS authoritative state styr quantity i scanner-UI | IMPLEMENTERAD I V2 RUNTIME | `onAuthoritativeSet` använder serverns exakta quantity. Kräver full E2E. |
| 6 | PACK och UNPACK är reversibla domänoperationer | EXTERN WMS GATE | Separata V2 commands finns; WMS-state måste verifieras i 15A/15B. |
| 7 | UNPACK och RETURN är separata operationer | IMPLEMENTERAD | `UNPACK_INSTANCE` och `RETURN_INSTANCE` är separata; unpack använder inte `checkin-scan` i V2. |
| 8 | Fel booking kan aldrig påverkas av en scan | IMPLEMENTERAD GATEWAY / EJ FULL E2E | Booking/tenant scope verifieras server-side; WMS wrong-booking test återstår. |
| 9 | Overpack avvisas utan mutation | EXTERN WMS GATE | Planning accepterar inte lokal optimism; canonical WMS-bevis krävs. |
| 10 | Offline/timeout/reload tappar inte accepterad operation | IMPLEMENTERAD / EJ FULL E2E | Varje V2-mutation persistenteras i IndexedDB före WMS-anrop; runtime RAM-fallback är borttagen. Transportfel blir UNKNOWN och retryas med samma id. Senare operationer i samma packing-lane får inte gå förbi ett tidigare UNKNOWN. Response-loss E2E återstår. |
| 11 | Grönt besked betyder serverbekräftad COMMITTED state | IMPLEMENTERAD I V2 RUNTIME | Pending/UNKNOWN ger inte success; full UI E2E återstår. |
| 12 | UNKNOWN löses med samma id, aldrig genom gissning | IMPLEMENTERAD | Network/5xx/timeout behandlas som UNKNOWN och retry behåller operation_id. Scanner/Return-vyer gör återkommande recovery-drain medan de är öppna; lane-ordning bevaras. |
| 13 | Alla V2 scanner-write-paths går via canonical WMS gateway | IMPLEMENTERAD I PLANNING V2 | Faktisk `useScanProcessor` och ReturnView använder durable gateway när flaggan är ON; Inventory/WMS-repot måste verifieras separat. |
| 14 | Auditfel kan inte skapa falskt operationsfel efter commit | EXTERN WMS GATE | Planning projection failure degraderas till warning; canonical WMS ledger/audit måste verifieras i 15A. |
| 15 | Reconciliation upptäcker mismatch utan automatisk repair | IMPLEMENTERAD READ-ONLY / EJ FULL E2E | Reconciliation är read-only; final cross-system E2E kräver 15A control/state endpoint. |

## Blockers

- Steg 15A/WMS-fixtures och test-control/state endpoint finns inte i detta Planning-paket och måste finnas i säker LOCAL/TEST-miljö för full 15B.
- Full scanner E2E har därför **inte** deklarerats GREEN här.
- V2 får inte aktiveras i produktion innan både WMS- och Planning-zippar har granskats tillsammans och alla obligatoriska 15A/15B-scenarier är PASS.
- V2 blockerar avsiktligt manuell "ångra retur"/reset retur tills WMS har ett explicit revisionssäkert UNRETURN-kommando.

## Feature flags

- `VITE_SCANNER_TRANSACTION_V2`: endast exakt `true` aktiverar V2; annars OFF.
- Ingen source-code-default aktiverar V2.
- `SCANNER_E2E_ENABLE_V2_FOR_RUN=true` är endast en fail-closed opt-in för E2E-harnessen och aktiverar inte produktion.

## Endpoints

- Planning Scanner V2 client: `VITE_SCANNER_OPERATION_V2_URL` eller `${VITE_SUPABASE_URL}/functions/v1/scanner-operation-v2`.
- Planning edge gateway: `supabase/functions/scanner-operation-v2/index.ts`; `supabase/config.toml` sätter explicit `verify_jwt = false` eftersom gatewayen använder EventFlows verifierade custom mobile-token och därefter egen fail-closed sessions-/tenantkontroll.
- WMS downstream URL: endast `WMS_COMMAND_GATEWAY_URL` server-side; ingen hårdkodad produktionsfallback.
- 15B command path: `SCANNER_E2E_PLANNING_URL` → Planning V2 gateway → WMS.
- 15B WMS URL används endast som 15A read-only control/state endpoint för verifiering.

## legacy paths

Legacy `scanner-api`, lokala optimistic helpers och gamla ScanQueue finns kvar för rollback när V2 är OFF. När V2 är ON tar `useScanProcessor` V2-grenen före legacy-pathen och `ScannerService` får inte enqueue:a samma scan i legacy ScanQueue.

De legacy paths får inte tas bort innan full 15A/15B-gate är GREEN.

## Migrationsfiler

Detta Planning-korrigeringspaket lägger inte till eller kör någon destruktiv produktionsmigration. Canonical scanner ledger/allocation-invariants hör till WMS-repot och granskas separat.

## Valideringsregel

`PASS` = exekverat och verifierat.  
`NOT_EXECUTED` = aldrig PASS.  
Release = **NOT GREEN** om ett obligatoriskt scenario saknar exekverad evidens.


## Validation i detta paket

- TypeScript-parserkontroll har körts på de ändrade scannerfilerna. Inga icke-dependency-relaterade TypeScript-diagnostiker återstod; råkörningen rapporterar förväntade saknade importer/`react/jsx-runtime` eftersom `node_modules` inte finns i arbetsmiljön.
- Gateway-filen parser med `tsc --noResolve` utan syntaxfel.
- `npm ci` kunde inte slutföras i arbetsmiljön och därför har full Vitest/Vite-build **inte** deklarerats som PASS här.
- Zip-integritet ska verifieras separat vid paketering.
- Detta ändrar inte release-regeln: V2 är fortsatt OFF som default och får inte aktiveras i produktion utan 15A/15B GREEN.
