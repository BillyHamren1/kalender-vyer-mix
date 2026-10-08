# Whole-scope current invoice capture v1 proposal

This contract was approved for a new default-off implementation. The accepted
leaf kernel batch remains frozen. All new source and additive SQL still require
independent source review and exact native authorization/concurrency gates before
integrated-runtime claims; no release or default gate activation is included.

The new boundary selects genuine current positive invoice evidence within an
explicit saved canonical Operations scope composition. Operations calls its
unchanged obligation kernel for each selected local obligation and copies those
partial actual subtotals into a distinct whole-scope invoice projection. It does
not publish a budget or complete project cost. Category/source coverage is always
unavailable; remaining/EAC/margin are null and credit eligibility false. Native
Catering, personnel Time and credits are excluded visibly.

## Actual source objects

| Source | Exact saved authority |
| --- | --- |
| Canonical root/head | `operations_project_scope_heads`: organization_id/economic_scope_id/root_kind/root_id/current_revision |
| Immutable graph | `operations_project_scope_snapshots`: snapshot_id/scope_revision/membership/membership_raw/membership_fingerprint |
| Actual graph | private `scope_membership_v1(org,root_kind,root_id)` from migration 20261002014937; exact source-project, local TEXT Booking and relationship identities, tenant/parent/policy checks |
| Selected composition | `operations_scope_obligation_composition_heads` plus immutable `operations_scope_obligation_compositions` from 20261002030747 |
| Explicit selected baseline set | `operations_scope_obligation_baseline_captures` linked to the exact composition snapshot and current manual baseline/head |
| Permanent obligation owner | `operations_scope_obligation_ownership` binds organization/obligation to one canonical economic_scope_id |
| Permanent allocation owner | `operations_project_obligation_source_ownership` and latest immutable `operations_project_obligation_invoice_bindings` |
| Source current selection | `operations_finance_invoice_economic_current_v2`; only saved receiver heads, no upstream-freshness claim |
| Coherent local kernel evidence | private `read_invoice_obligation_kernel_v1` and its approved public service read from 20261002044751 |

Large/packing root UUIDs are not public.projects UUIDs. Local leaf obligations
are selected only through the real saved composition, and their project IDs must
be in the exact current canonical membership. Packing has no deleted_at field;
the actual helper rechecks current packing status policy and a genuine same-org
live parent. Local Booking IDs remain their exact legacy TEXT values. They never
become Finance Booking source UUIDs through resemblance or parsing.

## Proposed request and raw evidence

The service-only request has exactly seven fields:

| Field | Validation |
| --- | --- |
| schema_version | `operations-scope-invoice-kernel-read.v1` |
| organization_id / economic_scope_id | Strict UUID strings |
| expected_scope_revision | Positive safe JSON integer |
| expected_membership_fingerprint | Lowercase 64-hex SHA256 |
| expected_composition_revision | Positive safe JSON integer |
| expected_composition_fingerprint | Lowercase 64-hex SHA256 |

No source selector, baseline list, actor, price, status, currency or coverage is
caller supplied. An authenticated UI wrapper must separately derive the actor's
live organization/admin authority; this service boundary cannot substitute a
caller tenant for that authorization. A default-false organization read gate is
required. No app activation is part of this proposal.

The proposed raw response has these exact fields:

