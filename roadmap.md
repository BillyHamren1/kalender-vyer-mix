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
