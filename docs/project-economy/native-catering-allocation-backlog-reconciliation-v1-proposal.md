# Native Catering allocation backlog reconciliation — proposal v1

Status: documentation-only candidate. No endpoint, permission, table, queue status, source mapping, Finance head or released behavior changes are authorized by this document. Existing v2 ordered delivery remains the supported path. Review this contract before implementation.

## The observed blocking behavior

The current Operations allocation command can accept event 2 after event 1 without requiring event 1's Finance delivery. It disables event 1's derived native mapping and advances the allocation head to event 2. An event 1 captured queue therefore cannot obtain a fresh ordinary delivery lease: the current claim requires both its native mapping to be enabled and its event to be the current allocation head. Event 2's ordinary initial capture requires a delivered predecessor queue. Finance independently requires its own accepted predecessor and consecutive allocation authority. A pending queue, an Operations acknowledgement or a current target UUID cannot replace that evidence.

These are intentional barriers, not retryable network failures. Re-enabling an old native map, setting an old queue to delivered, skipping an allocation revision, sending event 2 as event 1, changing a historical recipient or making Finance recalculate money would produce false authority.

The first recovery slice supports one Operations organization, one native Catering entry/worker stream, one Finance organization, one currency and whole-cost assignments. It proposes **explicit authenticated reconciliation with an atomic ordered Finance history import**, authorized by the latest exact Operations lineage. It does not add an ordinary historical claim exception.

## Current source anchors

| Source | Relevant existing behavior |
| --- | --- |
| `supabase/migrations/20261002044059_operations_catering_allocation_authority_v2.sql` | Authenticated `reassign_operations_catering_project_v2`; exact source CAS; real time-basis obligation; map-before-stream locking; immutable event and captured Finance capabilities; disables the old native map; future source producer must use latest derived map. |
| `supabase/migrations/20261002052437_operations_catering_allocation_delivery_v2.sql` | Immutable 19-field body per original outbox; current allocation capture; delivered predecessor eligibility hint; original source outbox remains parked. |
| `supabase/migrations/20261002062550_operations_catering_allocation_dispatch_v2.sql` | Fresh claim requires enabled exact route, source enrollment, native map, Finance capabilities and current allocation event; strict 15-field claim, 13-field acknowledgement and lease finish. |
| Finance `supabase/migrations/20261002061347_operations_catering_allocation_receiver_v2.sql` | Shared `operations-catering-copy:<Operations-org>:<stream>` barrier; own latest accepted snapshot; consecutive authority; immutable accepted event/head; exact byte replay; nonce rollback; stale unsaved publications never applied. |
| `scripts/project-economy/catering-allocation-dispatch-postgres-test.sql` | Genuine later event supersedes an undelivered capture; old claim and successor preparation fail closed without an invented delivered queue. |

The existing migrations, public RPCs, v1/v2 validators, native 25-field cost snapshot, 26-field authority event, 19-field v2 delivery and original 13-field receipts stay unchanged.

## Read, preview and authenticated authority

A new service-only, separately signed Finance cursor read returns the server-resolved accepted snapshot and allocation authority for this exact stream. Its ten fields are `schema_version`, `cursor_id`, `operations_organization_id`, `finance_organization_id`, `source_stream_id`, `snapshot_id`, `publication_revision`, `allocation_event_id`, `allocation_revision`, `snapshot_body_sha256`. An unadopted v1 predecessor has a null event and allocation revision 0. The cursor is persisted immutable read evidence with a short expiry; it authorizes no delivery by itself. Both organizations, the native worker enrollment and the read purpose are resolved through dedicated enrollment. No raw source or rate is exposed to a normal project viewer.

Operations builds a private reconciliation preview from that cursor and **all contiguous original publication revisions** after it through the exact latest current publication. The first recovery cursor must already identify the exact Finance-accepted base publication of the first missing allocation; reconciliation does not invent an unaccepted v1 base. Already adopted v2 cursors may start before subsequent genuine source corrections within that allocation. Unsupported earlier gaps remain visibly blocked.

