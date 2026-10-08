# Native Catering allocation authority v2 — contract proposal

Status: proposal for contract review. No v2 production code, hosted activation,
authenticated human reassignment or end-to-end v2 runtime is claimed.

Operations must be able to move an already observed Catering cost between actual
projects and time-based obligations without editing a Catering time/payroll row.
The cost retains its stream, native entry version, raw observation, work date,
minutes, captured historical rate and supplied amount. Finance validates and
copies the Operations result; it does not calculate or revalue the cost.

## Exact source evidence

These files were fetched from Git and their Git blob hashes compared with the
audited workspace bytes. They are candidate source pins, not deployed releases.

| Repository / commit | Source | Git blob SHA-1 |
| --- | --- | --- |
| Operations `584355134f9c306e720e970f6ed9423e85165894` | `20261002014937_operations_project_scope_enrollment.sql` | `1cfca93e1ab9309db0d4ab5d4f8b5cfffacaa4d5` |
| Operations, same commit | `20261002023731_operations_project_obligation_authority.sql` | `17cc4ec8573127afbe940180e062bfd76b630308` |
| Operations, same commit | `20261001235558_operations_catering_project_evidence.sql` | `f433fc032f8c29b2b180ccfa9819a074469090a6` |
| Finance `5d02b83122044c124711f3f81eb9e7a0c1e9683b` | `20261002024010_operations_catering_validating_copy_v1.sql` | `e1e802d1f0690670f927ceb8acbe6095e68c3dbd` |
| Finance, same commit | `20261002033241_operations_catering_redacted_read_v1.sql` | `6aa41b31b6bf139d80bae1437e2c4732b2f2353e` |

The frozen native producer rejects same-entry-version economic/mapping changes.
Finance v1 also rejects changed source maps or destinations at the same native
version. Neither guard is weakened. A new authenticated allocation authority
explicitly bridges the unchanged observation to a new target publication.

## Authenticated command

The new RPC accepts one strict object with exactly thirteen fields:

`schema_version`, `source_stream_id`, `expected_source_revision`,
`expected_allocation_revision`, `expected_observation_id`,
`expected_source_fingerprint`, `from_project_id`, `from_obligation_id`,
`target_project_id`, `target_obligation_id`,
`expected_target_obligation_revision`, `idempotency_key`, `reason`.

Organization and actor come from `auth.uid()` and the existing narrow
`authorize_scope_admin_v1()` function, which locks the actual Auth user,
unambiguous profile and same-organization admin role. The service role, anonymous
callers and Catering occupational roles cannot invoke reassignment.

The command requires both actual live projects in that organization, an actual
current target obligation with the correct project/currency and time cost basis,
the enabled native worker/source binding, exact prior publication/observation
and matching source/allocation heads. A missing obligation is unavailable;
no zero baseline, invented obligation or inferred EAC relationship is created.
The first slice is one whole cost and one current target; it does not imply split
allocation authority or move estimates, commitments or source-consumption policies.

## Immutable event and publication

The event has exactly twenty-six fields:

`schema_version`, `event_id`, `organization_id`, `source_stream_id`,
`allocation_revision`, `actor_system_user_id`, `reason`, `idempotency_key`,
`created_at`, `base_publication_revision`, `allocated_publication_revision`,
`source_observation_id`, `source_entry_version`, `raw_entry_sha256`,
`raw_review_sha256`, `source_cost_fingerprint`, `previous_mapping_id`,
`previous_mapping_revision`, `next_mapping_id`, `next_mapping_revision`,
`from_project_id`, `from_obligation_id`, `to_project_id`, `to_obligation_id`,
`target_obligation_revision`, `fingerprint`.

The event fingerprint covers all other event fields. The source cost fingerprint
covers the original twenty-five-field snapshot excluding only `project_id`,
`obligation_id`, `mapping_revision`, `publication_revision` and
`project_review_status`. Raw observation hashes and the exact prior publication
also bind the event. No observation is mutated: observations have no mapping-ID
column, and the original immutable publication retains its original map forever.

Both fingerprints use SHA-256 over compact UTF-8 canonical JSON **objects**. Keys
are the exact contract's ASCII snake_case keys, sorted by ascending ASCII bytes
(JavaScript `.sort()` / PostgreSQL `COLLATE "C"`). Serialize each key and scalar
with ordinary JSON escaping, join key/value pairs with `:` and pairs with `,`,
and enclose in `{}` with no whitespace. All numeric fields must be nonnegative
safe integers and serialize in base ten without fractions/exponents. Null stays
literal `null`; Unicode string values, including timestamp text, are preserved
without normalization or timestamp reformatting. The event document omits only
`fingerprint`; the source-cost document omits only the five fields above.
Use the already reviewed SQL `canonical_source_json_v1` serializer and a new
flat-object JavaScript equivalent; never hash `jsonb::text` or insertion-order
`JSON.stringify` of the unsorted input. Shared vectors must cover null rate,
integer amounts, scalar key order and quoted/multiline Swedish reason text,
verified against actual SQL and both Operations/Finance validators before freeze.

