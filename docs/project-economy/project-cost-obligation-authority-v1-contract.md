# Operations obligation and original-source authority v1

This is the contract for a new local authority ledger. The existing
`operations_project_forecast_*` isolated evidence tables do not satisfy this
contract and cannot enroll an invoice, resolve a credit or authorize an EAC.
Financial activation remains disabled until the real ledger and its runtime
authorization, source-currentness and accounting-consumption gates pass.

This first boundary is explicitly `authority_scope: local_project_only`. It
authorizes actual `public.projects` leaves, not an entire canonical economic
scope rooted at a large or packing project. Its stored baseline/binding evidence
and source reader preserve that label. Future canonical scope projection must
deduplicate every actual source anchor once across all captured member leaves.
A true whole-scope baseline needs current scope membership/revision and a
separate reviewed authorization model; it cannot be silently summed with leaf
baselines. Whole-project ownership, category completeness and EAC acceptance
therefore remain open.

## Immutable Operations baseline

An obligation has a stable UUID, one actual Operations organization/project,
one currency, one category and one cost basis. Currency/category/basis and
ownership cannot be silently changed by a later revision. A baseline event
captures estimate and commitment independently, each as a nonnegative safe
integer in minor units or explicit null. Zero is an explicit reviewed value;
unknown is null. A manual Operations baseline is explicitly labelled
`operations_manual`; it is not presented as a Booking budget or invoice amount.
The lead approved explicit authenticated manual baselines as a distinct evidence
basis. They do not imply machine verification of upstream commercial economics.

The proposed authenticated append command contains only the exact fields:
`schema_version`, `project_id`, `obligation_id`, `expected_revision`, `currency`,
`category`, `cost_basis`, `estimate_minor`, `committed_minor`, `idempotency_key`,
`reason`. It cannot supply organization, actor, source costs, review status,
coverage, EAC or a fingerprint. The database derives organization and actor from
the live authenticated account/profile/admin role, locks those rows and the
same-organization nondeleted `public.projects` row, then serializes obligation
CAS/idempotency. Initial scope is organization administrators. Personnel review
grants do not implicitly grant baseline administration rights.

The ledger appends the full baseline, canonical fingerprint, actor and reason,
and advances its saved head atomically. Changed historical idempotency commands
conflict. Historical exact retry returns the same event. Update/delete/truncate
and head identity changes are forbidden. A later baseline revision does not
silently rewrite any source assignment or accounting-consumption event.

## Actual invoice source selection

The first source boundary resolves immutable recipient-scoped invoice evidence
already committed by the actual Operations inverse receiver. It never accepts
an invoice payload, amount, currency, arbitrary fingerprint or status as source
truth. The caller selects only snapshot/allocation IDs and expected economic
revision/fingerprint; the server rechecks them against the current source head.

Existing v1 tables are `operations_finance_invoice_streams` and
`operations_finance_invoice_snapshots`, from migration
`20261001233744_operations_finance_project_invoice_destination.sql`. The saved
snapshot has its recipient organization, source organization, invoice UUID,
source revision, complete envelope, exact raw body, raw SHA and publication
fingerprint. Its allocation supplies allocation UUID, source project UUID,
source cost-line UUID, recipient project UUID, signed minor amount, status and
`consumes_commitment` boolean. The boolean alone supplies no monetary amount.
The matching same-organization live recipient project remains mandatory.

The credit-v2 receiver owns the current v1/v2 projection. A higher source
economic revision wins. Equal revisions must have the same full economic
publication fingerprint. A newer v1 economic publication invalidates an older
v2 relationship, even if the document/anchor identity did not change. Metadata
relationship availability does not imply an authoritative local obligation.

The stable source anchor is SHA-256 over the exact UTF-8 LF-joined tuple, with
no trailing LF or BOM:

1. `finance-invoice-allocation-source-anchor-v1`
2. lowercase source-organization UUID
3. lowercase invoice UUID
4. lowercase allocation UUID
5. lowercase document fingerprint
6. uppercase three-letter currency

The server computes that anchor from the saved envelope. UUID resemblance or
a caller-provided anchor does not establish a binding. A source assignment
freezes snapshot ID/raw hash, economic revision/publication fingerprint,
document fingerprint, allocation identity, recipient project, amount/status,
baseline event and currency. One anchor permanently belongs to one local
obligation. Cross-obligation/project/currency reuse fails closed. Transfers or
correction reanchors require a separate reviewed lineage protocol.

## Replacement and commitment consumption