```
schema_version: operations-scope-invoice-kernel-evidence.v1
organization_id, economic_scope_id
scope_snapshot_id, scope_revision, membership_fingerprint
composition_snapshot_id, composition_revision, composition_fingerprint
root_kind, root_id, currency
membership_currentness: as_of_graph
source_currentness: saved_receiver_heads_only
captured_inventory_matches_current: boolean
captured_inventory_fingerprint: lowercase SHA256
as_of: calendar-valid RFC3339 string
members: [
  {project_id, obligation_id, captured_baseline_event_id,
   captured_baseline_revision, captured_baseline_fingerprint,
   kernel_evidence: <exact approved 17-field leaf evidence>}
]
saved_source_references: [
  {source_anchor, project_id, obligation_id, binding_event_id,
   source_snapshot_id, source_economic_revision, source_economic_fingerprint,
   source_raw_sha256, binding_state:bound_original|unresolved,
   policy_state:current|missing|stale, policy_event_id,
   policy_revision, policy_fingerprint}
]
source_inventory: [
  {source_anchor, project_id, obligation_id, binding_event_id,
   source_organization_id, invoice_id, source_snapshot_id,
   source_economic_revision, source_economic_fingerprint, source_raw_sha256,
   current_snapshot_id: null|UUID, current_raw_sha256: null|SHA256,
   policy_state: current|missing|stale,
   policy_event_id: null|UUID, policy_revision: null|positive-safe-int,
   policy_fingerprint: null|SHA256,
   mapping_state: charging|excluded|unsupported_basis,
   reason: null|string}
]
diagnostics: string[]
category_coverage: {personnel:unavailable,supplier:unavailable,
                    catering:unavailable,other:unavailable}
source_coverage: unavailable
credit_eligible: false
remaining_minor: null
eac_minor: null
budget_minor: null
shadow_only: true
```

The source inventory is the complete latest permanent positive-binding catalog
within the selected obligation set at the coherent transaction observation. It
retains every anchor even when unsupported, withdrawn, rejected or stale, without
reusing its historical amount. Its immutable provenance is historical binding
identity; `mapping_state` is the current captured interpretation. The leaf
kernel evidence supplies actual current money and policy only when verified.
Each captured baseline/member is unique by organization/obligation, with one
permanent canonical owner and exact current saved baseline.

Stale expected scope/composition revision or fingerprint, stale graph, changed
current baseline, foreign/deleted parent/member, inconsistent permanent owner,
duplicate identities and bound excess are explicit unavailable errors. They do
not return a partial amount labeled current. Historical composition remains
readable through its existing historical evidence reader, not this current
capture boundary.

## Composition selection versus fresh source inventory

The composition authorizes an explicit immutable set of manual baseline IDs and
scope ownership. Its source_inventory is an immutable observation made when it
was saved. A new explicit source policy or a new legitimate permanent allocation
binding need not change the selected baseline set. The new capture rederives
current source bindings/policies for exactly that baseline set in one protected
transaction; it must not pretend the old composition's source inventory was
updated in place.

`captured_inventory_matches_current` compares captured composition binding/policy
references against the complete fresh inventory. A difference is retained as
`captured_inventory_changed`, alongside immutable composition/source references.
It is not a completeness flag. The parent approved this distinction: a current explicit policy can feed the leaf kernel without an unrelated manual
composition rewrite, while scope and baseline references must still match.
Even true inventory equality cannot establish all-category coverage.

The response includes the explicit captured policy event/revision/fingerprint
for each permanent anchor, including retained stale policy references, and the
selected current snapshot/raw hash when supported/resolved. A reproducible
`captured_inventory_fingerprint` is SHA256 UTF8 of the exact prefix
`operations-scope-invoice-kernel-inventory-v1\n` plus
`canonical_json_v1(source_inventory)`, with inventory ordered by source_anchor
(lowercase 64-hex, C ordering). Timestamp is excluded. The new Operations validator
recomputes this fingerprint from the exact strict inventory shape; hashing alone
is not authorization. Compare original saved composition binding/policy/current
state references against this captured inventory using explicit normalized UUID
identity and null semantics. The equality boolean is derived and tested, rather
than an opaque assertion unsupported by source evidence. Current V2 proof
references remain distinguishable from a V1-only composition inventory; metadata
enrichment cannot silently replace historical refs.

## Locking and captured currentness

1. Strictly validate request and take `obligation-org:<org>` advisory lock before
   any mutable local baseline, binding, policy or composition read. The current
   writers use that same organization barrier.
2. Lock the default-off gate FOR SHARE. Read the exact immutable current
   composition selection and its captured baseline IDs without taking leaf or
   invoice-head row locks. Derive ALL latest bindings for those obligations,
   including unsupported bases, and deduplicate actual (source Finance tenant,
   invoice UUID) selectors. Cap at 100 global distinct selectors, 1000 selected
   obligations and 10000 permanent anchors across the entire scope. A collection
   of individually small leaves may not bypass the global caps.
