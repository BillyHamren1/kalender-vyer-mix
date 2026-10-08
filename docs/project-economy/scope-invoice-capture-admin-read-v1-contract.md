# Authenticated whole-scope invoice capture read v1

This is an unmounted read boundary over the source-owned whole-scope
invoice capture from migration `20261002052436`. It adds no pricing rule,
financial publication, authority assignment, category coverage or EAC. Its exact
wire shape and authorization/lock ordering received independent contract
approval. The implementation below still requires independent source review and
actual native/authenticated-interface evidence. The existing selected-obligation drilldown, manual
composition reader, source receivers and kernel modules remain unchanged.

## Actual display token and request

The existing `operations-scope-obligation-evidence.v1` reader exposes the saved
composition `snapshotId`, scope revision and membership fingerprint. It does not
expose a canonical scope snapshot ID. Therefore the new request uses the exact
immutable composition ID already displayed by that reader, rather than requiring
the UI to invent or independently discover another identity.

The request has exactly four fields:

| Field | Rule |
| --- | --- |
| `schema_version` | `operations-scope-invoice-capture-admin-read.v1` |
| `root_kind` | `project`, `large_project` or `packing_project` |
| `root_id` | Strict UUID string |
| `expected_composition_snapshot_id` | Strict UUID string of the displayed immutable composition |

No organization, actor, economic scope, baseline list, source selector, amount,
status, currency or completeness flag is caller supplied. A changed displayed
composition is an explicit `PT409` conflict, not a new amount under an old token.
An absent composition does not fabricate a zero; the existing manual evidence
reader continues to describe the absence.

## Exact source-owned reply

The reply has exactly three fields:

| Field | Rule |
| --- | --- |
| `schema_version` | `operations-scope-invoice-capture-admin-evidence.v1` |
| `authority_scope` | `canonical_scope_invoice_capture` |
| `evidence` | Exact unchanged 28-field `operations-scope-invoice-kernel-evidence.v1` |

The nested evidence contains bounded financial/provenance IDs and hashes. It
contains no raw invoice document, customer name, staff name, approval actor,
secret or unredacted source payload. The same-organization administrator is the
explicit authorized audience. This initial API does not widen access to project
members or derive privileges from a project leader label.

The browser parser calls the frozen strict source validator, verifies derived
organization plus requested root kind/root UUID and exact composition snapshot
ID, and uses the unchanged Operations projection if displaying known invoice
subtotals. It never substitutes captured manual estimates for invoice amounts,
includes credit eligibility or promotes source/category coverage. SQL copies the
existing source evidence and does not implement subtotal pricing again.

## Authenticated authority and lock ordering

1. Strictly reject wrong key sets, nonstring identities and unknown/null root
   kinds. Derive the live organization through the actual
   `authorize_scope_admin_v1()` helper: `auth.uid()`, existing auth user,
   exactly one profile's `user_id`/organization and current organization admin
   role are locked and checked.
2. Take the existing `obligation-org:<org>` transaction advisory barrier before
   reading mutable scope/composition selections. Recheck the real root and
   actual packing policy/parent through the source-owned membership helper.
3. Read the current canonical root head and immutable current composition
   selection without acquiring leaf or protocol-head row locks. Require the
   displayed composition snapshot ID, same organization/root/scope, and its
   exact scope revision/membership fingerprint to match the current head.
4. Derive the seven-field private request from those saved identities and call
   `read_scope_invoice_kernel_v1` in the same transaction. That source-owned
   reader locks its default-off gate, gathers all bounded global source
   selectors, obtains sorted invoice barriers before any leaf/protocol heads,
   and performs the locked current graph/composition/baseline/ownership checks.
   Do not call the older manual evidence reader first: it has another lock path
   and would add unnecessary selection/price interpretation.
5. Recheck each selected genuine leaf with
   `authorize_obligation_admin_v1(project_id)` while the existing source
   barriers are held. Capture remains read-only. All failures roll back the
   read transaction, including lock acquisition; no receipt or economic event
   is appended.
6. Verify the returned source identities against the derived request, copy the
   exact nested evidence, and enforce the final 256 KiB bound. The existing
   global 100-selector, 1000-obligation and 10000-anchor caps remain enforced;
   no pagination or truncation pretends to return a complete capture.

