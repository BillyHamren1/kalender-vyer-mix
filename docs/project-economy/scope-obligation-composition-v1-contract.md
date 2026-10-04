# Canonical scope composition of local Operations authority

This first whole-scope layer composes actual current local obligation baseline
events under an enrolled canonical economic scope. It does not invent a second
whole-project estimate, sum a parent baseline on top of children, substitute
Booking revenue or mutate existing project/source identities.

The exact nine-field authenticated admin command is `schema_version:
operations-scope-obligation-compose.v1`, `economic_scope_id`,
`expected_scope_revision`, `expected_membership_fingerprint`,
`expected_composition_revision`, `currency`, `baseline_event_ids`,
`idempotency_key`, `reason`. It supplies no prices, cost amounts, actor,
organization, EAC or category-completeness flags. The server locks the current
scope head, requires the exact enrolled revision/fingerprint, and re-derives the
actual graph in one coherent statement. A graph that differs from the saved
membership must be re-enrolled before composition. This is an as-of graph proof,
not a permanent or upstream-currentness guarantee.

Every selected baseline must be the current event for an actual same-organization
live member leaf, with the declared currency. An obligation can belong to only
one canonical economic scope. Permanent ownership is not released by later
catalog removal. Source anchors are deduplicated once; local obligation IDs,
manual evidence basis, source raw hashes/economic fingerprints and policy event
references are preserved. Immutable composition snapshots capture the source
inventory and selected baseline IDs with actor/reason, CAS and exact retry.

Known estimate and commitment amounts are copied/summed in Operations, each
with its known-count/completeness flag. No selected/known baseline means null,
not zero; explicit zero remains zero. Unknown child amounts remain visible as
unknown. These totals are scoped manual authority summaries, not an activated
project EAC or verified Booking budget.

Category/source cost coverage is always unavailable in this initial boundary.
Membership and selected local baselines cannot prove complete personnel,
supplier, Catering and other cost inventories. Captured invoice/source proof is
receiver-v1-only; v2 original/credit authority, unbound sources, missing policies,
actual Booking budget basis and upstream currentness remain separate gates.
The snapshot therefore has null EAC and budget, shadow-only delivery, and no
Finance recalculation. A future reviewed explicit coverage declaration or
complete trusted source inventory is required before claiming complete costs.

Current readers must recheck the enrolled scope revision/current graph and all
selected current baseline/source/policy references. A historical immutable
composition remains available as historical evidence, without becoming a live
authorization token. Future forecast writes perform those checks atomically.
Native tests must cover graph/baseline/source changes, cross-scope ownership,
currency and foreign leaf denial, empty catalog, unknown amounts, rollback,
revoked admin, CAS/retry and immutable history. Whole-scope standalone manual
obligations require their own nonoverlapping ownership/decomposition protocol;
they are not added implicitly by this first composition layer.

Migration `20261002030747_operations_scope_obligation_composition.sql` implements
authenticated `compose_operations_scope_obligations_v1(p_command)` and the
service-only `read_operations_scope_obligation_composition_v1(organization,
economic_scope)`. The read returns saved immutable evidence plus separate flags
for captured membership, baseline and source/policy reference currentness. Those
flags cannot assert a complete cost inventory; empty baseline/source catalogs
do not get a true reference-currentness flag. Source coverage stays unavailable,
upstream economic proof is not promoted, and EAC/budget stay null.

Four focused pure cases and Deno checks passed. The rollback-only SQL fixture
passed PGlite after actual scope/inverse receiver/local authority/policy migrations.
It uses actual authenticated/service roles and saves a real receiver-generated
synthetic original before composition. It covers live graph and baseline changes,
source-policy currentness, same-org nonmember/currency/foreign admin denial,
injected cross-scope owner conflict, injected atomic-capture rollback,
CAS/idempotency, empty catalog/null totals, revocation and immutable snapshots/
heads/permanent reservations. Native PostgreSQL, cross-session ownership/source
concurrency and real PostgREST authorization remain required. No active delivery
or UI totals are added by this layer.