3. Acquire the unchanged canonical globally sorted invoice barriers for that
   entire selector set before any leaf obligation or protocol-head locks.
   First counterpart inserts are protected even when an invoice head is absent.
   No new row trigger or advisory key scheme is introduced.
4. Lock and recheck the current scope/head and exact expected saved scope
   snapshot, and the current composition head/snapshot. Reuse the real
   `scope_membership_v1` one-CTE graph and live root/packing-parent/policy checks.
   Require exact current graph equality and membership fingerprint. Canonical
   enrollment uses its own scope barrier, not the obligation-org barrier, so the
   final locked recheck is mandatory. Do not claim the first unlocked selection
   proves current membership.
5. Lock/recheck selected real leaf projects and manual obligation heads, exact
   baseline event/revision/fingerprint/currency and permanent scope ownership.
   Require composition captures/document to agree and all selected project IDs
   to be members. Unsupported cost bases are represented explicitly, not
   transformed to invoice basis. Stale baseline means no current scope capture.
6. Invoke approved `read_invoice_obligation_kernel_v1` for each unique selected
   member within this SAME transaction. Reentrant organization/source barriers
   are harmless because the whole global source set is already held. Validate
   returned scope/baseline references and crosscheck every returned source
   against the permanent catalog. Existing/new V1/V2 heads and source policy
   references cannot race the protected read. Never inject an earlier HTTP
   response or only a hash as trusted input.
7. Serialize bounded raw evidence at most 256KiB without truncation. Return
   observation as_of separately from immutable proof references. Each response
   is an as-of graph plus saved-head proof, never proof that Booking/Finance
   delivery queues are drained or that external data is newest.

The current composition/kernel helpers remain unchanged. Source receiver entry
wrappers take only invoice barriers and never obligation-org. The new reader
must not hold a leaf/head lock and then acquire a previously uncollected invoice
barrier. A native proof must show a legitimate distinct-invoice writer is not
serialized by an accidental invoice-ID-only or unordered barrier design.

## Manual parent/leaf and allocation ownership

No parent/child financial overlap is inferred from UUIDs, booking lists, project
names, category or a manual reason. An Operations large/packing root currently
has no local manual obligation table identity; it selects genuine leaf baselines
through composition. A public.projects root may itself be in source_project_ids,
but its manual baseline is still LOCAL_PROJECT_ONLY, not automatically a whole
scope budget. Permanent scope ownership prevents a local obligation from being
composed into competing scopes. A future true whole-scope baseline needs a
separate reviewed basis/coverage/lineage contract.

This projection NEVER sums manual estimate/commitment values across parents and
leaves. It shows their immutable references only. No revenue is an expense
budget, and no whole-plus-leaf replacement or EAC is calculated. Actual source
allocations are owned by a single local obligation through permanent anchors.

Allocation dedup key is (Operations tenant, source_anchor), NOT invoice_id or
Booking ID. A shared invoice's two actual allocation IDs may represent distinct
legitimate portions under different obligations/bookings: both may charge once.
Two leaves referring to the same permanent allocation cannot both charge it.
Identical repeated member/source entries are rejected instead of selecting a
first row. Conflicting source ownership is unavailable. The outer catalog
reference and its child kernel source refer to the same allocation and are
counted once, rather than summing both representations.

## Proposed Operations projection

A new pure Operations adapter validates the raw evidence, then calls
`projectLocalInvoiceKernelEvidence` for each unique member; it does not
reimplement leaf source pricing or replacement rules. It sums only the verified
child kernel confirmed/preliminary source subtotals with BigInt and safe bounds,
after permanent anchor uniqueness checks. Values are named
known_captured_invoice_cost_minor, confirmed_captured_invoice_cost_minor and
preliminary_captured_invoice_cost_minor, each null when no charging current
allocation exists. Some current sources produce a clearly partial known subtotal
and all excluded anchors remain diagnostics. An empty scope/selected catalog
never becomes zero full-project cost.

