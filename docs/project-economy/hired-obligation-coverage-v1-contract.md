# Hired-staff obligation coverage v1

Status: source-only, default-off projection boundary. This contract adds no RPC,
database reader, UI route, pricing rule, economic total, EAC, budget, margin,
invoice approval, provider call, publication or runtime activation.

## Exact source base

The candidate is prepared for repository `BillyHamren1/kalender-vyer-mix`, branch
`codex/project-economy-personnel-cost`, commit
`ee4b7761942c4dd9ca73e705648b45f7849418e9`, tree
`b9af1770ae83b793da83b01fde2b6ecb37a39b20`. Publication requires a fresh
outer ref/tree check and structured absence checks for every additive target.

The source depends on the existing canonical boundaries, without editing them:

- `supabase/functions/_shared/hired-personnel-authority.ts` validates saved
  Operations Time/Catering publication metadata.
- `supabase/migrations/20261002061659_operations_hired_personnel_authority.sql`
  owns hired basis, permanent operational-source ownership, correction and
  withdrawal currentness, and the invoice binding identity. Its gate defaults
  off. It fixes `replaces_estimate_minor=0` and
  `consumes_commitment_minor=0` for operational evidence.
- `supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts` and
  `supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql`
  own the captured whole-scope invoice inventory. Invoice allocations, not
  hired Time amounts, remain the economic charge.
- `supabase/migrations/20261002014937_operations_project_scope_enrollment.sql`
  owns canonical source-project and local-booking membership. Its graph is an
  as-of snapshot and its economic mapping remains unavailable.

## Input and output

`operations-hired-scope-coverage-input.v1` is a future internal join input. A
future route must construct it only from one validated canonical scope capture,
the same saved membership tuple, and current results from
`read_operations_hired_operational_source_v1`. Caller JSON is not
authorization. Source shape validation alone cannot create such evidence.

Every hired source must bind the same organization, a project in the captured
project set, the same obligation, and the exact invoice binding present in the
captured invoice inventory. Source identities are globally unique. Multiple
operational rows may reference the same invoice allocation; the output emits
one `economicChargeReferences` row per invoice source anchor, marked
`countedBy=scope_invoice_capture`. Repeated anchors must retain the identical
project, obligation, binding event, economic revision, economic fingerprint,
mapping state and reason; a stale or mixed replay fails closed.

The output `operations-hired-obligation-coverage-projection.v1` exposes:

- current or unresolved operational evidence and its saved revision;
- source coverage (`complete` or `missing_rate`) and the saved calculated
  Operations amount with its exact source currency, strictly as noncharging
  source evidence;
- the existing invoice allocation reference that owns the economic charge;
- source-project and booking counts bound by the saved membership fingerprint;
- bounded diagnostics for changed/withdrawn source, missing rate and unavailable
  invoice relation.

It does not calculate or copy an invoice amount. `additional_cost_minor`,
remaining, EAC, budget and margin are always null. All four project categories
remain unavailable, source coverage is unavailable, credit eligibility is
false, and both economic-totals and runtime admission are false. An empty source
array is `no_evidence`, never zero or complete. There is no aggregate currency;
the projector never converts or combines per-source money.

## Required behavior

- Hired Time/Catering evidence is `operational_only`; it never replaces an
  estimate or consumes a commitment.
- The invoice allocation already present in the scope capture is the sole
  economic charge. Two operational source rows linked to it still emit one
  charge reference and no added cost.
- Missing rate remains a null source amount. A caller cannot combine
  `missing_rate` with a numeric value.
- A corrected, withdrawn or stale source remains unresolved with its historical
  evidence; retry cannot create a second source identity.
- Cross-project joins, nonmember projects, changed binding IDs, conflicting
  source anchors, noncanonical booking/project membership and promoted
  coverage/EAC fields fail closed.
- Multiple booking IDs remain separate members under the one saved membership
  fingerprint. This projection never apportions a shared charge by booking.

## Tests and CI

The Node test covers shared-invoice deduplication, multiple bookings, missing
rate, correction/withdrawal, excluded invoice relation, empty evidence,
cross-project and nonmember joins, replay duplication, conflicting charge
identity, stale invoice revision/fingerprint/mapping, caller promotion attempts
and bounded canonical membership. It uses no network, database, provider or
secret.

The additive workflow pins Node `v24.21.0`, has read-only repository permission
and executes only the source test. It pins checkout to full commit SHA
`11d5960a326750d5838078e36cf38b85af677262` and setup-node to full commit SHA
`49933ea5288caeca8642d1e84afbd3f7d6820020`; it does not invoke npm. These
controls establish only a deterministic source-contract job. They do not prove
database, authenticated route, hosted runtime, UI or release behavior.

## Open gates

Before product use, a separately reviewed server route must authenticate the
actor and organization, hold the hired gate/project/scope/composition/source/
invoice identities in the established lock order, build this input without a
caller-controlled adapter, prove correction/withdrawal and multi-booking races
in native PostgreSQL, redact personnel data, and return a session-bound read.
Default-off UI, hosted GoTrue, exact deployed source, Finance copied evidence,
real provider chains, EAC/budget/margin activation, rollback and release remain
open. No real invoice, approval, payment or customer communication is permitted
for these tests.
