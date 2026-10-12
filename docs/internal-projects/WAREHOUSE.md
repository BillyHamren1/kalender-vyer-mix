# Internal projects: Lager, WMS and Scanner checkpoint

Date: 2026-10-12. Base: `db15a2b1a305759800847322536c4d8fed836cb6`.
Branch: `codex/internal-projects-warehouse`. Owner: Warehouse worker.

## Delivered

- Permanent Lager lookup uses existing `projects.booking_id` -> `bookings.is_internal = true AND internal_type = warehouse`. It excludes deleted projects. A project name or generic internal flag cannot redirect Lager tasks or calendar blocks.
- Multiple canonical Lager projects cause a visible error rather than selecting the first row. No history is moved or recreated.
- Lager overview shift evidence excludes other internal booking types and surfaces failed reads.
- Location presence overview defaults to current month with explicit date filters. All pages are loaded before totals are shown, replacing the old 500-row sum. Page failures/count changes/duplicate IDs fail closed.
- Presence totals count only valid nonnegative finite closed durations. Open entries, zero-minute entries and missing durations are distinct. Missing completed duration is clearly incomplete.
- Presence is explicitly labelled as location evidence, not project work allocation or financial cost.

## Period semantics and limitations

`entry_date` (arrival-date cohort) is the filter, not overlap attribution. An entry beginning September 30 and ending October 1 belongs to September's cohort in full; one beginning October 31 and ending November 1 belongs to October's cohort in full. No claim of calendar-month worked-hour allocation is made. Financial reporting must use Time allocations.

Pagination checks row count and repeated IDs, but is not a transaction snapshot. A simultaneous same-count replacement/update can still change the result. For accounting-grade immutable totals, use server-side snapshot/approved allocation evidence.

## Authoritative equipment contract gap

Authoritative repositories verified read-only:
- WMS/Inventory: `BillyHamren1/bundle-builder-base` (`AGENTS.md`, `supabase/functions/create-reservation/index.ts` retrieved).
- Scanner: `BillyHamren1/datacapture-hub` (`AGENTS.md` explicitly establishes canonical standalone Scanner identity).

WMS create-reservation can take `external_id`, `external_source`, optional `source_booking_id`, dates and lines. It requires a signed server credential and organization header. It is not a browser-authorized project reservation endpoint. Operations currently calls `syncBookingToPacking(bookingId)`; standalone project without a booking explicitly returns without creating packings. Scanner read contract requires canonical booking identity in packing/context. Therefore equipment reservation/return for a booking-free internal project is NOT implemented or verified by this change.

### Required next equipment delivery

1. Define a server-side versioned work reference: organization + Operations project UUID + source kind (`internal_project`) alongside existing booking reference. Never put a fake project UUID into `booking_id`.
2. Operations server validates actor/project ownership and eligible project state, then sends an idempotent project-prefixed external reference to WMS. WMS remains inventory/reservation/allocation owner.
3. WMS adds explicit source-project provenance to reservation response/read contracts. Verify replay, line replacement, availability conflict and cross-tenant rejection. Keep Booking contracts backward compatible.
4. Scanner projects this work reference and WMS reservation ID through the signed read API. Existing scan/manual quantity commands keep their canonical WMS operation receipts and dedupe; add internal-project fixtures rather than local stock state.
5. Verify logged-in reserve -> pack -> scan out -> partial return -> complete return with an authorized disposable test project, plus rejected tenant/project mismatch and retries. No fabricated Booking/customer records and no production inventory mutation during this code batch.

## Dependencies and release criteria

Operations owns classification migration and narrowing `ensure_internal_lager_setup` to the exact warehouse booking. Integrate its migration before enabling finite projects. This branch requires no schema change itself.

- Focused tests: service identity, calendar generation/flag, complete 1101-row period, page failure/count drift, arrival-month boundary, UI date controls/zero/open/missing/error behavior, canonical Booking need, existing warehouse IN/OUT.
- Exact lockfile installed with `npm ci --ignore-scripts --no-audit --no-fund`. All 31 focused tests passed on declared Vitest 4.1.11. Optional unbuilt canvas package was moved out of local node_modules so jsdom uses its supported no-canvas path; no committed dependency/config change.
- Full TypeScript under borrowed runtime initially exceeded default 2 GB heap; 8 GB run completed with existing/missing dependency errors and no diagnostics in edited files. This is not a clean repository gate.
- Signed-in production/browser verification remains parent verifier responsibility. No production data mutated, no deployment performed.

Next restart: read parent integration checkpoint, run exact installed package checks, review merged Operations schema identity, then execute permitted signed-in Lager coexistence/date-filter flows. Do not claim the equipment chain complete until its server contract and physical return evidence exist.

## Final local evidence

Implementation commit: `9f3b3fe3f`. Exact Vitest 4.1.11: 6 files / 31 tests pass. Production `npm run build`: PASS (34.93 s). Full `tsc --noEmit -p tsconfig.app.json` with 8 GB heap reports seven TS2322 errors in untouched mutation callbacks (JobsListPanel, LargeProjectsListPanel, MediumProjectsListPanel, UnifiedProjectList three callbacks, ProjectManagement). No diagnostics in changed files; full type gate remains red.

Git push was rejected by automatic approval review because publication of internal code/documentation to the remote was considered insufficiently authorized. No workaround attempted, no PR created, no remote release. Parent has local commit for integration and is responsible for reporting/handling the publication block. Signed-in checks remain unverified.

Baseline type-check proof: a separate detached worktree at exact base `db15a2b1a305759800847322536c4d8fed836cb6`, using the same lockfile-installed dependencies and 8 GB heap, returns the same seven errors. `cmp /tmp/warehouse-tsc-baseline.log /tmp/warehouse-tsc-exact.log` returned 0 (byte-identical diagnostics); this branch introduces no TypeScript diagnostics.

Independent Time review: `store_verified_work_context_import` work_targets INSERT, `day-proposal` toTarget and client `mapTargetRow` must all preserve project classification. Existing Lager mapper is location-keyed; finite project context must use project UUID identity, so sharing a location does not combine projects. Findings sent to Time worker and parent; no Time files changed by Warehouse worker.