The preview resolves immutable event lineage, original observations, raw fingerprints, outboxes, event Finance capability IDs and captured destination mappings. Every allocation step keeps its original from/to pair and allocated publication. A genuine source-update step keeps its own new observation/raw version and current event; it cannot reuse the earlier event's raw entry as new source evidence. No estimate, historical rate, minutes or amount is recomputed. Existing captured bodies are retained byte-for-byte. Missing captures are labelled newly prepared from the corresponding immutable publication and its original captured capability, never labelled historical sends.

The authenticated administrator approves the exact preview using a new 12-field command:

`schema_version`, `source_stream_id`, `expected_publication_revision`, `expected_allocation_revision`, `expected_event_id`, `expected_observation_id`, `expected_mapping_id`, `finance_cursor_id`, `finance_cursor_sha256`, `preview_sha256`, `idempotency_key`, `reason`.

Actor and Operations organization come only from current authenticated session/profile/admin authority. The receiver organization, route, native worker and all historical/current maps come from the resolved preview, not command-supplied replacements. Both real project tenants, deletion status, exact current time-basis target obligation/revision/currency and source enrollment remain required. A saved permit captures actor, reason, server timestamp, immutable command bytes, cursor, preview, original route/version, every step hash, exact latest head and current mapping. The permit is a distinct reconciliation authority; it is not a replacement allocation event, payroll approval, project attest or cost source.

Fresh preparation and dispatch require the administrator's authority still current, the permit unrevoked, all gates enabled and latest Operations publication/event/mapping/observation unchanged. Any newer source or allocation requires a new preview and authenticated permit. Saved immutable results can be read after revocation; revocation denies fresh work.

## Historical capabilities and permission

The **latest native Operations map must remain enabled** and match the latest authenticated event. Earlier native maps remain disabled exactly as their immutable successor events require. Their saved IDs are provenance inside the explicitly authorized batch; they are not restored as current maps and cannot obtain a lease from the existing v2 claim.

Every historical and final Finance retirement/destination map must still be enabled, match its original captured version and belong to the same enrolled recipient organization. Every original delivery route/key enrollment used by a captured child body must still be enabled and exactly enrolled. A route/map/key change cannot redirect a saved body. A revoked old Finance capability produces `blocked_retirement_capability`; a disabled latest native map produces `blocked_current_native_mapping`. The administrator cannot approve through these failures or create a new map to disguise an old target. Cross-organization moves remain unsupported.

The new current reconciliation permit is the authority for the batch. It never asserts that an old Operations mapping is currently enabled. This distinction must be explicit in code and review; the old claim's enabled-map rule is not changed.

## Dedicated transport and atomic Finance acceptance

Use a separate purpose, endpoint, HMAC key/enrollment, nonce namespace, gate, private queue and receipt store. Neither a v2 delivery signature nor a Finance cursor signature can authorize reconciliation. The immutable reconciliation body binds the permit, preview hash, expected Finance cursor, exact latest Operations head and ordered child bodies/hashes. Original child bodies retain original route/key identities; the outer reconciliation signature is not substituted into a child v2 request.

Initial bounds: at most eight contiguous publication steps and at most 256 KiB for the entire UTF-8 request. Oversized or longer histories stay blocked, without truncation, automatic batching or skipping an intermediate source revision. Adopt the existing whole 15-second monotonic deadline, bounded chunks, redirect denial, expiry-before-abort, strict primitive fields and private fixed error diagnostics. Request hashes refer to actual raw bytes. Canonical permit/preview hashing must be specified with SQL/JS/Finance vectors before coding.

Finance follows the existing receiver lock order exactly: dedicated enrollment/gates/native scope `FOR SHARE` → dedicated nonce advisory barrier → the **exact existing v1/v2 economic-stream advisory lock** → adopted allocation head and captured maps/actual projects. It never acquires a map or head update lock before the economic-stream barrier. Under those locks it authenticates every current permission and resolves its own accepted cursor/head again. The cursor token is an expectation, not accepted predecessor authority. If Finance has advanced, reject the fresh batch with `stale_finance_cursor`; do not silently shorten or retarget it.

