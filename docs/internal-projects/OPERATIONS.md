# Internal projects — Operations checkpoint

## Metadata producer continuation 2026-10-12 15:15 UTC

Owner `/root/cost_completion` resumed from `1691fad762e3aaaeeb7e2d545830d2e5ab000313` on the same canonical branch. Fresh exact PR48 source review at `5f0c934ab99795f1185cfa165f1f21131d81cd61` confirms its rate enrollment and cost ingress remain shadow contracts; current staff hourly rates cannot be promoted to historical accepted rates. The Finance accepted-cost port remains unimplemented. No parallel ledger was created.

One previously labeled external dependency was implementable locally: the authoritative Operations project row now has a prospective, atomic metadata outbox in additive migration `20261012150947_internal_project_metadata_outbox.sql`. Receipt schema `operations-project-metadata.v1` binds exact source organization/project, monotonic revision, schema, operation, effective and declared classification, legacy flag/booking identity, nullable budget and currency, and SHA256. It captures source mutations only; no dispatcher, Finance enrollment, cost writer or deployment exists. Details and rollout/rollback boundaries are in `PROJECT_METADATA_CONTRACT.md`.

No initial backfill or historical-budget completeness is inferred. Legacy `declared_project_kind=null` observations are not explicit Finance enrollment. Source subtype changes must conflict/quarantine in Finance after enrollment; metadata never lifts missing accepted-cost/financial-close guards. PostgreSQL JSONB fingerprint is not an interchangeable JavaScript/raw-body signature. Existing-row enrollment and frozen final budget revision remain separate required work.

Tests: 12 actual-migration synthetic PostgreSQL-WASM scenarios PASS; existing 14 classification/billing/closure assertions and atomic-create/retry/rollback/tenant fixture PASS. Root independently reran 12/12. `/root/upstream_readiness` independently reviewed SQL and executed 12+3 scenarios PASS, including extra source/privilege/legacy cases. Native overlapping-session, full hosted schema/RLS and authenticated runtime acceptance remain OPEN. `git diff --check` PASS. No unrelated app code changed, so earlier full application checks are retained without a new full-build claim.

Operations lease released after this local commit. Parent owns integration/release. Remaining concrete chain: accepted Time receipt mapping + historical rate administration/coverage, canonical Operations publication, immutable tenant/project Finance metadata enrollment, accepted source port and transport, frozen budget revision, current-head CI and authorized published/inlogged acceptance. Source publication remains blocked pending parent resolution; no push, deployment, production migration, credentials or financial action occurred.

Owner: `/root/operations_continuation`. Local atomic lease released after checkpoint (2026-10-12 13:54 UTC). Branch `codex/internal-projects-operations-20261012` from main `db15a2b1a305759800847322536c4d8fed836cb6`.

## Contract

- `projects.project_kind`: nullable `customer | internal_project | internal_activity`. Null resolves to internal_activity only when legacy `is_internal=true`, otherwise customer. No name or absent-booking inference.
- Finite internal projects explicitly keep `is_internal=false`, `booking_id=null`. Existing warehouse booking identity remains canonical for Lager. New internal projects never create commercial bookings.
- `budget_hours`, `remaining_hours`, `budget_cost_minor`, `remaining_cost_minor`, `budget_currency`, `internal_goal`, `followup_note` are additive. Unknown is NULL, zero is explicit. Current budget currency is SEK, matching the legacy authoritative cost projection; no relabeling of currency.
- Existing `project_staff_time_cost_lines` is read by exact project ID with pagination. Only known valid rate_source values expose complete personnel amounts. No second ledger or browser calculation of minutes × rate.
- Internal projects are excluded from commercial economy/TB overview. A separate project panel shows scoped hours and approved/preliminary personnel costs, budget and weekly follow-up.
- Operational completion requires tasks complete and saved zero remaining hours/cost, enforced on INSERT and UPDATE. It creates no billing object. It is explicitly distinct from financial reconciliation.
- Database guards block internal billing including alternate project_type, billed-to-internal relabeling, finite internal booking links, and commercial bookings on explicit internal_activity. Project row lock serializes billing with classification. Lager initialization uses exact warehouse booking plus organization and advisory lock; no broad legacy flag selection.

