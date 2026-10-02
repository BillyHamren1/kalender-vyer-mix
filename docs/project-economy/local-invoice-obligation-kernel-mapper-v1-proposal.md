# Trusted local invoice-obligation kernel mapper v1 contract

The new mapper consumes genuine saved Operations manual baseline, positive
invoice binding and explicit source-policy evidence. It calls the unchanged
`calculateProjectCostObligation` in Operations. Finance receives copied Operations
amounts only. This first version stays `local_project_only`, captured/as-of,
shadow-only and default-off: category/source coverage and remaining/EAC are
unavailable. It does not turn Booking revenue into an expense budget or infer
complete costs from an enrolled project or an empty source list.

## Read boundary and coherent proof

A new service-only read accepts exactly schema_version
`operations-invoice-obligation-kernel-read.v1`, organization_id, project_id and
obligation_id. UUID identities are strict strings; no amounts, statuses, policies,
actors or source IDs are caller inputs. An authenticated display path, if needed,
must separately derive/live-authorize the user organization and project before
calling this private read. It cannot expose general service credentials.

The database transaction takes the existing `obligation-org:<org>` advisory lock
before mutable local ledger reads. All manual baseline, binding, source-policy,
own-credit and capacity writers already serialize there. Derive the immutable
latest binding records per permanent source anchor, then deduplicate their actual
(source Finance organization, invoice UUID) selectors. Acquire the canonical
invoice barriers in global order before baseline or protocol-head row locks.
The initial boundary permits at most 100 distinct invoice selectors (the actual
shared helper limit), at most 10000 allocation bindings (the kernel limit), and a
bounded serialized reply. Excess is explicit unavailable/error, never truncation.

After those barriers, lock the current real nondeleted same-organization project,
obligation head and exact immutable baseline. Recheck its project, invoice basis,
currency and current revision. Lock all corresponding existing v1/v2 heads and
read their actual unified received-head selection. First counterpart insertions
are protected by the entry advisory barriers even when their rows do not exist.
One coherent final read captures the selected bindings and policy heads/events.
Private original/policy readers are invoked within this same transaction, after
all source barriers. A prior HTTP response, hash or idempotent receipt cannot be
used as write authorization or currentness proof.

The envelope captures baseline event/revision/fingerprint/manual evidence basis,
all permanent owner/binding identities, exact current v1 snapshot/raw hash/source
economic revision/fingerprint, unified selected snapshot/raw hash,
policy event/revision/fingerprint, copied nullable replacement/consumption values,
resolved/unresolved reason, as_of and the explicit source currentness label
`saved_receiver_heads_only`. Fingerprints cover the immutable selected proof;
as_of is observation metadata, not an upstream freshness token. Baseline,
binding, policy or source changes create different evidence; history is retained.

Only a positive nonrejected actual v1 binding with the same current baseline,
exact saved provenance and matching unified economic revision/fingerprint/common
allocation semantics is a charging source. Higher v2 economics, conflicting
protocols, missing source, withdrawn/rejected source or a stale binding is an
exception. Coequal v2 metadata enrichment may supply an extra captured proof
reference, but cannot rewrite copied v1 money or source-policy decisions. A
v2-only original remains unsupported/unresolved in this first version.

## Exact kernel input mapping

| Kernel field | Trusted origin |
| --- | --- |
| organization_id / project_id / obligation_id | Current real local obligation identity |
| currency / cost_basis | Immutable manual baseline/head; only invoice basis initially |
| estimate_minor / committed_minor | Actual saved manual values, including independent nulls |
| input relation_coverage | Always unresolved until complete source/category authority exists |
| source_id | `invoice:<permanent_source_anchor>`; one latest binding per anchor |
| source organization/project/obligation/currency | Exact same current authority scope |
| kind | invoice for the verified positive original |
| status / amount_minor | Copied actual current saved source, never payment-derived |
| replaces_estimate_minor / consumes_commitment_minor | Current explicit policy only; otherwise null |
| credited_source_id | null; no credits enter this version |
| source relation_coverage | complete only for the verified current positive binding |

Missing policy does not erase an authenticated current actual cost. Its amount is
copied, policy fields remain null and the kernel reports missing replacement.
The legacy consumes_commitment boolean, paid/booked flags, attest or source amount
do not invent replacement/consumption money. An explicit policy may describe
planned variance larger than the observed invoice amount, within the genuine
baseline aggregate bounds; the mapper must not add a per-invoice observed-price
cap which the frozen kernel does not define.

Unresolved/stale binding evidence is preserved outside the charging input. The
mapper must not reuse its old amount, manufacture preliminary/current status, or
turn its absence into a zero project cost. Raw kernel known_cost_minor is merely
a subtotal of supplied resolved sources. The wrapper exposes nullable
known_captured_cost_minor: null when no current amount proof exists, and a clearly
partial known subtotal when some sources resolve. It carries unknown-source and
missing-policy diagnostics. Empty source inventory yields null captured cost,
coverage unavailable and EAC/remaining null. Even a locally calculable raw kernel
subtotal cannot be relabeled complete project cost or full-scope forecast.

## Mixed cost bases and exceptions

