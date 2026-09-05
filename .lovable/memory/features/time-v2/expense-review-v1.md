---
name: Time V2 Expense Review v1
description: Planning "Tid & utlägg" reads/decides Time V2 expenses only via planning-expense-review.v1 through time-planning-proxy; Time owns immutable snapshots; decisions bound to submissionId+version+canonicalHash; staging-locked; no posting
type: feature
---
**Kontrakt:** `planning-expense-review.v1` lever EN gång i `supabase/functions/_shared/time-v2/expenseReviewV1.ts` (dependency-free) och importeras oförändrat av frontend (`src/features/time-v2/lib/expenseContract.ts` re-exporterar). Ingen spegel, ingen drift.

**Regler:**
- Time äger varje utlägg som IMMUTABEL snapshot (`expense-submission.v1`). Planning mirrorar/skriver aldrig om en version; ny rättelse = ny `submissionId` med `previousSubmissionId`, visas som egen revision i kedjan.
- Beslut (`approved|rejected|correction_requested`) går alltid via proxyn `expenses.decide` med exakt `submissionId + submissionVersion + expectedSnapshotHash`; proxyn gör läs-före-skriv och avvisar `stale_revision` / `stale_hash` / `already_decided` (409); Times kvitto måste bära samma version+hash annars `decision_hash_mismatch` (502). Idempotensnyckel = `planning:expenses.decide:<id>:v<n>:<hash16>:<decision>`.
- Avslag/rättelse kräver synlig motivering (3–1000 tecken); godkännande kräver ingen.
- Tenant: snapshots med annan `organizationId` än `TIME_ADAPTER_ORGANIZATION_ID` filtreras bort server-side. Assignment: `lineage.bookingRef` (booking_number) / `projectRef` (project id eller booking id) måste lösas org-scopat i Planning → annars `unbound` = synlig men spärrad för beslut och kvitto.
- Kvitto öppnas ENDAST via `expenses.receiptUrl` (kortlivad signerad https-läsning, 120 s), mintas per klick, lagras aldrig, `objectPath` når aldrig webbläsaren.
- Preview-lås: proxyn vägrar utläggsoperationer mot annan Time-host än `pklkhhfvgmexsrkkpkzt.supabase.co` (`preview_gate_closed`, 503). Ingen produktionsväg finns.
- Ingen bokförings-/löne-/projektkostnadspostning får finnas i ytan (`assertNoPostingFields` + statiskt test).
- Extern gate: när Times `time-planning-adapter`-manifest saknar `expenses.*` svarar proxyn 501 `upstream_operation_missing` och UI:t visar en gate-ruta — aldrig tom lista eller mock.
- Moms finns inte i Times kontrakt → visas aldrig; valuta visas.