The transaction derives a new map with the same worker/native identities, date,
time zone and currency. It disables the old Operations map, enables the derived
new map and appends a new publication/outbox in the existing native stream.
The snapshot stays exactly twenty-five fields and copies all source economics.
The new project decision is preliminary; globally rejected source stays rejected.
Previous project confirmation cannot authorize the new target.

The old Operations map becomes disabled. The old **Finance destination map** is
a separate retirement capability and must remain enabled for a fresh retirement.
The two map concepts must never be conflated.

## Locking and future source lineage

Lock the authorization rows, live projects in deterministic order and actual
target obligation. Read the immutable prior publication provisionally, lock its
old native mapping `FOR UPDATE`, then lock the original native stream
`FOR UPDATE` and allocation head. Recheck both CAS revisions before mutations.
This follows the frozen producer's mapping-share-before-stream-update order.

Install event/head first with deferred foreign keys to the new map/publication,
then disable/insert maps and append the new publication, all in one transaction.
Additive map and publication guards apply only to streams with an allocation-v2
head and require the exact latest event, map revision and target. They prevent a
later v1 source producer or stale service map from restoring the old assignment.
Normal genuine source updates resolve the new active map and retain allocation
authority independently of payroll/time version. Source corrections may change
economics only through genuine newer observations and the existing Operations
calculation, never through an allocation command.

An explicit next authenticated event supersedes the previous allocation. There
is no destructive undo or event deletion. Revocation/default-off gates block new
authority or delivery and retain existing current evidence/history; blocked
source advancement must remain visible rather than fabricate zero or freshness.

## Finance v2 transport and visibility

Use a dedicated default-off v2 route, enrollment, key and HMAC purpose. The outer
envelope has nineteen fields: the existing eighteen plus `allocation_event`.
The native snapshot and calculation version remain unchanged. The receipt has
the same strict thirteen fields with a distinct v2 schema and exact raw-body SHA.
Each captured queue record freezes its route, raw body, allocation event and both
actual destination versions before sending; retries cannot resolve today's map.

Initial acceptance requires Finance's **own saved exact predecessor** at the
event's base publication, unchanged raw/cost tuple, and both captured current and
retirement capabilities. An Operations queue alone does not prove Finance has
accepted a predecessor. Missing predecessor or revoked fresh retirement is an
explicit blocked result. Cross-Finance-organization reassignment remains blocked.
An already accepted exact-byte retry retains its historical saved-map exception;
it does not authorize new work under a revoked map.

Later genuine source updates with the same allocation revision must carry the
same already accepted authority. A new allocation revision requires another
exact predecessor/CAS event. A scoped additive guard blocks new v1 queue captures
for publications governed by v2, avoiding conflicting body representations while
preserving old queue rows and all frozen v1 semantics.

The receiver appends to the existing Finance immutable native snapshot table and
its globally current stream. There is no second cost identity or official
bookkeeping write. The committed Finance reader already preserves an old opaque
withdrawal after subsequent new-target corrections using immutable history.
The Operations old-project withdrawal reader remains a separately reviewed and
pinned UI/backend gate; it was not present at the Operations source pin above.

## Required proof gates

Contract review precedes new implementation. Verify authenticated same-org
authorization and role revocation, both deleted/foreign projects, missing/foreign
or invoice-based obligations, stale/duplicate/conflicting CAS, actual unchanged
raw observation and captured rate/amount, preliminary reset and global rejection.
Native concurrency must prove both original-ingress/reassignment lock directions
and prevent a future source update restoring an older allocation.

Finance must prove actual accepted predecessor, distinct source/allocation
versions, old/new capability capture, one current charge, opaque old withdrawal,
next-source correction after allocation, failed-map nonce rollback, lost
acknowledgement exact replay and unchanged official ledger/billing/provider rows.
An authenticated isolated fixture is not a hosted human action or release proof.

## First additive authority slice

Migration `20261002044059_operations_catering_allocation_authority_v2.sql`
adds only the default-off gate, immutable authority events/heads, restricted
authenticated command and scoped original-producer guards. The exact old/new
Finance map UUIDs and recipient are captured in separate immutable private
`event_finance_capabilities` rows, retaining the exact26 event document. Future
v2 PREPARE must consume these captured capabilities; a newly enabled map cannot
silently substitute for either original destination.

`catering-allocation-fixture.ts` exports actual Operations-generated isolated
controls. `catering-allocation-authority-postgres-test.sql` consumes JSON from
`test.catering_allocation_fixture`; `catering-allocation-hash-parity-postgres-test.sql`
consumes the two vectors from `test.catering_allocation_vectors`. The authority
fixture returns a private final row for actual SQL-generated event/snapshot hash
verification in Operations and Finance. Do not print that row in public CI logs.
The Finance domain helper validates/copies the exact26 event and canonical hash;
it does not establish receiver enrollment or acceptance of a predecessor.

Local evidence: Operations19 supplementary Vitest cases, Finance5 focused cases
and actual Finance repository compiler pass; scoped existing-schema PGlite
authority/producer/negative/parity tests pass. These are single-session rehearsals.
Native PostgreSQL/concurrency, v2 transport persistence and the authenticated
native HTTP chain are still required before completing allocation v2.
