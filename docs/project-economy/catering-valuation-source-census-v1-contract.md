# Catering valuation source census v1

Status: **source-only, default-off and shadow-only**. This boundary validates a
future authenticated Catering source census. It does not create a database
reader, RPC, UI route, economic total, estimate replacement, commitment
consumption, currency conversion, EAC, budget, margin, approval or runtime
admission.

## Exact source base

The candidate is prepared for `BillyHamren1/kalender-vyer-mix`, branch
`codex/project-economy-personnel-cost`, commit
`224142643da2b540734c70925f2c6ed75242effc`, tree
`ce17b9abb33b081c217f884fa3a89685dda6f362`. Publication requires a fresh
outer ref/tree compare, exact dependency verification and structured absence
for all four additive targets.

The direct product dependency is the existing Operations-owned pure boundary
`supabase/functions/_shared/catering-project-evidence.ts`, SHA-256
`0760348b57475c334abfce43b846d4136eb05ada1c99bc244ae7179e6815362a`.
Its `assessCateringValuationCoverage` function keeps the three valuation bases
mutually exclusive, rejects foreign project/organization joins, preserves
missing prices as null, and requires both a movement and historical valuation
document for stock actuals. This candidate does not edit that boundary.
That module imports the canonical transitive dependency
`supabase/functions/_shared/project-personnel-cost.ts`, SHA-256
`69c7a35c9e144b20c4db3938d61d96b519a1419b27e7689e39c48d58635b2870`.
The workflow verifies both dependency hashes before running the test.

## Census input and provenance

`operations-catering-valuation-census-input.v1` has an exact key set and names
the organization, Catering organization, Operations project, census identity,
monotonic revision, capture time, producer commit/tree, all three source heads,
the complete current line inventory and a canonical SHA-256 fingerprint over
every other field. The root carries one snapshot ID/revision/fingerprint/as-of
tuple, the as-of instant cannot follow capture time, and every global and
booking head repeats the exact snapshot fingerprint. This shape prevents heads
that declare different snapshots from being mixed; authenticating what that
fingerprint actually covers remains a future producer gate. A canonical
booking-mapping head ID/revision/fingerprint
binds the exact booking membership and each member's one mapping revision.

The source heads are exactly, and in this order:

1. `ingredient_estimate`;
2. `purchase_estimate`;
3. `stock_consumption`.

Each global basis head binds its own currency, census-stream identity, opaque
revision, fingerprint and the sum of all booking-head row counts. For every
booking×basis pair there is exactly one ordered head. A booking head is either
`current` with at least one row, explicit `current_empty` with zero rows, or
`unavailable` with zero rows and one fixed reason. The global head is current
only when every corresponding booking head is current/current-empty; otherwise
it is unavailable. If all booking heads are current-empty, the global head is
current with row count zero but its projection coverage remains unavailable,
never zero or complete. Thus booking B cannot silently disappear while booking
A still supplies rows. All global and booking streams are unique.

Lines are bounded, canonically ordered by basis, booking and UTF-8 source
identity, globally unique, and bind the same organization and Operations
project plus the booking's declared source project, obligation and mapping
revision and the head's stream and currency. The root deliberately has no one
project-wide obligation: each booking valuation mapping supplies its own
source-project and obligation identity. `source_sequence` is the one-based census ordinal
within that source stream: every current head must contain each integer from
1 through `row_count` exactly once. Duplicate or gapped ordinals fail closed.
The root binds a canonical nonempty booking membership. Each membership row is
exactly `booking_id`, `source_project_id`, `obligation_id` and
`mapping_revision`. Every line carries a
stable Catering source event ID, economic-origin ID, source booking ID and
booking-mapping revision. A line's mapping revision must equal the single
declared revision for that booking. Two bookings in one project remain
distinct; no project aggregation or booking apportionment is inferred.
Replaying one source or economic-origin identity under another booking/basis is
rejected. Only purchase-estimate lines may carry an optional
`purchase_source_document_id` with fixed kind `estimate_or_quote`; it is never
a Fortnox invoice actual and grants no supplier-invoice authority. Stock
actuals instead use a movement plus historical valuation-document compound
identity, unique across the census.

