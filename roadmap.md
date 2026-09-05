# Roadmap — Planning→Time syntetisk resa (P2)

## Klart denna körning
- [x] Steg 1: signerad `status` 200 med seed-kid (e2Ma2…) genom deployad proxy.
- [x] Steg 2 (Planning-sidan): `lager.contextImport`-operation byggd, testad (104/104 vitest), deployad.
  DryRun deterministisk (samma projectionId/hash vid replay), dokumentet byte-identiskt mot Times parser,
  cross-org fail-closed (`no_binding`, 0 targets i read-kontraktet).
- [x] Regressionskoll: `personnel.accounts` / `days.queue` / `activation.list` 200 via proxyn.
- [x] Time-korrigeringspaket skrivet: `/mnt/documents/time-side-correction-pack-p2.md`.

## Blockerat på Time-sidan (extern grind — kan inte åtgärdas från Planning)
- [ ] Time roterar `work_context_source_registrations` (lager-context-källan) till Plannings publika kid
      `e2Ma2oUnHRDxVZN40O3xaapn0FY06tg52LGdDJ8nlB0` (exakt SQL i korrigeringspaketet).
- [ ] Time seedar EN ny syntetisk personnel-profil + app-konto (invited) — adaptern saknar medvetet
      `personnel.create` och `work-context-import` avvisar okända `workerExternalId`.

## Återupptas efter Time-korrigeringen
- [ ] Skarp `lager.contextImport` → `accepted`; replay → `duplicate` samma import-id.
- [ ] Steg 3: disposable FA-person + Planning-ägt uppdrag med exakt två platser
      (FA Warehouse `0b9d94df-e46e-4987-8b7f-ef04b663dac5` + verklig staginglocation, ingen global fallback).
- [ ] Steg 4: aktivering via Personnel-appflödet (`activation.issue` → claim → `time-login-bootstrap`).
- [ ] Steg 5: mockad GPS A→resa→B via `evidence-ingest`, riktig BRAIN Agent Core (`agent-core`/`agent-core-run.v1`).
- [ ] Steg 6: hostad workerresa med verkliga knappklick (Använd dagen/Justera → agent-rerun → lås bevaras → Bekräfta och skicka → exakt 1 submission).
- [ ] Steg 7: `review.requestCorrection` → worker-resubmit → separat `attest.payroll`/`attest.project` → TEST/PREVIEW-lineage.

## work-order.v1 (Planning→Time, additiv) — levererat i denna körning
- [x] `assignments[].workOrder` byggs från verklig Planning-data i `worker.assignments.sync` (phases/lines/instructions/tasks/files/team/contacts),
      Stockholm-offset, worker-only tasks, https-only files, kostnad/pris/marginal/internalnotes exkluderas redan i SELECT. 36/36 nya tester.
- [ ] Time: när Times `work-order-v1.ts`-parser landar (commit efter 1077ff62) — diffa elementformer (tasks/team/contacts/instructions) mot Plannings emitter; justera vid avvikelse.
- [ ] Deploy `time-planning-proxy` till staging + hostad `worker.assignments.sync` mot syntetisk person; verifiera `data.workOrder`-rapporten (attached/omitted/gaps).
- [ ] Källgap (kräver produktbeslut, ej fabricerat): `lines[].unit` saknar källa i Planning (`booking_products` har ingen enhetskolumn) — avvakta Booking-fältet eller lämna utelämnad.

## Time V2 – Tid & utlägg (Planning-yta, preview/staging, EJ publish)
- [x] Versionerat kontrakt `planning-expense-review.v1` (`supabase/functions/_shared/time-v2/expenseReviewV1.ts`, importeras oförändrat av frontend – ingen spegel att hålla i synk)
- [x] Proxy: `expenses.list` / `expenses.decide` / `expenses.receiptUrl` (staging-lock till pklkhhfvgmexsrkkpkzt, tenant-drop, org-scopad bindning bokning/projekt, läs-före-skriv på version+hash, 501 `upstream_operation_missing` via manifest)
- [x] UI: `/time-v2/expenses` + `/time-v2/expenses/:submissionId`, sidopost "Tid & utlägg" under Personal (flaggstyrd), kvitto via kortlivad signerad läsning, revisionskedja, godkänn/avslå/rättelse
- [x] Tester: 30 nya (kontrakt 9, proxy 16, UI-resa 5) + routing/menykontrakt; hela time-v2-sviten 191/191; tsgo + deno check + vite build gröna
- [x] Bevis: riktigt signerat staging-anrop – manifestet listar 23 operationer, inga `expenses.*` → 501; rendered UI i webbläsare (lista, v1, rättelse, v2-kedja, godkänn v2, gate)
- [x] Drift-yta `/time-v2/operations` (worker + arbetsdag): P1-korrigering – default "Kräver åtgärd" täcker nu timeNeedsReview, timeMissing (Time-grupp `missing` ELLER utlägg utan tidsinlämning), timeCorrection, openExpenses och unboundExpenses (ej avslutade); orsakschips i operatörsspråk per rad + detaljpanel; räknare "Tid saknas"/"Rättelse pågår"; 11 nya join-tester + 4 renderade
- [ ] EXTERN GATE (Time): lägg till `expenses.list/decide/receiptUrl` i `time-planning-adapter` med server-härledd `workspaceRef`, worker/displayName i snapshot, `isTestFixture`-flagga; därefter hostad resa mot riktig staging-fixture
- [ ] Deploy `time-planning-proxy` (kräver explicit go – ej gjort i detta paket)
- [ ] Gap: Time-snapshoten saknar `sourceAssignmentId` → exakt calendar_event kan inte bindas, bara bokning/projekt; moms finns inte i Times kontrakt (visas ej)