Inside one database transaction, Finance processes each original publication in order:

1. Resolve the first predecessor from Finance's own accepted immutable snapshot.
2. Validate the next unchanged native snapshot/raw source and exact allocation event. An allocation adoption must be consecutive and match its exact original base publication, observation, old map, cost fingerprint and source bytes. A source update must genuinely advance its native entry version and observation under the current adopted authority.
3. Insert the actual immutable Finance snapshot and accepted authority, with its own saved predecessor FK. The next step may refer only to this now inserted Finance predecessor or the original accepted cursor. Operations queue state never substitutes for either.
4. Preserve exact original native monetary values, separate payroll/source status from Operations project review, and record original affected destinations. Do not run an amount/rate/forecast calculator.

The transaction exposes only the final stream projection after commit: one current cost and its current project. Intermediate accepted rows are immutable history and explicit intermediate retirements, not additional current charges. Any invalid later step rolls back **every** earlier insertion, head advance and nonce. The original source observations and allocation events are not rewritten.

The new protocol cannot call the ordinary HTTP receiver repeatedly and label partial progress atomic. Its private SQL must prove the same source/adoption constraints under the shared lock, retaining existing insert/head guards. No bypass role, trigger disabling or grant of direct service writes is permitted.

## Honest acknowledgement and return to ordinary v2

Reconciliation has its own saved immutable receipt and accepted-step records. Its 13 fields are `schema`, `outcome`, `source_organization_id`, `source_stream_id`, `requested_source_revision`, `applied_source_revision`, `current_source_revision`, `request_body_sha256`, `snapshot_receipt_id`, `snapshot_fingerprint`, `receipt_id`, `destination_organization_id`, `shadow_only`.

This schema is `operations-catering-reconciliation-receipt.v1`, never `operations-catering-receipt.v2`. `request_body_sha256` hashes the outer reconciliation body; `snapshot_fingerprint` hashes the exact final **child** delivery body saved as the final Finance snapshot. They generally differ. Accepted means requested/applied/current all equal the approved latest publication. An exact saved replay may report a newer current revision while retaining the original applied snapshot and outer request hash. Saved replay cannot restore an old head or grant fresh permission. Per-step private records bind original body SHA, publication, snapshot, authority and actual predecessor; they are not forged transport receipts for unsent v2 HTTP requests.

A reconciliation result **must not** directly mark historical ordinary v2 queues delivered or fabricate their original 13-field receipts. They retain original status/history, with a separate immutable reconciliation-resolution relation shown to operators.

To restore normal future v2 eligibility:

1. A new narrow `prepare_current_after_reconciliation` operation verifies the actual signed reconciliation receipt, saved permit, unchanged latest native enabled map/head and original current route/capabilities. It captures the exact final child body against its real original outbox. An existing capture must match exactly; conflicts block.
2. Send that current body through the **real existing v2** dispatcher and Finance v2 receiver. Finance already owns the exact saved final body, so it returns a genuine original 13-field v2 replay receipt.
3. The existing v2 claim can succeed because this is the latest event and enabled native map. Existing finish persists that actual receipt under its real lease. Only then is the ordinary delivered-predecessor hint available to future allocation capture.

A new authenticated allocation admission wrapper requires this ordinary latest-delivery completion and a fresh Finance-own signed current cursor before a subsequent event. Under map-before-stream/head locks it rechecks the exact local latest tuple, invokes the original allocation authority within the same transaction, and saves admission evidence. Any source correction between cursor read and command makes admission stale. While reconciliation is open, fresh allocation admission is blocked; ordinary source publication continues, invalidating an outdated permit rather than losing source evidence. The original unconstrained command remains explicit fixture/internal functionality until an additive entry guard enforces admission for enabled real usage. Activation is prohibited until direct calls and owner/service fresh authority inserts cannot bypass that guard.

## Locking, retries and revocation