This is source provenance shape, not proof that caller
JSON came from Catering: a future authenticated server producer must provide
the real full census under its own reviewed transaction/currentness boundary.
The booking membership is caller shape only here. A future producer must derive
it from locked current
`operations_project_scope_heads` plus the current
`operations_project_scope_snapshots.local_booking_ids`; caller membership is
never authority. That scope membership proves which local booking IDs belong to
the Operations project, but does not itself provide valuation mapping. Existing
Catering time-entry mapping cannot authorize valuation. A new authoritative
booking→source-project→obligation valuation mapping and locked mapping head are
required before the declared mapping fields can be trusted.

Initial census revision 1 has no predecessor. Every later census binds the
immediately preceding census ID, revision and fingerprint and must use a new
census ID. Identical retry bytes produce the same projection. An explicit
correction edge (`replaces_source_event_id`) is rejected in revision 1 and
requires a successor census. Withdrawal is absence/current-empty or an
explicit unavailable source head in the successor census, never a fabricated
zero-valued line. Persisted predecessor CAS, full tombstone/diff production,
cross-revision economic-origin ownership and correction-edge existence remain
producer/runtime gates; this pure validator cannot prove them from caller JSON.
Stale, skipped, reused or fingerprint-mutated census evidence fails closed.

## Output and economic nonclaims

`operations-catering-valuation-census-projection.v1` exposes only:

- the validated census/provenance identities;
- the declared per-booking source-project, obligation and mapping identities;
- each basis head's independent currentness and diagnostic coverage;
- every individual source line with its original basis, currency, nullable
  amount, revision/fingerprint and stock documents.

There is deliberately no subtotal or cross-line/category aggregation. A
genuine zero must be `valuation_state=valued` with `source_valued`; a missing
amount must remain null with `valuation_state=missing` and `missing_price`. An
empty basis is unavailable, never complete or zero. Currency is never converted or combined; a basis may use a
different currency from another basis. Ingredient estimates, purchase
estimates and stock actuals are never alternatives selected into one total.

The projection fixes `sourceCoverage` and `cateringCategoryCoverage` to
`unavailable`; economic total, remaining, EAC, budget and margin to null; and
conversion, economic-totals admission and runtime admission to false. Extra
caller fields attempting to promote any of those values are rejected.

## Tests and CI

The Node contract suite covers the three bases, per-source currency, null and
empty semantics, head/stream/count custody, cross-basis replay, stock document
requirements, exact retry, correction predecessor binding, withdrawal,
stale revision, two bookings in one project, per-booking unavailable and
current-empty states, mapping/source-project/obligation conflicts,
cross-booking replay, coherent snapshot, economic-origin replay, genuine zero,
purchase-estimate-only document authority, stock compound uniqueness,
cross-project/organization inputs, caller promotion, canonical ordering,
bounds and canonical fingerprint mutation. It uses no
network, database, provider, secret or production data.

The additive workflow has read-only contents permission, pins checkout and
setup-node by full commit SHA, asserts Node `v24.21.0`, uses no npm command and
runs only the source test with Node's TypeScript transform needed by the
existing canonical dependency. These controls prove only the source contract.

## Open gates

Before any product use, a separate reviewed producer must authenticate actor
and organization, derive a complete current census from genuine Catering
tables under stable transaction/lock semantics, bind tombstones and source-head
currentness, prove retry/correction/withdrawal concurrency in native
PostgreSQL, redact sensitive source fields, and return a session-bound read.
Canonical ingredient, purchase and stock source-head producers do not yet
exist; neither does the authoritative valuation mapping producer. The snapshot,
mapping and head fields here are declarations until those producers are
reviewed in real services. The pure validator also cannot prove a shared
database snapshot, persisted predecessor CAS, tombstones/diffs, historical
correction-edge existence, or cross-revision ownership of an economic origin.
Operations then needs a separately reviewed category-composition join before
any total or forecast. DB/RPC/UI activation, Finance consumption, hosted auth,
provider evidence, native runtime, EAC/budget/margin, rollback and release all
remain open. Tests must never create an invoice, approval, payment or customer
communication.
