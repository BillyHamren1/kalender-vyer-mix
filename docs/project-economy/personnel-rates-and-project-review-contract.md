# Personnel rate correction and independent project review

Status: proposed next delivery. The existing v1 transport stays a shadow projection;
this document does not authorize deployment or reinterpret a Time day approval as
an independent Operations project approval.

## Verified source and current boundary

Operations source: `BillyHamren1/kalender-vyer-mix`,
`1b068c7233aecc56ac29957d0534b05842abf929`. Time source:
`BillyHamren1/eventflow-time`, `d236273ee781a05ba4a73d2b86a39f294c03731d`.

| Source | Finding | Consequence |
| --- | --- | --- |
| Time `20260828200754_separate_admin_and_personnel_domains.sql` | `domain_approval_decisions` binds organization, submission and payroll/project domain; it has no project, booking or allocation identifier. | The project domain is a whole worker/day decision. |
| Time `review-domain/index.ts` | The command accepts organization/submission/domain/decision/reason/idempotency key. | A per-project decision cannot be inferred from this endpoint. |
| Time `20260828070000_order_approval_decisions.sql` | “Order” means canonical decision ordering via `decision_sequence`. | It does not implement booking/order approval. |
| Operations generated `src/integrations/supabase/types.ts` | `app_role` is admin/forsaljning/projekt/lager; `user_roles` and `profiles` carry organization IDs. | General Planning access is insufficient for compensation administration. |
| Operations same generated types | `staff_members.hourly_rate` and salary are nullable current values. | They do not prove a historical loaded personnel cost. |
| Operations `_shared/staff-day-cost-lines.ts` | Legacy rates fall back to completion/current staff values and missing cost becomes zero. | Do not use this path to provision canonical history or amend the new ledger. |

Existing v1 publications freeze all economics for the same Time snapshot version.
Operations and Finance enforce this independently. Attestation may change status,
but it cannot change rate, amount, allocation or calculation version.

## Operations authorization and rate history

The administration endpoint must authenticate a real Operations system user with
`auth.getUser`, derive the organization from the current server-side profile, and
recheck an organization-scoped role/capability in the database. User metadata,
caller-supplied organization IDs, staff email, free-text project leader names and
Time worker accounts are not authorization.

Initially only the current organization `admin` role may administer rates. A later
delegated `personnel_rate_admin` grant must be explicit, revocable and audited.
Project review requires either that same organization admin or an explicit active
grant bound to the actual Operations project UUID. The general `projekt` role is
not sufficient to review every project's personnel costs.

The rate command supplies worker UUID, work/travel category, currency, integer
minor-unit hourly cost, inclusive effective-from/exclusive effective-to dates,
cost basis, source reference, reason, expected history revision and idempotency
key. Server verification checks the worker belongs to that organization and
records the system actor. An explicit zero is valid; a missing rate stays null.

Cost basis is `approved_loaded_hourly_cost` for staff or
`approved_supplier_hourly_cost` for hired personnel. A current salary or wage
cannot be automatically treated as either. Employer charges, holiday pay,
overtime, supplier terms and currency conversion require an approved source;
unspecified components must be reported as missing rather than invented.

Published rate evidence is append-only. Corrections append a new history event
that explicitly supersedes selected prior events and defines the affected date
range. Selection must yield exactly one active event for worker/category/currency
and work date; overlap is rejected atomically. The original rate row, its source
and every publication using it remain readable. Supersession is a separate event,
not an UPDATE to the old frozen rate.

A rate administration command never changes existing personnel costs by itself.
It returns affected streams and a reviewable impact proposal. A separate explicit
recalculation command selects those streams and exact old/new rate events. This
allows an authorized administrator to approve a bounded correction while retaining
the original Time source. No automatic full-history rewrite is allowed.

## Independent project review

Operations records append-only review events keyed by organization, stable Time
stream, exact Time snapshot hash/version and project UUID. Each event stores the
complete sorted allocation ID set for that project, an economics fingerprint,
decision, actor, reason and database-owned review sequence. A review is a CAS on
the current project review head, with exact duplicate retries and changed-content
conflicts.

The fingerprint includes the project-specific saved lines with their rate
references and amounts, plus organization/worker/date, stable stream, Time
snapshot ID/hash/version and calculation version. It excludes publication
revision and line status. Review of project A changes only A's statuses; B retains
its own independently valid event. Missing or invalidated project reviews produce
preliminary lines. Reopening A does not recalculate A or reopen B. Payroll review
has no effect on project cost status.

A new Time snapshot invalidates old snapshot-bound reviews. A legitimate rate
correction invalidates affected project fingerprints; unaffected projects may
retain their matching review. Void rejects the affected source lines; a pending
Time correction cannot be confirmed through an old review. Empty Time corrections
still replace the complete previous stream.