All category/source coverage remains unavailable, remaining/EAC/budget/margin
null, credit_eligible false and shadow_only true. There is no Finance calculation
or transport activation. Existing manual composition/UI fields keep their
original evidence labels and are not added to these invoice subtotals.

## Actual proof matrix before implementation/activation

| Case | Required captured result / proof |
| --- | --- |
| Two genuine bookings under one large root | Exact two master join identities/current same-org parent; selected leaves only; partial amounts once |
| Same legacy booking has multiple public.project leaves | Capture exact leaf relations; no arbitrary first leaf; permanent allocation ownership decides charging |
| Two distinct allocations in one saved invoice | Both actual portions charge once; invoice-level dedup must not erase one |
| Same permanent anchor repeated in members | Strict reject; no double charging or first-row ownership choice |
| Deleted/foreign large root or packing parent | Live helper rejects, no current cost returned |
| Packing policy revoked | Current helper/gate reject; no invented packing.deleted_at |
| Graph join deleted/reinserted with same endpoints | Changed relation ID changes fingerprint; stale capture rejected |
| Late legitimate join/leaf or new scope revision | Final locked graph/head differs; old expected proof unavailable |
| Foreign leaf/local TEXT booking/master row | Existing exact tenant checks fail; never infer true Booking UUID |
| Composition replaced during read | Org barrier observed; expected revision recheck or coherent old transaction, not mixed selection |
| Baseline changed while reader holds barriers | Authenticated writer waits; later old composition capture becomes unavailable |
| New source/policy under unchanged selected baseline | Real writer waits org barrier; current catalog/reference distinction visible |
| First V2 counterpart while head absent | Actual service writer waits global source barrier; absent head remains absent until reader ends |
| Actual V1 correction/higher V2/conflicting equal FP | Actual writer waits; subsequent leaf evidence withholds old amount and keeps excluded anchor |
| Global selectors exceed cap across small leaves | Entire capture unavailable, no truncation or piecemeal locks |
| Noninvoice Time/Catering or credit source | Unsupported diagnostic/null coverage; no invoice replacement or credit eligibility |
| No selected baseline/current charging amount | Nullable known captured costs; overall coverage unavailable/EAC null |
| Partial invoice policy larger than observed price | Exact frozen kernel variance within manual baseline bounds; no invented price cap |
| Parent manual estimate plus leaf estimate | Neither estimate sum nor whole-scope budget/EAC created |
| Multi-currency manual captures | Reject; no conversion or currency inference |
| Operations-to-Finance many-to-one map | No transport or combination; explicit authoritative scope receiver remains a separate gate |

Exact native PostgreSQL/role enforcement, actual service PostgREST request, SQL
serialization to the new Operations adapter and globally ordered two-session
races must all pass. Existing V1/V2 HTTP regressions remain mandatory after
barrier dependencies; green unit/PGlite does not close runtime gates.

## Reserved implementation boundaries after contract approval

The proposed new public service-only RPC is
`read_operations_scope_invoice_kernel_evidence_v1(p_request jsonb)`, with a new
private definer and default-false organization read gate. Operations owns NEW
`_shared/project-scope-invoice-kernel-evidence.ts` and its test, a CLI-generated
additive `operations_scope_invoice_kernel_capture` migration and dedicated SQL,
vector and native race artifacts. Existing leaf kernel evidence/calculator,
composition/scope enrollment, invoice receiver, all root-owned authenticated
read/UI files and Finance-owned scope display remain untouched. Root owns remote
commit/workflow wiring and assigns any later authenticated wrapper/UI separately.


## New implementation artifacts and evidence

The new migration is CLI-generated
`20261002052436_operations_scope_invoice_kernel_capture.sql`. Public service-only
`read_operations_scope_invoice_kernel_evidence_v1(p_request jsonb)` forwards to a
private definer with an empty search path and default-false organization read
gate. The exact response has 28 top fields, exact 6-field members, exact 18-field
fresh inventory items and exact 13-field saved normalized references. The saved
references are historical provenance, never authorization. Current comparable
refs use the selected current snapshot/raw SHA for a charging anchor, null for an
excluded anchor, actual source policy proof and normalized UUID identity. The
strict Operations adapter recomputes the fingerprint and comparison boolean.
Both directions of inventory/child correspondence and globally unique child
anchors prevent one allocation being counted through two members.

