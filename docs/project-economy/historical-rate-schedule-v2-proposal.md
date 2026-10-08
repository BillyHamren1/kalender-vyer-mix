# Historical rate schedule v2 — contract proposal, inactive

The v1 enrollment API cannot replace an open-ended historical rate. Ending its
existing row in place would destroy the exact original rate evidence. Allowing
new overlapping rows would make the current resolver ambiguous. This proposal
adds an immutable schedule projection instead; it changes no active resolver.

## Separate rate definitions from schedule publications

An immutable rate definition holds an explicit safe minor-unit hourly amount,
category, currency, source reference and captured administrator provenance. A
complete immutable schedule publication holds an ordered list of nonoverlapping
`[effective_from,effective_to)` segments referencing rate definitions. The
organization/worker/category/currency stream has a CAS publication counter,
previous schedule fingerprint, event type, actor, reason and source reference.
An initial baseline references the exact existing historical rows. Existing
ambiguity blocks baseline creation; it is never silently repaired or guessed.

A supersession event explicitly references the prior schedule publication and
rate definition it supersedes. Its complete next timeline preserves all prior
segments outside the declared interval. For an existing open-ended definition,
a new approved definition can start on a specified date: the new schedule view
ends the prior segment at that boundary and starts the new segment there. The
old rate row and every old schedule publication remain unchanged. A cancellation
or rollback is another complete, lineage-linked event, never deletion of history.
Gaps represent missing rate coverage, and explicit zero definitions retain their
own administrator provenance.

The API captures current authenticated organization/admin identity, requires an
explicit enrolled worker, and accepts no caller organization or actor. Identity
locking plus expected publication/fingerprint CAS serializes concurrent changes.
Exact idempotent retries return their original publication even after newer
schedules. Changed retries conflict. Definition, schedule publication, provenance
and current pointer commit atomically. Raw definitions and schedules remain
administrator-only; project grants expose only separately scoped saved costs.

## Preserve actual costs and explicit correction lineage

A new calculation records the exact schedule publication, segment and rate
revision it resolved at the work date. Saved personnel publications continue to
use their frozen amount/rate evidence. Reviewing the same Time version must
never look up the current schedule or change money. Operational future forecasts
may use the current approved schedule only through a separately named forecast
projection with visible schedule version and coverage.

A supersession that changes rates for an already-published work date does not
recalculate that stream. It reports affected saved publications as explicit
exceptions. Applying the changed rate to saved actual costs requires the proposed
versioned `rate_correction` publication event: previous Operations revision and
fingerprint, exact old/new line rates and amounts, actor/reason, and an audited
correction sequence. Finance verifies the complete replacement and lineage while
consuming Operations amounts. It must not calculate the corrected cost itself.
Neither schedule administration nor rate correction can implicitly change tenant,
worker, project, booking or currency.

## Activation gates

The old `HistoricalPersonnelRate` resolver and v1 same-Time economic freeze stay
active until producer/consumer schedule and correction contracts are approved.
An additive catalog/schedule migration, explicit provenance-preserving baseline,
and a new versioned Operations adapter are separate implementation steps. Tests
must prove an open-ended baseline supersession, preserved old rows/costs, exact
boundary dates, gaps/explicit zero, overlapping/cross-tenant denial, two concurrent
administrators, historical retry, failed-transaction rollback, complete correction
lineage, and actual PostgreSQL/PostgREST/HTTPS Finance parity. Exact-source review,
preview, release and rollback gates precede activation. This document supplies no
permission to rewrite history or activate a new resolver.
