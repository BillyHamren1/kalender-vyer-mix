# Order flow transition — stage 1 implementation

This stage keeps both existing Booking/Operations synchronization paths. It introduces an **isolated comparison**, not an additional writer to reservations, packing lists or invoices. Production activation and the complete canonical cutover are not complete.

## Which flow is actually being checked?

| Evidence | Meaning | Does not mean |
| --- | --- | --- |
| Existing `inventory_sync_status` | Existing flow reports its own outcome | New flow worked, or Lager has current contents |
| `order-shadow-v1` stored receipt | Inventory accepted an isolated revision | Inventory readback or module parity succeeded |
| `readback_matches` at current revision | Independent Inventory read returned the exact source facts and server projection | Planning, Lager, stock lifecycle or invoicing switched source |
| `blocked` | The isolated input is incomplete or ambiguous | Products may be guessed or omitted |
| `cutover_ready: false` | Source change is prohibited in this stage | A UI flag can activate the central writer |

The internal Booking product tab, Planning order view and Lager detail show the active route separately from this evidence. Status refreshes every ten seconds and on focus. No status is presented in the customer product tab. A matched older revision cannot approve a newer edit. A successful legacy flow cannot approve a failed shadow run.

## Financial dependency guard

Existing `booking_products`, `project_billing`, `booking_invoices`, invoice builders and `booking_finance_private` triggers/outbox remain active and unchanged. Capture the actual stored values, never reconstruct them using warehouse quantities.

| Dependency | Preserved facts / behavior | Later cutover requirement |
| --- | --- | --- |
| `buildInvoicePayload.ts` | Quantity, unit price, discount, VAT, stored rounded row total, negative manual rows | Run the same builder against central commercial occurrences |
| `project_billing` | Approved invoiceable amount, invoiced amount, plan, closure and billing state | Preserve read contract and mutation/audit effects |
| `booking_invoices` | Issued amount, status, invoice identity and history | Historical invoices remain immutable; preserve remainder calculations |
| `booking_finance_private` | Existing source sequence, triggers, delivery, partial billing state | Replace product read adapter and equivalent change signal together |
| Catering / staffing | Current raw source fields and stored commercial facts | All real authoring paths must pass canonical tests first |
| Quote / customer document | Current source and sent document history | Change only live read adapter; keep issued snapshots |

The shadow worker has no invoice creation, Finance notification, reservation replacement, packing write or stock movement capability. Full raw product records and billing snapshots remain inside private schemas. Only minimal status is returned to readers who already have booking read permission.

## Implementation boundaries

1. Opt-in organization controls default to disabled and enforce `active_source = 'legacy'` with a database constraint.
2. Source writes enqueue a monotonic revision in their transaction. Claim reads a consistent complete snapshot; a browser-provided list is never accepted.
3. The worker uses a dedicated background credential and a separate tenant-bound Inventory credential. Receiver connections explicitly map Booking organization to WMS organization. Storefront credentials are rejected.
4. Receiver computes the projection and hashes itself. Same revision and content replays without creating a new snapshot; same revision with different content conflicts. An unseen older revision cannot replace the head.
5. The worker independently reads the stored revision, compares all source and projection facts and persists a flow-specific receipt. HTTP success alone is insufficient.
6. Changes while delivery runs leave the latest source revision pending. Expired/replaced leases cannot finish another run.
7. Missing parent, duplicate identity, relationship cycle, incomplete monetary facts and incomplete package snapshot block readiness. No matching by name, catalog package alone or preceding row is permitted.
8. A separate scheduler checks only enabled controls with a configured Vault worker credential. Stopping it does not stop either existing flow. Once an organization control exists, source revisions keep being tracked even while delivery is disabled, so re-enabling cannot reuse a stale approval.

## Staging activation sequence