| Scenario | Initial mapper behavior |
| --- | --- |
| Estimate known, commitment null | Preserve null; no fabricated commitment or EAC |
| Partial positive invoice, explicit partial policy | Copy actual cost and exact policy; other sources/remaining coverage remain unavailable |
| No policy or nullable policy | Keep actual amount and null policy; visible exception |
| Two bookings share one original allocation | Permanent anchor deduplicates once; booking membership alone creates no source authority |
| Shared invoice has separate genuine allocation IDs | Each permanently bound allocation is distinct; never copy the entire invoice to every booking |
| Correction/new source version | Require current actual binding/policy; old source money is not reused |
| Rejection/withdrawal | Preserve historical reservation evidence and current exception; no automatic commitment release |
| Unknown rate/personnel source | No invoice assumption or zero labor cost; personnel basis unsupported until its real binding/policy mapper exists |
| Native Catering | No fabricated Time IDs; real Catering source/obligation authority needs its own mapper |
| Hired worker time under invoice basis | Do not charge or silently discard Time on a role/name flag. Future verified time-to-same-obligation binding must explicitly authorize noncharging time with replacement 0 / consumption 0 as required by the frozen kernel |
| Time-priced hired work | Requires real versioned personnel source and time-based obligation authority, not supplier-invoice substitution |
| Own-credit assignment/capacity | No direct credit input: credit_eligible remains false; unresolved credit/category diagnostics preserve missing coverage |
| Other/time basis obligation | Explicit unsupported/unavailable; never feed competing invoice sources |
| Finance many-to-one project map | No independent summing or overwriting whole-project EAC; canonical Operations scope ownership remains a separate boundary |

The future whole-scope reader may compose captured local proofs using the existing
canonical membership/revision and permanent ownership, deduplicating every actual
source anchor once. It cannot sum independent complete parent/child baselines or
claim Booking budget, all-category completeness or upstream source currentness.
The existing composition reader remains unchanged; the new Finance-owned redacted
scope display is separate and will not calculate this kernel output.

## Required verification before integration

Pure tests must prove that caller money/status cannot enter the adapter, nulls and
partial costs survive, duplicate anchors/cross-scope/currency/unsafe integers fail,
paid/pre-attest stays its actual status, partial policy/variance is copied, source
version or baseline/policy mismatches are excluded with diagnostics, and every
empty/unknown category/credit/time case retains unavailable EAC. Native SQL must
exercise actual receiver→admin baseline/binding/policy→read evidence. Two-session
source insertion/correction and policy/baseline races must prove the coherent
barrier order and evidence currentness; captured immutable serialization must
match the actual Operations kernel input. No source/admin write, release, new
credit eligibility or existing kernel edit is authorized by this contract.


## Implemented boundary and verification artifacts

The additive migration is
`20261002044751_operations_invoice_obligation_kernel_read.sql`. Service-only
`read_operations_invoice_obligation_kernel_evidence_v1(p_request jsonb)` forwards
to a private definer with an empty search path. Organization read gates default
false and cannot change identity or be deleted/truncated. The strict 17-field
response has an exact 9-field manual baseline and exact 20-field sources. The
Operations adapter is `_shared/local-invoice-obligation-kernel-evidence.ts`; it
validates the response and calls the unchanged `project-cost-obligations.ts`.
No application route, Finance transport or production gate is enabled.

`operations-invoice-obligation-kernel-postgres-test.sql` uses the actual receivers,
authenticated baseline/binding/policy RPCs and service read to produce six response
vectors in its `kernel_vectors` table. Capture its rows before rollback as JSON
with exact `label` and `evidence` strings. Run:

```
deno run --allow-read scripts/project-economy/operations-invoice-kernel-vector-test.ts <sql-vectors.json>
```

The vector checker passes the exact database reply strings through the actual
Operations adapter/kernel. It verifies missing/current policy, coequal V2,
newer V2 invalidation, empty sources and unsupported time basis. The supplied SQL
file outputs the vectors before rollback. A native workflow can replace that
final vector SELECT with an aggregate JSON SELECT while preserving all fixture
assertions and transaction boundaries.

The concurrency gate uses a separate fresh PostgreSQL database named
`eventflow_own_credit_kernel_ci`. Apply the frozen foundation/review/scope/V1,
manual obligation authority, V2, entry barriers, own-credit assignment (for the
unchanged seed table only), source-policy and new kernel-read migrations. Run
`operations-own-credit-native-setup.sql` with the canonical authority fixture and
`PGOPTIONS='-c eventflow.own_credit_isolated=synthetic-disposable'`; do not run its
assignment concurrency journey. Then run `operations-invoice-kernel-native-setup.sql`
with `PGOPTIONS='-c eventflow.invoice_kernel_isolated=synthetic-disposable'`. Unset
PGOPTIONS before invoking `operations-invoice-kernel-native-concurrency.sh` with
CI=true, EVENTFLOW_INVOICE_KERNEL_ISOLATED_DB=true, loopback PGHOST, PGPORT=5432,
PGUSER=postgres and the dedicated database. No hosted credentials are required.

The native journey uses an actual read transaction and observes an advisory wait
from each real competing authenticated policy/baseline writer or service source
receiver. It asserts exact pre/post evidence, accepted receipts, immutable
history, and first coequal V2 head insertion remaining absent while blocked.
Every excluded anchor stays in evidence without its old money. Writer/read
transactions have 12-second statement deadlines; observers use bounded polling.
Shell cleanup tracks only owned child processes and private logs.

Local evidence: ten Vitest cases, Deno module/vector check, actual prerequisite
PGlite/direct-RPC fixture and six SQL-to-kernel vectors passed. Native setup's
actual receiver/policy/baseline logic passed a single-session in-memory rehearsal;
that does not prove concurrency. Bash syntax and ten hostile pre-connection
refusal vectors passed with zero psql calls. Exact native PostgreSQL execution,
concurrent lock observations, authenticated PostgREST boundary and a current
application source graph remain explicit gates before integrated-runtime claims.
