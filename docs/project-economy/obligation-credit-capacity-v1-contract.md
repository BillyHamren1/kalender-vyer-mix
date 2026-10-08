# Local original credit capacity

This separate ledger copies the absolute amount of an actual current saved
negative own-credit assignment and the actual positive bound original amount.
It proves a bounded local reservation only. It does not make credits eligible
for project costs, replace source consumption policy, restore commitments,
calculate remaining costs, or complete operational EAC. The tenant gate defaults
off; `credit_eligible` remains false and EAC remains null even after local capacity
is proved.

The exact seven-key authenticated command is schema_version
`operations-obligation-credit-capacity.v1`, project_id, obligation_id,
assignment_event_id, expected_capacity_revision, idempotency_key and reason.
All identifiers are strict UUID strings. CAS is a safe integer from zero through
MAX_SAFE_INTEGER minus one. No actor, money, currency, original anchor or source
status is accepted from the caller.

Live administrator/project authorization, the existing organization obligation
barrier and the enabled tenant-gate shared row lock precede any reservation.
The actual current assignment reader acquires sorted original/own invoice
barriers before baseline/protocol-head row locks; the same transaction also calls
the private original reader and rechecks exact assignment/source/baseline proof.
A prior HTTP response or historical receipt is not authority. Source proof changes
abort without reservation/head/history writes.

Permanent own-anchor ownership is retained. Each capacity head also fixes its
original anchor; changing a relationship to a different original cannot transfer
or release an earlier reservation. That needs separate reviewed lineage.
The latest reservation per own anchor is included in the original-anchor total,
including stale, rejected or disappeared source versions. No source status change
automatically releases capacity. A fresh explicit CAS event may replace only its
own reservation using that newly current saved source; no caller price or guessed
consumption policy can shrink it. The sum of all other retained reservations plus
the requested current actual credit magnitude must fit the actual current positive
original amount. Numeric SQL aggregation avoids overflow.

Events capture authenticated actor/reason, the complete current assignment proof
including V2 publication/relationship/anchors/raw evidence, baseline and original
binding proof, copied amounts/currency and immutable CAS lineage. Reads return
`local_capacity_proven` only while those exact proofs remain current and the
retained aggregate still fits. A lower/new original version, changed assignment,
relationship-only update, rejection or gate revocation returns unresolved without
releasing any reservation. Historical idempotent retries are explicitly provenance
only. Full-scope deduplication, all-credit completeness, actual kernel input mapping,
source/category coverage, native PostgreSQL concurrency/JWT and release remain
independent gates.
