# Historical rate enrollment v1 — shadow contract

The authenticated organization administrator supplies a strict JSON command to
`enroll_operations_personnel_rate_v1`. The database derives actor and organization
from current `auth.uid()`, exactly one `profiles` row, and a current same-org admin
role. The worker must already have an explicit Operations source binding in that
organization. No actor or organization can be supplied in the command.

The command schema is `operations-personnel-rate-admin.v1`, with exactly these
additional fields: `worker_id`, `rate_revision`, `category`, `currency`,
`hourly_rate_minor`, `effective_from`, `effective_to`, `reason`, `source_reference`,
`idempotency_key`, `expected_history_sequence`. Amount is an explicit safe integer
in minor currency units. An explicit zero is allowed and audited; null or missing
amounts are rejected. Dates are ISO calendar dates; intervals include the start
and exclude the end. Null end means open-ended.

Enrollment takes a worker/category/currency identity lock, checks the current
admin history sequence, and appends rate history plus an immutable actor/reason
and exact-command event in one transaction. Exact retries return the original
event; changed retries conflict. A failed event insert rolls back the rate too.
Future inserts into the shadow rate table take the same lock and reject overlap,
including trusted service imports. Existing rows remain untouched. Preexisting
rows without admin events retain null event provenance in the reader.

`get_operations_personnel_rate_history_v1(worker_id)` is administrator-only.
Project review grants, system project roles, staff and administrators from other
organizations convey no raw worker rate-history permission. Per-project saved
costs have a separately scoped read contract. The administrator reader returns
rates and their provenance; the service engine still reads its own rate evidence.

Existing open-ended rates cannot be superseded by this enrollment API. A future
rate change needs a separately reviewed immutable schedule-supersession/lineage
contract. It must preserve old schedules and every saved v1 calculation, without
deleting history or retroactively rewriting `effective_to`. Enrolling a new rate
never recalculates or republishes existing personnel costs. Same-Time economics
correction remains closed until the versioned correction protocol is proven.

Native isolated SQL tests cover strict types/dates, current-role and tenant
checks, explicit zero, overlaps, historical retry, CAS, failed-event rollback,
trusted-service insert guard and immutability. Cross-session concurrent writes,
actual PostgREST JWT authorization, UI, release, and rollback remain separate
gates before this shadow administration is exposed in the product.