Operations preparation/claim uses the current map before stream/allocation-head locks, matching the genuine producer and authenticated reassignment. It then checks permit latest tuple and original outbox/capture identities. No remote HTTP runs inside an Operations database transaction. Finance uses enrollment/gate/scope share locks, then nonce barrier, then shared economic-stream advisory barrier before its own accepted predecessor/head and map/project locks, matching existing `24010`/`61347` receivers. Stable ordered map/project capability locks and bounded waits must be demonstrated against both ordinary receivers.

Only an exact immutable saved outer body can replay. Timeout after commit is retried with a new transport nonce, the same body, same captured recipient and actual saved receipt/snapshot. Changed latest Operations lineage blocks a fresh dispatch. Operations authorizes an in-flight batch at its locked claim boundary with a short, single leased attempt; Finance authorizes acceptance at its own locked enrollment/cursor boundary. These separate databases do not provide an atomic shared head or distributed revocation transaction. A source advance or administrator revocation after the claim may therefore leave an already authorized request in flight; if Finance accepts it, its actual receipt is honest accepted history, not proof of the latest Operations state. A fresh cursor/preview is necessary for later work. Replaying a committed body cannot authorize a new append. Native tests must demonstrate this interleaving and bounded lease behavior; if the intended activation policy requires revocation to cancel an already claimed request before Finance commit, this proposal is insufficient and activation stays blocked pending an additional cross-system protocol. A signed receipt never asserts that the old permit is still current.

Gate, native enrollment, administrator, route, historical map, actual project or target obligation revocation denies new preparation/dispatch/admission. A historical saved byte replay has no side effect and must retain authenticated enrollment; it does not bypass a revoked key or destination gate. All denied permission/nonce/currentness paths roll back state changes.

## Acceptance evidence required before activation

| Case | Required result |
| --- | --- |
| Actual event 1 captured, event 2 supersedes it, neither accepted by Finance | Existing claim/capture remain blocked; authenticated preview includes the genuine complete gap; one atomic import preserves both events and only final current cost. |
| Native correction between events | Real new observation/version/raw hashes and supplied corrected amount survive every step; historical saved rate unchanged; no reused old observation. |
| Missing or estimated valuation | Original null/coverage/source-review status copied; no zero replacement or Finance arithmetic. |
| Finance predecessor absent, wrong cursor/hash, skipped publication or allocation | Whole batch denied, no snapshot/head/nonce/receipt append. |
| Retired old Finance map/route/key revoked, foreign/deleted project, wrong obligation | No reactivation, redirect, fabricated capability or partial withdrawal; explicit blocked reason. |
| Concurrent producer, new allocation, ordinary v1/v2 delivery, reconciliation in both lock orders | Real PostgreSQL blocking assertions and exact post-wait CAS; one current stream; no deadlock or lost advance. |
| Timeout after genuine Finance commit | Actual immutable receipt parity and saved final snapshot; retry replays exact body; no duplicated historical or current cost. |
| Return to v2 | Genuine v2 HTTPS replay receipt, ordinary lease finish and delivered predecessor; no synthetic acknowledgement. |
| Direct original command, private owner/service insert or fresh head bypass | Additive admission guard rejects bypass under enabled activation policy; old fixture isolation explicit. |
| Failed final step | Native transaction proves all earlier tentative accepted snapshots/authority heads/nonce roll back. |
| Raw body mutation, excessive history/body/chunks, wrong purpose/tenant/nonce | Fail closed within bounded deadline; no credential/raw evidence leakage. |
| Official accounting, payroll, supplier/customer billing, forecasts/baselines | Actual before/after invariants unchanged; only private immutable evidence/current copy advances. |

Required sequence: independent contract review → disjoint additive source implementation → canonical unit/hash/type checks → full chained schema/native PostgreSQL authorization, rollback and concurrency → genuine source/Operations/Finance HTTPS chain with actual receipts → protected redacted operator surface/admission integration → separate activation decision. The existing ordered v2 gate can pass independently; it must not be labelled arbitrary-backlog support.