## Evidence

- `npx vitest run --environment happy-dom src/lib/projects/__tests__/projectKind.test.ts src/pages/__tests__/createProjectWizardWireup.test.ts src/lib/economy/economyRevenueSource.contract.test.ts`: 8 passed.
- `PGLITE_MODULE=/tmp/internal-project-db/node_modules/@electric-sql/pglite/dist/index.js node scripts/internal-projects/database.test.mjs`: 12 synthetic PostgreSQL-WASM behavioral assertions passed (guards, insert/close bypass, approved role direct writes, customer regression, precise Lager selection).
- Original jsdom test invocation unavailable because optional canvas native binary absent after ignore-scripts install; happy-dom invocation above executed tests.
- Typecheck passed before latest SQL-only amendments; final typecheck/build running.

## Open completion gates / exact next work

1. Integrate Warehouse branch and independently review migration including actual hosted RLS policies/caller grants. SQL tests use minimal old schema, not entire historical migration catalog or hosted tenant acceptance.
2. Time worker must wire exact project ID through authenticated work-target and submission path; merely showing project hours is not proof new Time can submit them.
3. Finance canonical publication remains OPEN. Active economy PR48 is 677 files with unrelated native runtime gates; do not wholesale merge or duplicate immutable ledger. Existing main source is `project_staff_time_cost_lines`, but source revision lineage must be proven before transport.
4. Supplier invoices, purchases, full EAC, financial closure and weekly aggregate views remain open; internal panel explicitly does not claim full cost.
5. Authenticated real UI/device, hosted migration, exact deployed version and rollback acceptance remain OPEN. No deployment/push performed. Restore previous frontend while retaining additive columns/data as rollback; review trigger rollback separately if needed.
6. Parent handles integration/release and hourly continuation. No automated customer communications.

## Follow-up evidence

- Producer now exports assigned active finite internal projects from existing `project-<uuid>` calendar references through the existing signed assignment path. Exact project+tenant+team/day binding; no fake booking row or incompatible target metadata. Closed/cancelled/customer/cross-tenant/unassigned placeholders excluded. Five new behavioral producer tests pass.
- Internal reader five behavioral tests pass including >500 records, rejected submissions, backend failure, missing rate provenance, negative/nonfinite evidence. Invalid numeric evidence remains unknown.
- Independent Booking worker executed 10 additional embedded PostgreSQL assertions, found and fixed invisible cross-tenant medium billing target: guard now fails closed on absent/mismatched organization target. Full old schema/RLS/native concurrency remains open.
- Production build passed (31.48 s, existing large chunk warnings).
- Correction: full TypeScript was NOT green. First invocation exhausted default heap; 8 GB rerun reports existing mutation-signature errors in UnifiedProjectList/ProjectManagement. No claim of a clean global type gate.
- Adjacent workOrderSync has 2 failures in unchanged expectations (phase vs kind and extra phase_invalid gaps); affected new producer 5 tests pass. Parent must baseline-confirm these before release.
- Source publication limitation: main `staff-day-cost-lines.ts` deletes then reinserts projection, reads frozen submission snapshots but no immutable accepted revision/hash. Cannot treat random row IDs as versions. Atomic publication requires replacing this multi-call rebuild with a revisioned transaction/outbox; dormant Finance adapter must remain inactive until that seam is independently verified.

Latest classification hardening: effective internal→customer downgrade is rejected (including clearing project_kind or legacy is_internal), preventing classification removal before billing. Finite numeric budgets reject NaN/Infinity and amounts exceeding JavaScript safe integer range. Fourteen own PostgreSQL-WASM classification/closure/billing assertions pass. Runtime corrected submissions remain preliminary; mutation audit callbacks pass only the intended ID. Parent full TypeScript gate passes with 8 GB heap. Hosted/authenticated real-chain gates remain open.

## Atomic internal creation

New additive migration `20261012130533_atomic_internal_project_creation.sql` adds a SECURITY INVOKER RPC for internal-only project plus initial tasks. Organization derives from authenticated actor, existing tenant RLS remains active. Stable per-dialog project UUID + immutable request hash makes unknown-commit retries return the same project without duplicating tasks. A changed request under an already committed UUID conflicts. PostgreSQL transaction rolls back project and earlier tasks when a later task fails. Customer creation remains existing route. Dates use local calendar format instead of UTC conversion. Hash cannot be changed or backfilled through direct UPDATE.

