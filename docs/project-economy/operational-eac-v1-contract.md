# Operations durable cost forecast v1 — isolated contract

Operations calculates each obligation using the existing frozen
`project-cost-obligations.ts` replacement kernel. The new
`project-operational-eac.ts` wrapper aggregates those Operations results, keeps
confirmed/preliminary amounts separate, and uses one remaining amount per
obligation. It never adds forecast and commitment twice for the same remaining
work. Hired time is noncharging only under explicit invoice authority and exact
relation evidence. Credits reduce their exact original allocation without
restoring an already-consumed estimate or commitment.

Every obligation freezes baseline version/fingerprint and immutable source
publication references. A source allocation may belong to only one obligation
in a publication. Project/organization/currency mismatches, duplicate consumption,
missing source proof and unsafe integer sums fail closed. Complete declarations
for personnel, supplier, Catering and other categories require explicit source
references; unavailable coverage or unknown remaining costs keep remaining/EAC
null. Known observed costs remain visible with their separate coverage state.

Captured Booking budgets retain source booking identity/revision/hash, raw
payload, mapper version and coverage. Verified budgets aggregate across explicitly
mapped bookings. Their amount is explicitly an operating-cost budget in minor
units; Booking sales/revenue amounts cannot be substituted. The mapper must prove
that basis and unit contract before marking an actual capture verified.
Unavailable mappings require null amount, and any unavailable
budget withholds budget/variance. Raw legacy JSON never becomes a guessed zero.

Source inspection at Ops commit `a076d9421ed0cbb92091c86f2cb85ce13a29d0b7` found
`projects.booking_id`, `bookings.assigned_project_id`, and separate large/packing
booking relations. `bookings.economics_data` is arbitrary JSON with booking
version and last-applied revision metadata. Legacy `project_budget` and packing
budgets have hours/rates without currency or versioned replacement semantics.
The canonical multi-booking mapper, Booking budget units/version contract,
obligation baselines and source-to-obligation/consumption enrollment are therefore
unavailable integration gates. These fields are not automatically imported.

`publish_operations_project_forecast_v1` is service-only. It receives input,
result, the exact canonical JavaScript raw-input string, expected revision and
idempotency key. It validates JSON equivalence and the raw UTF-8 SHA-256 rather
than reserializing arbitrary fractional Booking evidence through PostgreSQL.
It validates scoped input/result identity, safe totals/coverage and
captured budget consistency; then CAS publishes frozen input/result, exact
immutable result body, accounting-consumption source links and raw Booking
captures in one transaction. Exact historical retry returns its original body
hash. Evidence failure rolls back the head and all appended records. Tables use
RLS with no client access and immutable update/delete/truncate guards.

Every persisted row and receipt explicitly says `integration_state:
'isolated_contract'` and `shadow_only:true`. No active source mapper, UI total,
actual forecast reader, Finance receiver/transport, signed endpoint, attestation
flow or production release is provided by this draft. Before activation, a
trusted Operations service must resolve each reference against current actual
Time/Operations, invoice and native Catering publications and their explicit
project/obligation enrollment; input hash alone proves integrity, not source
authority. Current costs stay unchanged. Finance's future versioned contract
consumes the exact copied Operations result; it must not calculate costs/EAC.

Seven focused pure tests and generated actual-kernel synthetic fixtures cover
replacement, attestation parity, multiple budgets, unknown costs/legacy budgets,
hired time, credits, duplicate consumption and safe sums. Native SQL fixture,
actual source/PostgREST/HTTPS chain, concurrent CAS, corrections/removal of source
allocations, independent review, exact CI, preview, compatible migration/release
and rollback remain mandatory gates. A complete synthetic category inventory is
never evidence that actual project costs are complete.

Finance's current project map can bind multiple source Operations projects to
one Finance project. A future receiver must retain source organization/project/
currency identity and must not overwrite one source forecast with another or
silently combine independently scoped EACs. An explicit authoritative full-project
ownership/aggregation mapping contract is required first. Future transport must
carry the frozen baseline/source-publication and accounting-consumption evidence
alongside the copied Operations result; the stored result body alone is not the
activated cross-module audit protocol.
