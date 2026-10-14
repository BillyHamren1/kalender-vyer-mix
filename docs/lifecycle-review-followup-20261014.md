# Lifecycle review follow-up, 2026-10-14

This supersedes the typecheck status in `booking-lifecycle-validation.md`. Seven delete/cancel mutations now pass only their ID to service functions; React Query's mutation context no longer occupies the optional `performedBy` parameter. Full `tsc --noEmit -p tsconfig.app.json` passes on the reconstructed exact PR source plus this change with an 8 GiB Node heap and reused dependencies. The remote clean-install gate remains authoritative.

All 151 tests in the eight documented lifecycle suites pass. The production cancellation function was read without changing production and replayed in the isolated fixture with the proposed migration. This exposed two fixture mismatches: production `booking_changes.changed_fields` is JSONB and `packing_list_items.wms_item_type_id` is text. The fixture and its copied function now use these actual types. Cancellation assertions now explicitly reject absent/null receipts instead of permitting SQL NULL comparison to skip a check. Both the ordinary fixture and the replay of the observed production function pass locally in PGlite. This is still not a full schema/trigger/permission replay.

The new database CI matrix runs the actual migration and contract assertions against PostgreSQL 15 and 17, plus a full application typecheck. Booking and WMS companion gates run their original multi-connection tests.

Production read-only checks found 15,025 packing rows, including 185 with packed quantity exceeding returned quantity. The cancellation patch anchors match the deployed function. Existing applied revisions have valid revision kinds. No test booking or other production write was performed.

Further review also reproduced a return-only history gap: a commercial edit could change demand or inventory identity when only `quantity_returned` or `returned_at` recorded physical history. The guard now includes both, with a regression that fails before the fix and passes afterwards. Existing return resolution remains allowed. Production project status constraints accept cancellation and the inspected packing foreign-key cascades match the fixture's deletion path.

WMS production read access has now been established through its owner-authorized Lovable connection. The release remains blocked pending full isolated schema replay and deployed end-to-end verification. Booking's minute worker and enqueue wake trigger must both be controlled during cutover.

Code integration may proceed after exact-head CI and removal of WMS's partial automatic deployment path. Lovable's documented Git sync does not apply migrations, deploy changed Edge Functions or publish the app. Merging code is not migration approval. The detailed plan and remaining deployment gates are in WMS `docs/coordinated-lifecycle-release.md`.

Order after release prerequisites are met: pause/drain all old delivery entry points; WMS migrations and endpoints together; Operations migration then importer/helpers/UI; Booking migration then exporter/worker/mobile observer/browser; validate receiver application outcomes before resuming delivery. No production writes or test bookings have been performed.

## Production rollout evidence, 2026-10-14 (Operations)

- Pre-check (read-only): `retired_from_booking_at` absent, none of the six new functions present, migration version `20261013134026` not recorded. Snapshot: 15,025 `packing_list_items`, md5(string_agg(to_jsonb(i)::text,'' ORDER BY id)) = `2a9e773f2fb7a06b1687f3fa3ee6d3e3`; 8 allocations, md5 `bc88a4b0e3b15b6f73edc68170fd8993`.
- Applied exactly `supabase/migrations/20261013134026_preserve_booking_cancellation_work.sql` (file md5 `9e9a1a3309755c9c241806cf6bac51ab`) once, as one migration, via the normal migration tool. Both function-shape anchors passed; no safety rejection.
- Post-check (read-only): 15,025 rows, hash excluding the new column unchanged (`2a9e773f…`); 0 rows with `retired_from_booking_at`; allocation hash unchanged. All five triggers present. `apply_booking_cancellation_atomic` no longer contains `DELETE FROM public.packing_projects` and its receipt reports `packing_preserved`. `record_booking_cancellation_notice_atomic` contains no calendar delete; EXECUTE: service_role yes, authenticated no, anon no. Independently re-verified by the coordinator.
- Importer: the coordinator fetched the deployed `import-bookings` v1294 bundle and byte-compared `index.ts`, `_shared/cancellation-notice.ts` and `_shared/singleBookingResult.ts` with merge `3440837858c7b6a185827a4d1c8fc411ce58e684`: all match. Not redeployed.
- No real cancellation, test booking or synthetic production data was used.
- Tests: earlier PG15/17 CI, 151 contract tests and full `tsc` passed. The local Vitest runner currently fails at startup (`isFileLoadingAllowed` missing from `vite`). This is an environment limitation, and the run does not replace those tests.
- Published UI (read-only HTTP, 09:16 UTC): `kalender-vyer-mix.lovable.app` and `planning.e-flow.se` both return 200 with entry `index-utjygDc6.js`. The PR57 retired-row text "Borttagen från bokningen – kontrollera…" is present in lazy chunk `PackingDetail-DwQM3LGN.js` (225 chunks crawled).
- Separate, unchanged: 8 pre-existing critical security findings (permissive RLS on task_comments, time_reports, webhook_subscriptions, transport_email_log, warehouse_assignments, staff_members, one further table; map-snapshots storage delete). Not related to this release.
- Remaining: Booking final migration/deploy/resume is in progress. Delivery stays paused until receiver outcomes are validated.