`atomic-create.test.mjs` embedded PostgreSQL role/RLS fixture passes creation/retry, changed request conflict, hash tampering rejection, invalid task rollback, bad date rejection, foreign tenant, restricted role, anonymous and missing auth checks. Full TypeScript app gate passed after this UI change. Hosted schema and concurrent sessions remain parent release gates.

Personnel formatting now explicitly SEK regardless of budget label; UI identifies recorded cost for approved time and explicitly says historical rates have not yet been reconciled. No historical-rate lineage claim is made.

## Creation recovery checkpoint 2026-10-12

Pending creation now persists exact request and UUID scoped to actor and organization before sending. Unknown network outcome survives dialog reopen and page reload; retries reuse the original payload. Both client and server reject mismatched expected actor/organization. Only an explicit first-attempt PostgreSQL rollback clears pending state; a later denial after an unknown outcome preserves recovery. Corrupt/unavailable storage blocks a new attempt safely. Receipt identity is checked before clearing the pending request. Recovered creation also warns if calendar synchronization returns unsuccessful or zero events.

Seven service behavioral tests pass, independently rerun by Time, plus actual SQL fixture with expected identity guards. Full application TypeScript check passed with 8 GB heap. Restricted-role SQL fixture proves its synthetic grants only, not an additional production application-role policy. Actual hosted signed-in interaction and multi-session concurrency remain open.

Empty or excluded-only cost projections now show unknown hours and unavailable amounts. Nonempty registered evidence is explicitly not proof of complete coverage or historical rates. Finance independently verified this behavior.

Actual wizard renderer recovery tests now pass (2): pending unknown response, close/reopen, exact payload retry, checked receipt, missing-calendar warning, and malformed storage disabled. Pending retry explicitly skips draft HTML validation because it sends the saved server-validated request; normal creation validation remains enabled. Seven service tests complement these actual component interactions.

Separate Operations checkout (not integrated runtime here): Independent Booking/Catering review accepted bounded source prototype86f1a6fbc: owner harness plus six additional scenarios (cross-tenant resurrection, same-tenant resurrection hash/sequence, source ID mutation, JSON key order replay, privileged outbox mutation, anonymous read). Hosted concurrent sessions remain open; immutable source receipt is not a priced accepted financial receipt.

## Continuation 2026-10-12 13:53 UTC

Fresh control plan read: `PROGRAM.md` SHA `f9df07b791be62cdce092e4916e3628bfff2bd75`. PR48 remains open draft at exact head `5f0c934ab99795f1185cfa165f1f21131d81cd61`, reports not mergeable; its broad accepted-cost implementation must not be wholesale merged or replaced with a parallel ledger. Starting local Operations source `0ec8d3d94865827687cc613e7cc691df664f4920`; parent owns main-drift reconciliation and integration.

Actual rendered follow-up reproduced three unsafe UI cases before correction: visible unsaved remaining work did not block operational close, failed save still allowed close, and edits were possible while saving. The follow-up now requires its visible edits to be successfully saved before close, retains unsaved state on failure, and disables competing edits/actions while saving or closing. Saved nonzero remaining work is still rejected by the existing database guard; this change does not replace it. Three renderer regressions and seven current-evidence reader tests pass (10 total, exact Vitest4.1.11 / happy-dom).

No source push, migration, deployment, financial action or logged-in runtime test occurred. The prior automatic publication rejection remains unresolved. Source capture remains dormant, without historical accepted rate proof, canonical Time receipt mapping or official Finance transport. Remaining program gates require parent integration/current-head CI, reviewed historical rate ownership and accepted publication, hosted RLS/multi-session database checks, and secure authenticated runtime acceptance. The local prototype cannot satisfy these through synthetic evidence alone. Reuse current source rather than reconstructing another implementation.

Full application TypeScript check (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.app.json`) passed after the follow-up change. Combined build and independent integration review are parent-owned gates.