1. Apply the additive WMS migration and deploy `order-shadow` in an isolated environment. Then apply the additive Booking migration and deploy `process-order-shadow`, `order-flow-status`, and the additive single-booking export status field. Deploy the Operations proxy/status panels last.
2. Use a random dedicated `ORDER_SHADOW_API_KEY` (at least 32 characters) in Booking. Receiver `order_shadow_private.connections.token_hash` is SHA-256 of the **raw token**, not of quoted JSON. Bind each explicitly allowed source organization to its Inventory organization. Keep connections disabled initially.
3. Set a separate random `ORDER_SHADOW_WORKER_KEY` in Booking; save this credential in Vault and point the single private `worker_config.secret_id` at it. Do not use storefront credentials or expose either token in clients.
4. Enable only the test organization on both sides. Source controls and worker configuration must both be enabled. Enqueue one selected booking using the operator-only `booking_order_shadow_private.enqueue(booking_id)`. No bulk backfill is included in this stage.
5. Invoke the worker or verify its separate cron run. Inspect the new receipt and independently fetch its stored revision. Compare products, billing, relations and errors. The UI must still say that active Booking, Planning, Lager and billing use their existing routes.
6. Change quantity, retry delivery, change billing remainder, reorder, remove the last product, simulate interrupted readback and edit during delivery. Run real auth/RLS, gateway and deployed parity checks before any production enablement.
7. A booking with absent explicit parent IDs remains blocked. Resolve source identity/relationship migration first; never set it ready by treating adjacent rows as proof.

`wpzhsmrbjmxglowyoyky` and `pnvvnvywphfvmwdmqqzs` are the current production hosts in the deployment wrappers. The isolated coordinated tests invoke the actual handler directly, without those hosts. Repointing staging wrappers and bound credentials requires an explicit scoped deployment configuration before hosted testing. The current code must not be presented as already running on those hosts.

## Verification performed

The isolated test suite executes the actual producer and receiver SQL in PGlite/PostgreSQL and the actual HTTP receiver handler / delivery code. It verifies 36 → 64, readback, source revisions, retries, conflicting revisions, concurrent-edit handoff, role privileges, rollback, ambiguity and isolation from existing reservations/invoices. Existing invoice-builder tests plus new commercial parity tests run unchanged business calculations. UI tests distinguish failure, disabled state, pending revisions and readback-only success.

These are isolated implementation tests. Full Supabase migration-history replay, deployed gateway/auth, actual Finance consumers, browser end-to-end, stock/scan/return lifecycle and production activation are still required. They are not replaced by these receipts.

Run:

- `npm ci --prefix scripts/order-shadow --ignore-scripts && npm run test:order-shadow`
- `npx vitest run --config scripts/order-shadow/vitest.config.ts`
- From the WMS checkout: `ORDER_SHADOW_BOOKING_REPO=/absolute/path/to/booking-vista-prime npm run test:order-shadow` to include the coordinated two-database chain test.

## Remaining transition stages and retirement

| Next stage | Activation gate | Existing paths retained until |
| --- | --- | --- |
| Central physical-demand model and pinned component occurrences | Known per-booking rules, exact stock pool demand, stable identities | Actual reservation and lifecycle parity proven |
| Planning read adapter | Complete content, explicit parents, current revisions, independent internal sort | All Planning readers moved and checked |
| Lager read adapter | Correct physical demand; packing, parcels, scanning, allocations and returns preserved | All Lager/scanner consumers checked |
| Booking/Planning central command service | Auth, atomic stock gate, revision conflict handling, idempotency and outbox | All legitimate source writers moved |
| Billing adapter and equivalent Finance change producer | Real partial/final/extra invoice and remaining-value scenarios | All Finance and quote dependencies moved |
| Retire old runtime | No remaining consumers or older clients can write | Code, endpoints, permissions, cron and triggers removed in coordinated release |

After central writes begin, switching to an older copy is prohibited. A rollback requires a verified reverse migration or a paused writer while the central fault is corrected. During this stage, disabling comparison is sufficient because it never owned production data.
