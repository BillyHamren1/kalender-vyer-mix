# Lifecycle review follow-up, 2026-10-14

This supersedes the typecheck status in `booking-lifecycle-validation.md`. Seven delete/cancel mutations now pass only their ID to service functions; React Query's mutation context no longer occupies the optional `performedBy` parameter. Full `tsc --noEmit -p tsconfig.app.json` passes on the reconstructed exact PR source plus this change with an 8 GiB Node heap and reused dependencies. The remote clean-install gate remains authoritative.

All 151 tests in the eight documented lifecycle suites pass. The production cancellation function was read without changing production and replayed in the isolated fixture with the proposed migration. This exposed two fixture mismatches: production `booking_changes.changed_fields` is JSONB and `packing_list_items.wms_item_type_id` is text. The fixture and its copied function now use these actual types. Cancellation assertions now explicitly reject absent/null receipts instead of permitting SQL NULL comparison to skip a check. Both the ordinary fixture and the replay of the observed production function pass locally in PGlite. This is still not a full schema/trigger/permission replay.

The new database CI matrix runs the actual migration and contract assertions against PostgreSQL 15 and 17, plus a full application typecheck. Booking and WMS companion gates run their original multi-connection tests.

Production read-only checks found 15,025 packing rows, including 185 with packed quantity exceeding returned quantity. The cancellation patch anchors match the deployed function. Existing applied revisions have valid revision kinds. No test booking or other production write was performed.

Further review also reproduced a return-only history gap: a commercial edit could change demand or inventory identity when only `quantity_returned` or `returned_at` recorded physical history. The guard now includes both, with a regression that fails before the fix and passes afterwards. Existing return resolution remains allowed. Production project status constraints accept cancellation and the inspected packing foreign-key cascades match the fixture's deletion path.

WMS production read access has now been established through its owner-authorized Lovable connection. The release remains blocked pending full isolated schema replay and deployed end-to-end verification. Booking's minute worker and enqueue wake trigger must both be controlled during cutover.

Code integration may proceed after exact-head CI and removal of WMS's partial automatic deployment path. Lovable's documented Git sync does not apply migrations, deploy changed Edge Functions or publish the app. Merging code is not migration approval. The detailed plan and remaining deployment gates are in WMS `docs/coordinated-lifecycle-release.md`.

Order after release prerequisites are met: pause/drain all old delivery entry points; WMS migrations and endpoints together; Operations migration then importer/helpers/UI; Booking migration then exporter/worker/mobile observer/browser; validate receiver application outcomes before resuming delivery. No production writes or test bookings have been performed.