The public RPC is a minimal security-invoker wrapper over a private,
empty-search-path security-definer reader, granted only to `authenticated`.
Anonymous and service-role execution of this new app boundary are denied. The
existing service source boundary remains separately gated and unchanged. The
new boundary cannot activate either the scope or leaf read gate.

Only exact known stale-current-source exceptions may be translated to `PT409`;
authorization denial, disabled gates, malformed provenance, limits and backend
errors must retain explicit unavailable/denied semantics. Do not catch all SQL
errors and label them stale or no evidence.

## Browser lifecycle

The new loader uses the actual Supabase PostgREST client and a fixed captured
Bearer token. It validates organization/actor/root IDs locally, checks
`getSession()` immediately before and after the RPC, compares both user ID and
exact token, applies a single 15 second deadline to the whole operation and
honors caller abort. Session/token/profile permission changes cannot reuse a
previously accepted view. Local session checks are cache/lifecycle isolation;
SQL remains the authority. No new panel or route mount is included.

## Evidence matrix and remaining gates

| Case | Required result |
| --- | --- |
| Actual split allocations across two bookings | Same copied partial amounts and distinct allocation anchors as the frozen capture |
| Unknown, empty or excluded source | Null unknowns, retained diagnostics; no made-up zero or EAC |
| Coequal V2 relationship metadata | Changed inventory references with valid unchanged economics; no coverage promotion |
| Changed displayed composition or graph | Explicit stale conflict, old token cannot display new capture |
| Changed current baseline | Explicit current-capture unavailable/conflict; no old manual estimate added to invoices |
| Revoked admin, changed profile, foreign root | Permission denied with no economic evidence writes |
| Disabled leaf/scope gate | Permission unavailable; read cannot enable a gate |
| Anonymous/service-role execution | Denied by actual grants and live auth checks |
| Authenticated private helper execution | The same live auth checks apply; the private schema is not an additional PostgREST route |
| Real authenticated HTTP | JWT -> PostgREST -> actual new SQL -> frozen source validator/projection, no RPC mocks |
| Session change, abort or deadline | Result discarded, no cross-session cache acceptance |
| Concurrent policy/source/baseline/graph writers | Existing source barriers and exact-current native proofs remain mandatory |

Independent source review, actual native PostgreSQL and real authenticated HTTP
proof are separate gates. A local SQL rehearsal or green parser tests cannot
substitute for them. The API stays default-off/unmounted; upstream freshness,
all-category project costs, Time/Catering/credit mapping, complete remaining
costs, EAC, operating budget and release remain unavailable.

## Isolated implementation evidence

The new files are the additive migration
`20261002061253_operations_scope_invoice_capture_admin_read.sql`, universal
`project-scope-invoice-capture-admin.ts` parser/test, browser
`projectScopeInvoiceCapture.ts` loader/test and the dedicated admin PostgreSQL
fixture/vector verifier. None changes the frozen source capture, kernel,
selected-obligation drilldown, model, UI routes or receiver.

Twelve focused parser/lifecycle cases passed. A supplemental single-session
PGlite rehearsal loaded the exact fifteen source prerequisites from the frozen
scope batch plus the new migration, ran its actual native seed and invoked the
new authenticated SQL boundary. Four raw PostgreSQL reply/request strings passed
the new parser and unchanged Operations scope/leaf projection: current split
invoices, a newer explicit policy, a genuine economic source correction and an
empty new composition. This rehearsal is not native PostgreSQL concurrency,
JWT/PostgREST, HTTP or preview evidence.

The new rollback-only SQL fixture must run after the frozen scope native seed in
the same fresh dedicated `eventflow_scope_invoice_kernel_*` database, before its
concurrency shell changes the fixture's heads. Both source guards require the
isolated GUC and exact disposable seeded state; the fixture checks actual role,
profile, root, disabled-gate, stale graph, stale baseline and displayed-token
failures without suppressing unrelated SQL errors. Successful reads leave the
economic evidence counts unchanged. Its final SQL sentinel is
`operations-scope-invoice-capture-admin-postgres PASS`; the four-vector Deno
sentinel is `operations-scope-invoice-capture-admin-native-vectors PASS 4`.
