# WMS loading architecture — implementation status (2026-10-19)

## Summary
| Part | Status |
|---|---|
| Bounded overview reads, pagination, bounded concurrency, no polling, org+actor cache, calendar/personnel gating, staff key split | **Done in code** |
| Client delta engine (cursor, paging, merge of affected packings only, retention reset, bootstrap race, fallback) | **Done in code + tests** |
| Server changefeed (`docs/performance/wms-changefeed.sql`) | **APPLIED 2026-10-18** to the connected project `pihrhltinhewhoxefjxv` via migrations `20261018225802` (feed), `20261018225911` (grant hardening) and a follow-up rebinding `wms_feed_allocations` to the dedicated `wms_record_allocation_change()`. Source of truth: `supabase/migrations/`; the docs SQL file is superseded |
| Server-side progress aggregate | Not done — progress is recomputed client-side with canonical `computePackingProgress`, only for reloaded packings |

Until the SQL is applied, `wms_changes_since` returns PGRST202 (verified), the client marks the feed `unsupported` and uses the previous behaviour: coalesced realtime signal → re-read of the selected window. Once applied, no code change is needed.

## Reuse check
`booking_changes`, `warehouse_project_changes`, `packing_change_requests` are user-mutable domain tables (acknowledge/update/delete allowed, no cursor, no coverage of items/allocations/assignments). Not suitable as a durable feed; a separate append-only feed was designed instead.

## Server design (wms-changefeed.sql)
- `wms_change_cursors(organization_id, last_seq, retained_from_seq)`; trigger does `UPDATE … SET last_seq = last_seq + 1 … RETURNING` → row lock held to commit, so per-org seq order = commit order (no out-of-order commit gap).
- `wms_change_events` append-only: seq, table, entity, op (DELETE = tombstone), packing_id/booking_id parents, `old_window`/`new_window` (dates, status, packing_id, staff_id) for move in/out and reassignment.
- Triggers on packing_projects, packing_list_items, packing_list_item_allocations (org resolved via item), warehouse_assignments, warehouse_calendar_events, bookings (date/name columns), staff_members (name/active/tags).
- Writer trigger functions are SECURITY DEFINER because clients have no insert grant on the feed; they only append metadata for the row's own org and are not executable by clients. Reads: `wms_changes_since(p_after, p_limit≤1000)` is SECURITY INVOKER, RLS `organization_id = get_user_organization_id(auth.uid())`, EXECUTE granted to authenticated only.
- Retention: `wms_prune_changes(interval '7 days')` (service_role) advances `retained_from_seq` before deleting.
- Realtime publication only on the cursor row (wake-up).

## Client (src/lib/warehouse/wmsChangefeed.ts, src/hooks/useWmsChangeSync.ts)
- Head cursor read before the first snapshot (query waits), then catch-up replays bootstrap writes.
- `catchUp` pages until head; cursor stored per `org:user` and advanced only after all merges succeed; retention gap → invalidate window (full snapshot).
- Wake-ups: realtime on own org's cursor row, channel (re)subscribe, tab becoming visible; coalesced 300 ms, paused while hidden. Manual refresh = catch-up. No periodic reads.
- Merge: affected packings (incl. old packing on reassignment, packings of moved bookings, packings with renamed staff) are re-read with `fetchOpsRange(..., onlyPackingIds)` and replaced in every cached window of that org; summary/attention recomputed. Personnel/crew queries are invalidated only when assignment/event changes arrive.
- Overview candidate query now bounded: bookings with rig/rigdown ≥ min(today, window start), internal tasks by own dates, plus in-progress/returning/back. Stale open packings of old bookings are no longer read.

## Tests
- `src/test/wmsChangefeed.test.ts` (17): single change, delete, date move in/out, reassignment, child progress, bootstrap race, offline paging, no cursor advance on failure, retention reset, tenant isolation, fallback detection, SQL cursor/invoker/coverage, no full refetch when feed ready, bounded candidates.
- `src/test/warehouseOpsRangeWindow.test.ts` (13).
- Warehouse suite: 104/107 pass; 3 failures are pre-existing menu-text tests ("Lager OPS").

## Limitations
- Verified after apply: 7 triggers, realtime publication on `wms_change_events`, anon gets 42501 on RPC and table, `authenticated` has SELECT + EXECUTE only (no INSERT/UPDATE/DELETE), RLS org policy via `get_user_organization_id(auth.uid())`. A signed-in RPC call could not be exercised from the sandbox (external_unmanaged auth); 0 events existed right after apply.

## Applied design (corrections vs. the earlier draft)
- Draft bugs fixed: `entity_id`/`booking_id` were `uuid` but `bookings.id`, `staff_members.id`, `booking_id` are `text` — the cast would have broken production writes. Now `text`.
- Draft per-org cursor row lock (UPDATE ... RETURNING) dropped: it serialized all WMS writes per org and could introduce deadlocks with bulk imports. Replaced by a lock-free **transaction-id watermark**: each event stores `txid`; the RPC only returns transactions with `txid < pg_snapshot_xmin(current snapshot)` (all finished), so a later commit can never land behind the cursor. `seq` in the response = txid, `head` = xmin-1, pages contain whole transactions.
- Allocations use a dedicated narrow writer `wms_record_allocation_change()` (catalog-verified trigger target). Org = allocation's own `organization_id` (fallback parent item/parcel); packing = parent item, else `packing_parcels.packing_id` via `parcel_id` (survives cascade delete of the item). If both are gone (whole packing deleted), the packing/item DELETE events in the same transaction carry the packing id. Old/new `packing_list_item_id`/`parcel_id` are stored in the window.
- Status 2026-10-18 23:0x UTC: 0 events in the feed yet (no WMS writes since apply); no synthetic business write was made to test it.
- Booking/staff triggers fire only when watched columns actually change (`IS DISTINCT FROM`).
- Realtime wake-up subscribes to INSERTs on `wms_change_events` (RLS-filtered); the client adds a one-shot 3 s follow-up catch-up for commits briefly held back by an older open transaction.
- Retention: `wms_prune_changes(interval)` (service_role; fixed in migration 20261018230650) uses the same safe boundary as the read RPC — one `pg_snapshot_xmin(pg_current_snapshot())` per run; watermark only advances to events with `txid < xmin` older than p_keep and deletes only `txid <= watermark AND txid < xmin` — then advances `wms_change_cursors.retained_from_seq` then deletes; client resets the period if its cursor is older. Scheduled via pg_cron job `wms-prune-changes-daily` (jobid 23, `15 3 * * *` UTC, runs `SELECT public.wms_prune_changes(interval '7 days');` as `postgres`). Only this feed is pruned; no other cleanup is scheduled. Max retention ≈ 8 days; a client offline longer gets a full period reset.
- Shifts (time_reports) in the overview are not in the feed; they refresh on full snapshot.
- Personnel week is re-read (org-scoped, small) on assignment changes rather than merged per record.