Observed actual cost is copied from the saved source. Estimate replacement and
commitment consumption are separate explicitly authorized Operations evidence.
They cannot be inferred from invoice totals, source status, remaining balance,
the Finance boolean, the Booking revenue amount, or an isolated EAC input.
Unspecified values remain null and withhold complete remaining/EAC coverage.
The first ledger must not silently use zero for either unknown amount.

A later reviewed policy event can capture exact replacement/consumption minor
amounts under an authenticated Operations administrator, actor/reason and CAS.
The event references the immutable baseline and source economic fingerprint;
aggregate consumption must remain within that baseline. It changes no source
amount or legacy cost calculation. Credits always replace/consume zero and
never restore an estimate or commitment already consumed by their original.

## Credit resolution

The credit receiver supplies trusted current recipient evidence, including its
own source anchor and nullable credited original anchor. Resolution requires an
actual saved positive original allocation, matching recipient organization and
project/currency, a current economic revision/fingerprint, and a permanent
original-anchor assignment to the same local obligation. A stale/rejected/
withdrawn original, an unbound anchor, source-currency mismatch or changed
economic fingerprint remains unresolved. Signed Finance metadata alone is
insufficient. Rejected source status is noncharging, without deleting the real
commitment. Partial credits accumulate against exactly that original allocation;
concurrent credit reservation must reject cumulative over-credit atomically.

The credit's own source anchor also needs a separate authenticated authoritative
assignment to that same local obligation. Matching the destination project or
the original's binding cannot supply it. The first positive-original binding
API does not accept credits; therefore credit eligibility remains unresolved
until an explicit credit-assignment event can resolve actual saved v2 source
evidence. That future event derives source amount/status from the real receiver,
captures both anchors, original economic proof, actor/reason and CAS, and rechecks
all unified current-source heads inside its publication transaction. A standalone
read response is not an authorization token for a later credit write.

The resolver returns a frozen evidence reference and a machine-readable
eligibility state; it cannot return `complete` merely because the source anchor
exists. Trusted consumers derive the frozen obligation-kernel inputs from these
ledger events. The frozen `project-cost-obligations.ts` kernel stays unchanged.
Finance consumes copied Operations amounts and never computes obligation EAC.

## Separate gates

This ledger is project-local. Canonical economic-scope membership, local TEXT
Booking to canonical Booking source mapping, complete category inventories,
actual operating-budget basis, fresh upstream reads and Finance whole-scope
aggregation remain separate gates. An eligible original/credit pair does not
prove that the entire project's remaining costs are known. Tests must use the
actual receiver publications and authenticated database boundary, include
revocation/cross-tenant failures, saved-source changes/withdrawal, CAS/retry,
unknown baseline/consumption, rollback and concurrent over-credit, then exercise
the real default-fetch/PostgREST chain. Synthetic authority objects and the
isolated forecast publisher are not substitutes for those gates.

## Implemented first boundary

Migration `20261002023731_operations_project_obligation_authority.sql` adds
immutable manual baselines, permanent source ownership and append-only invoice
binding events. `append_operations_manual_obligation_baseline_v1(p_command)` and
`bind_operations_invoice_obligation_v1(p_command)` use authenticated public
invoker/private definer wrappers. The exact binding command has ten fields:
`schema_version`, `project_id`, `obligation_id`, `expected_obligation_revision`,
`source_snapshot_id`, `source_allocation_id`, `expected_economic_revision`,
`expected_economic_fingerprint`, `idempotency_key`, `reason`. It cannot supply
source money, status, actor or an anchor.

The service-only `read_operations_obligation_original_v1(organization, project,
obligation, anchor)` returns `bound_original` or `unresolved` with a reason. A
bound original is explicitly limited to `source_currentness: receiver_v1_only`.
It returns saved original allocation/baseline references and copied money, with
`remaining_coverage: unavailable`, `eac_minor: null`, `shadow_only: true` and null
replacement/consumption. It is not a v2 credit-eligibility verdict. A changed
baseline or current v1 source revision invalidates the binding; an explicit
rebind appends history while preserving the permanent original owner. It cannot
be used for credit activation until the separately owned unified v1/v2 current
source projection proves no newer economic publication supersedes that original.

The generated fixture uses the actual inverse-v1 recipient receiver RPC to save
its synthetic original, then actual authenticated/service database roles for
baseline, binding and source reads. Five pure command/anchor cases, Deno source
checks and the complete PGlite SQL fixture passed locally. Native PostgreSQL,
concurrent source/baseline/currentness locks, real PostgREST JWT and independent
source review remain gates; PGlite is a single-session rehearsal. No official
cost, provider invoice, project source or legacy forecast is written.