## Proposed versioned recalculation contract

Introduce `operations-personnel-cost-v2` only after coordinated Operations and
Finance implementation. Keep the v1 reader unchanged during the migration. V2
retains stable stream identity and monotonic database-owned `source_revision`,
and adds a mandatory `cost_revision_event`:

```ts
{
  schema: 'operations-personnel-cost-revision-event.v1',
  event_id: string, // immutable UUID, Operations assigned
  kind: 'time_snapshot' | 'project_review' | 'rate_correction',
  previous_source_revision: number, // zero only for first publication
  previous_snapshot_fingerprint: string | null,
  actor_system_user_id: string | null, // required for review/correction
  reason: string | null, // required for correction
  source_reference: string,
  affected_project_ids: string[],
  rate_changes: Array<{
    source_time_line_id: string,
    old_rate_revision: string | null,
    new_rate_revision: string | null,
    old_amount_minor: number | null,
    new_amount_minor: number | null
  }>
}
```

For a same-Time-version economics change, Finance accepts only a `rate_correction`
event whose previous revision/fingerprint matches its committed stream and whose
listed changes exactly cover the changed saved lines. Finance verifies lineage,
types and replacement completeness; Operations remains the sole calculator.
`project_review` may change status only. `time_snapshot` must advance the Time
version and preserve source authenticity. No event can implicitly change tenant,
worker, currency, project or booking under a rate correction.

The entire publication, correction/review evidence and exact immutable outbox
body commit atomically. Finance consumes it as a complete stream replacement,
with the same signed transport and strict committed receipt binding. Historical
retries are exact replays even after later revisions. Revert is another audited
event referencing its predecessor, never deletion of history.

## Gates before v2 activation

1. Independent review agrees exact event schema and transition matrix; versioned
   producer/consumer validators reject unknown or incomplete events.
2. Compatible additive migrations support v1 and v2 side by side. Backfill is an
   explicit provenance-preserving operation; missing history is not fabricated.
3. Actual isolated PostgreSQL/PostgREST/HTTPS tests cover two projects in one day,
   independent review/reopen, multi-booking allocations, overlapping rate denial,
   explicit zero/missing rate, authorized correction and unauthorized cross-tenant
   commands, lost reply after Finance commit, CAS races and duplicate replay.
4. Matching previews show identical Operations/Finance amounts with old/new rate
   evidence and provisional/confirmed status. Existing Booking billing and
   installment forecast remain verified. Hired personnel invoices are reconciled
   to their time-derived costs before both can enter actual totals.
5. Exact source CI, separate independent review, release approval and rollback
   gates pass. v1 shadow ingestion is not evidence that these gates have passed.

## Implemented v1 project status boundary (shadow only)

`publish_operations_personnel_cost_ingress_v1` is the canonical service boundary
for a verified Time read. It validates frozen allocations and rate evidence,
locks the same stream row used by project review commands, and derives every
project status from the current Operations ledger before the sole publication,
immutable transport body, durable outbox and per-project proof links commit.
The existing whole-day Time project review remains source provenance. It cannot
confirm an unreviewed Operations project. The compatibility outbox RPC remains
unchanged; switching the service store to the canonical RPC requires its exact
native SQL proof first.

`publish_operations_project_personnel_reviews_v1` accepts only a stream/project,
expected source and review sequences, and an idempotency key. It captures the
actor from `auth.uid()`, checks the live organization/project grant, and derives
all statuses from saved economics and ledger heads. It exposes no arbitrary
cost, rate, status, actor or organization inputs. A matching rejected project
stays rejected during a global `correction_requested`; a matching confirmed
project becomes preliminary. A new Time snapshot/economic fingerprint invalidates
both approval and rejection. Global `voided` makes all lines rejected. Missing
rate evidence remains null, and review never reruns the rate calculator.

Immutable `operations_personnel_project_publication_links` and
`operations_personnel_project_publication_proofs` retain the previous publication,
trigger event/actor, matching review event, exact allocation IDs and economic
fingerprint for each resulting project status. Historical retries acknowledge the
original immutable body even after newer reviews; malformed producer envelopes
are rejected before status normalization.

Database-current source evidence is not proof that Time has no later correction.
Before enabling user attest/publication controls, the application service must
perform a fresh authenticated Time read and reconcile its latest submission,
version and global decision sequence into the canonical ingress. No attest UI or
production transport is activated by these migrations. Actual isolated
PostgreSQL/PostgREST/HTTPS proof, independently reviewed source, exact-version CI,
preview, compatible release and rollback gates remain mandatory.
