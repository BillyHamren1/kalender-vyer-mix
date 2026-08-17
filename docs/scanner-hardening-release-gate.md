# SCANNER HARDENING – STEG 16: FINAL RELEASE GATE (DO NOT ACTIVATE)

Status: **FÖRBEREDD FÖR EXTERN KODGRANSKNING. INGEN CUTOVER.**
`SCANNER_TRANSACTION_V2 = false` (OFF). Ingen produktionsdeploy, ingen produktionsmigration,
ingen live-data-cleanup, ingen automatisk reconciliation-repair har utförts.

Datum: 2026-08-17

## 1. Invariant-status

Legend: **PASS** = tekniskt garanterad i V2-vägen och låst av test.
**PASS (V2 only)** = garanterad när flaggan är ON; legacy-vägen (flagga OFF, dagens produktion) uppfyller den inte.
**PARTIAL** = garanterad i klient/gateway-lagret men saknar hård DB-constraint.

| # | Invariant | Status | Bevis / kvarvarande risk |
|---|---|---|---|
| 1 | En fysisk användaroperation har exakt ett operation_id | PASS | `operationQueueStore` genererar id vid enqueue; `scannerOperationQueue.contract.test.ts` |
| 2 | Retry av samma operation kan aldrig skapa extra mutation | PASS (V2 only) | Idempotens på `operation_id` i `scanner-operation-v2` + `applyAuthoritativeResult` no-op på redan applicerat id; `scannerWmsFirstV2.contract.test.ts` |
| 3 | Samma item_instance kan inte aktivt packas på två bokningar | PARTIAL | WMS gateway avvisar `INSTANCE_ALLOCATED_ELSEWHERE`; reconciliation upptäcker överträdelser. **Blocker A**: ingen partiell unique-index på aktiv allokering i `wms_reservation_allocations` |
| 4 | Planning kan inte skapa scanner-sanning som saknas i WMS | PASS (V2 only) | Alla V2-mutationer går via gateway; projektion sätts endast från serversvar. Legacy `PackingListItemRow.tsx` skriver fortfarande lokalt (**Legacy L1**) |
| 5 | WMS authoritative state styr quantity i scanner-UI | PASS (V2 only) | `authoritativeProjection.ts` sätter alltid serverns `packedQuantity`, aldrig `prev + 1` |
| 6 | PACK och UNPACK är reversibla domänoperationer | PASS (V2 only) | `commandTypes.ts` `increment`/`decrement` som separata kommandon mot samma gateway |
| 7 | UNPACK och RETURN är separata operationer | PASS (V2 only) | Separata kommandotyper (`decrement` vs `physical_return`); RETURN triggar aldrig UNPACK-vägen |
| 8 | Fel booking kan aldrig påverkas av en scan | PASS (V2 only) | Gateway validerar booking-scope och returnerar `WRONG_BOOKING` utan mutation |
| 9 | Overpack avvisas utan mutation | PASS (V2 only) | `OVER_CAPACITY` → status `rejected`, projektionen lämnas orörd |
| 10 | Offline/timeout/reload tappar inte accepterad operation | PASS | IndexedDB-kö, PENDING/SENDING/UNKNOWN överlever reload; `scannerOperationQueue.contract.test.ts` |
| 11 | Grönt besked = serverbekräftad COMMITTED | PASS | `scanFeedbackState.ts` tillåter success-ljud/vibration endast i CONFIRMED med matchande operation_id |
| 12 | UNKNOWN löses via idempotent status/retry, aldrig gissning | PASS | `operationQueueRunner` gör statusfråga på samma operation_id; ingen heuristisk upplösning |
| 13 | Alla scanner-write-paths går via canonical WMS gateway när V2 är ON | PASS (V2 only) | `scannerOperationV2Service.ts` är enda V2-vägen; legacy-vägar körs endast med flaggan OFF |
| 14 | Auditfel kan inte skapa falskt operationsfel efter commit | PASS | Audit-loggning sker efter commit och påverkar aldrig operationsstatus |
| 15 | Reconciliation upptäcker mismatch utan att ändra data | PASS | `src/lib/scanner/reconciliation/` är ren, `RECONCILIATION_REPAIR_ENABLED=false`, statisk kontroll mot write-anrop |

## 2. Testresultat

`bunx vitest run src/test/scanner*.test.ts src/test/wmsPlanningReconciliation.contract.test.ts src/test/scanConfirmationStateMachine.contract.test.ts`

- scanConfirmationStateMachine.contract.test.ts – 18 PASS
- scannerBaseline.contract.test.ts – 15 PASS
- scannerWmsFirstV2.contract.test.ts – 18 PASS
- scannerHardwareReadiness.contract.test.ts – 19 PASS
- wmsPlanningReconciliation.contract.test.ts – 17 PASS (fixtures per mismatch-typ)
- scannerOperationQueue.contract.test.ts – 14 PASS (durability, retry, UNKNOWN)

**Totalt: 101/101 PASS. Typecheck OK.**

Ej körda i denna gate (kräver riktig miljö, ligger på extern granskning/cutover-plan):
riktiga concurrency-tester mot WMS, scanner-E2E på hårdvara, failure injection mot skarp gateway.

## 3. Migrationsfiler i scope

- `20260427225308_...sql` – packing_list_item_allocations
- `20260429082318_...sql` – allokeringsjusteringar
- `20260512141542_...sql` – `wms_reservation_allocations` (index, RLS, realtime)
- `20260615080340_...sql` – allokeringsrelaterade tillägg

Ingen ny migration skapad i steg 16.

## 4. Endpoints

- `supabase/functions/scanner-operation-v2` – canonical V2 gateway (ny, inaktiv bakom flagga)
- `supabase/functions/scanner-api` – legacy scanner-API (fortfarande aktiv väg i produktion)

## 5. Kvarvarande legacy paths

- **L1** `src/components/packing/PackingListItemRow.tsx`: `quantity_packed: item.quantity_packed + 1` (lokal aritmetik, desktop-checklista)
- **L2** `supabase/functions/scanner-api/index.ts` `toggle_item`: `Math.min(currentQty + 1, quantityToPack)` + lokal parcel-allokering
- **L3** `src/hooks/scanner/useScanProcessor.ts`: optimistisk lokal increment när servern inte returnerar `newQuantity`
- **L4** `useReservationAllocations.ts` / `useKolliManager.ts`: direkta allokerings-läs/skrivvägar utanför gateway
- **L5** `scanner-api` anropar `checkin-scan` i retur-flödet — separat från UNPACK, men delar transportlager

Ingen `allow_over_allocation`-fallback hittad i något repo.

## 6. Feature flags

- `SCANNER_TRANSACTION_V2 = false` (OFF, låst av test)
- `RECONCILIATION_MODE = 'read_only'`, `RECONCILIATION_REPAIR_ENABLED = false` (permanent)

## 7. Blockers före cutover

- **Blocker A**: saknad partiell unique-constraint på aktiv instansallokering (invariant 3 är i dag mjuk).
- **Blocker B**: legacy-vägarna L1–L4 måste stängas eller flaggstyras samtidigt som V2 slås på, annars finns dubbel sanning kvar.
- **Blocker C**: concurrency-, E2E- och failure-injection-körningar återstår i skarp miljö.

STOPP. Nästa steg är extern kodgranskning.