The new helper/test are `project-scope-invoice-kernel-evidence.ts` and its test.
The dedicated `operations-scope-invoice-kernel-postgres-test.sql` adds a genuine
independent local Booking/master join and publishes one genuine two-portion
invoice body through the actual receiver. Actual authenticated baseline, binding,
policy, enrollment and composition RPCs establish authority. Five reply vectors
prove initial split amounts, newer policy with historical refs preserved,
coequal V2 metadata, higher V2 exclusion and empty selection. An additional
native cap test publishes and binds 100 actual synthetic invoices (101 distinct
invoice selectors total), expects the exact global cap error and rolls back the
extra sources. It does not inject fake ledger rows as source proof.

`operations-scope-invoice-kernel-vector-test.ts` passes the exact database response
strings through the actual new adapter and unchanged leaf kernels. Capture
`scope_invoice_vectors` as a JSON array of exact label/evidence strings before the
fixture rolls back. Run Deno with that path; five vectors must pass. No artifacts
are truncated and no manual estimates are added into these actual-cost values.

The separate native race database must be named
`eventflow_scope_invoice_kernel_ci`. Apply the actual foundation/review/scope/V1,
manual authority, V2, entry barriers, source-policy, composition, approved leaf
kernel-read and new scope-capture migrations. Run the new
`operations-scope-invoice-kernel-native-setup.sql` with canonical authority fixture
and `PGOPTIONS='-c eventflow.scope_invoice_kernel_isolated=synthetic-disposable'`.
Unset PGOPTIONS, then run the new native concurrency shell with CI=true,
EVENTFLOW_SCOPE_INVOICE_KERNEL_ISOLATED_DB=true, loopback PGHOST, PGPORT=5432,
PGUSER=postgres and the dedicated database. Deno must be on PATH, or provide the
exact executable as EVENTFLOW_SCOPE_INVOICE_DENO_BIN. No hosted credentials or
production state are permitted. Guards run before mutation and reject libpq host,
service and options overrides.

The native setup adds a third genuine positive allocation in a second actual
invoice, owned by the selected first obligation. This proves two globally
collected invoice selectors, while retaining the two legitimate portions in the
first invoice. The native journey observes an actual read holding its barriers,
an authenticated policy append, first V2 counterpart insertion, BOTH distinct
source receiver corrections waiting, and an authenticated manual baseline
append. Exact old/new refs, accepted receipts and excluded anchors are asserted.
After the real baseline correction, an explicit actual composition RPC selects
new current baseline IDs; history is not rewritten. An actual legacy Booking/join
insert can commit after a coherent as-of read, while authenticated canonical
re-enrollment waits the scope-head row lock. The later old requested graph is
rejected. It does not claim legacy phantom inserts are blocked or graph data is
permanently frozen.

Eight exact native race reply strings are also passed through the actual
Operations adapter using `--native-races`. The old captured invoice amount is
541000 minor across three positive allocations; after both genuine source
corrections no old prices survive and all captured cost fields are null. This
is still partial invoice evidence, never budget/EAC or all-category coverage.
Private logs, tracked owned children, bounded TERM/KILL/reap cleanup and 12-second
read/writer statement deadlines bound the disposable harness. All connections
have a five-second connect timeout. Observer/helper sessions have five-second
statement/four-second lock deadlines and bounded polling; caller libpq options
remain forbidden. Exception cleanup retains logs rather than waiting forever or
deleting a directory under an unexpectedly unkillable child.

Local verification so far: nine focused pure cases, Deno module/vector check,
actual 15-prerequisite PGlite/direct-RPC fixture and five SQL→actual Operations
vectors pass. The native setup and actual sequential writer/recomposition logic,
plus all eight exact SQL→adapter race response vectors, pass a single-session
PGlite rehearsal. Bash syntax and ten hostile pre-connection guard vectors pass
with zero psql calls. These are supplemental checks; exact native two-session
execution, authenticated PostgREST interface, current application graph and
independent final source review remain open before integration claims.
