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
- [ ] Versionerat kontrakt `planning-expense-review.v1` (Deno-shared + frontend-spegel, fail-closed parse, idempotens bunden till submissionId+version+canonicalHash)
- [ ] Proxy: `expenses.list` / `expenses.decide` / `expenses.receiptUrl` med staging-gate, org-/assignment-bindning, läs-före-skriv (version+hash), scrub av objectPath
- [ ] UI: `/time-v2/expenses` lista + `/time-v2/expenses/:submissionId` detalj (kvitto via kortlivad signerad läsning, revisionskedja, godkänn/avslå/rättelse med orsak)
- [ ] Tester: kontrakt, proxyhanterare, UI-resa (v1 → rättelse → v2 → godkänn exakt v2-hash), routing/menykontrakt
- [ ] Hosted/staging-bevis: riktig signerad staging-anrop som visar extern gate (adaptern saknar utläggsoperationer) + rendered UI
- [ ] Rapport: exakt extern gate, gap, nollräkningar
