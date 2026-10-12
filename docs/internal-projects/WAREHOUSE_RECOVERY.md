# Warehouse recovery — 2026-10-12 19:02 UTC

Owner: `/root/warehouse_recovery`. Local recovery only; no WMS/Scanner publication, hosted migration, deployment or stock request. Earlier unpublished local implementation is unavailable and has not been represented as recovered. Only the authoritative files required for this review were materialized.

## Verified pins

- WMS main `4f97b6de4afdfa30b679e7e44a49c1ef8e729d6d`.
- WMS existing PR7 `f8d28f05f5653253cebba7f72c52973ef5496fcb`, open; base `7b40079953ac72b7c8f3dcbbd18d18fdd2bc40c3`.
- Scanner main `85ce28fcbd458427865276fb67417401f8356164`.
- Published Operations design `EQUIPMENT-OWNER-SEAM.md` blob `aa6065f6282a77732831200f4e18166227657b66`; identity contract `EQUIPMENT-WORK-REFERENCE.md` blob `d8a9fb5012e51d9869692225982d0f0de08530e8`.
- Both repo AGENTS read. WMS retains stock truth; Scanner cannot recreate it. No published history rewritten.

## New finding, executed

Actual WMS `reserve_inventory_atomic` defaults `status=pending`, whereas actual `get_available_item_type_quantity` subtracts only `confirmed` and `checked_out`. PR7's `bundle-core-chain-fixture.sql` substitutes availability that subtracts almost every nonterminal status, including pending. Therefore that fixture alone cannot establish that a newly created pending reservation actually holds stock in the current owner implementation.

`node recovery-warehouse/reservation-owner-runtime.mjs` executed the real main reservation/demand migration `20260822201759_2ed23ac3-2ce7-4808-aef0-e62e55252e48.sql` and real availability migration `20260822175834_9d07d362-72ef-49f1-a765-823bb79c0d8e.sql` inside PGlite 0.5.9, with synthetic tables based on the exact PR7 fixture. The fixture availability implementation was replaced by the actual owner function. Three checks PASS:

1. Pending create succeeds but the sole physical item remains available.
2. Explicit confirmed reservation succeeds and availability becomes zero, without a Booking table or row.
3. Another confirmed reservation fails `insufficient_availability` and leaves no new reservation row.

These are sequential synthetic database checks, not real PostgreSQL concurrency, a complete production schema reset, source authorization, UI or hosted proof. `tenant_scope_org` is a null-returning synthetic fixture. The test does not claim tenant authorization.

## Bounded implementation decision

The first reservation-only extension must set the WMS operational reservation status to **confirmed server-side**. This is not a commercial Booking confirmation and must never create a Booking or invoice. It must not accept browser-supplied quote/pending/status or allow_overbooking. Keep outbound/return UI disabled.

Use one new private WMS transaction over existing `reserve_inventory_atomic` and `replace_reservation_lines_atomic`. Do not copy stock math or introduce a new inventory ledger. Exact protocol:

- A typed Operations project reference includes source tenant, finite internal-project ID, opaque request revision, and explicit predecessor revision. No UUID-as-booking adapter and no timestamp cast.
- Server-verified source authorization binds authenticated actor, source organization, project, request digest, operation UUID, target WMS organization, action and validity interval. A credential signature alone is insufficient. Source must establish current project/actor authority; the WMS transaction must bind an accepted immutable source proof rather than caller-declared `verified=true`.
- Canonical request digest includes dates and complete catalog line identities/quantities. Existing WMS catalogue tenant membership, positive integer quantity and mutually exclusive article/package validation must run before the stock helper. Empty/unfinished package demand is unknown, never silently zero.
- Acquire a lock keyed by tenant+source+project before create/replace/replay. Recheck exact actor and grant authority before returning an old receipt. Same operation+different actor/reference/digest conflicts. Exact retry returns original receipt only; predecessor CAS prevents old replacement overwriting new state.
- Delegate stock mutation with overbooking=false and confirmed status; treat `ok=false` as transaction failure, not a success-shaped receipt. Persist immutable work-reference/proof binding and receipt in the same transaction; injected receipt failure must roll back owner reservation and movements.
- Keep one reservation per source project mapping. Never route through existing `create-reservation` duplicate header upsert (its header mutation is separate from replacement transaction).
- Authoritative status recovery reads receipt/provenance only. It never reissues a stock command. Cancellation before checkout and return after archive are distinct: a project archive must not strand equipment. Return after archive needs its own live permission, original receipt, quantities and WMS lifecycle checks.

No new source-grant producer/issuer or activation policy was invented in this recovery. That actual Operations dependency must be agreed and implemented before a callable WMS endpoint. A dormant private SQL candidate can then be built and tested with synthetic issued proofs, explicitly without asserting integrated authorization.

## PR7 reconciliation and remaining tests

PR7 contains checkout serialization, reservation locking, return-chain and lifecycle guards absent from main; current main carries newer signed gateway/projection/status and quantity/revision work. Reconcile only the necessary owner dependencies onto current main. Do not merge the entire PR or run both operation ledgers. Existing `time_pack_scan_operations` versus pending `scanner_operations` must be explicitly routed/versioned, never dual-dispatched.

Next concrete batch: restore the relevant PR7 pending lifecycle migrations plus current main exact-quantity/revision dependencies, select one owner operation route, then implement source-bound reservation transaction and its isolated harness. Tests must use actual availability implementation identified above. Required: wrong tenant/actor/grant, replay/changed payload, predecessor conflict, shortage, receipt rollback, native competing demand, replacement rollback and legacy Booking regression. Scanner conformance remains false until full owner outbound/return receipts and authenticated disposable E2E pass.

Publication authorization remains outside this local task. Parent may persist this review document in Operations but must not publish WMS runtime code in another repository as a workaround.
