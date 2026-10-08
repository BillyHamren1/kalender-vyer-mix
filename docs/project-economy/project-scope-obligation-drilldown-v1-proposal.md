# Authenticated one-obligation drilldown proposal

The root-approved contract now has an additive draft reader/client/panel and
isolated tests. The panel is not mounted; no existing source, scope UI, service
reader, kernel, HTTP proof or gate is changed. No source publication, kernel
calculation, activation or provider request is performed by this read boundary.
The existing authenticated HTTP proof files remain frozen. A future drilldown
would expand one selected saved manual row inside the existing scope panel; it
would not add another project total or run the Operations kernel in the browser.

## Actual authority and source boundaries

Reuse `operations_economy_private.authorize_scope_admin_v1()` from migration
`20261002014937`: actual `auth.users`, one live `profiles` row and an admin role
in that profile organization. Its shared row locks make identity/role changes
wait until the read completes; later reads must deny revoked authority. Reuse
`authorize_obligation_admin_v1(derived_project)` from `20261002023731` to require
the exact same-organization nondeleted local project. Project review grants
authorize the separate project cost surface, not the existing scope/manual
authority surface. This proposal does not add a project-grant fallback.

The current saved scope reader is migration `20261002042934`; immutable scope
composition is `20261002030747`. The unchanged service-private evidence function
`read_invoice_obligation_kernel_v1` in `20261002044751` supplies current copied
baseline and individual invoice binding/policy diagnostics. Its existing
`operations_invoice_obligation_kernel_read_gates` table remains default-off.
Every response branch, including `baseline_changed` and `unsupported_basis`,
requires the existing same-org gate enabled under a shared lock. A disabled gate
is a denial, not a successful empty response. No gate is enabled by this proposal.
The proposed public authenticated wrapper would not grant authenticated access
to the existing general service RPC or permit service credentials in the client.

## Proposed exact request

`read_operations_scope_obligation_drilldown_v1(p_request jsonb)` accepts exactly six keys:

| Key | Value |
| --- | --- |
| `schema_version` | `operations-scope-obligation-drilldown-read.v1` |
| `root_kind` | Exact `project`, `large_project` or `packing_project` |
| `root_id` | UUID of the actual selected root of that kind |
| `obligation_id` | UUID selected from the displayed saved composition |
| `expected_composition_snapshot_id` | UUID of that immutable displayed capture |
| `expected_baseline_event_id` | UUID of that selected captured manual event |

Organization and actor are derived from current server authority. No caller
organization, local child project, source tenant, invoice, binding, money,
policy or calculation is trusted. The client still binds its session, actor,
organization, root kind/ID, snapshot and baseline to the response and cache boundary.

Resolve the exact persisted scope for the real `(root_kind, root_id)` tuple.
Reuse actual `scope_membership_v1` root authorization: nondeleted same-org
projects/large projects, and an actual packing row with enabled exact status
policy. No root kind may be inferred from its ID or downgraded to a child. Require its current saved
composition to equal the requested snapshot, and exactly one captured baseline
to match the requested obligation/event. Derive its local project from that
immutable capture and authorize its current live identity. Do not substitute a
first child, current baseline, similarly named project or another composition. Actual membership changes from the selected capture
also return a deterministic reload conflict; no removed leaf receives current
money.
Missing/replaced displayed capture is a deterministic `PT409` / HTTP 409
reload boundary, not a serialization retry. Genuine transient `40001` failures
retain their database meaning and are not translated into business conflicts. A current baseline that
differs from the selected captured event is an explicit `baseline_changed`
response: retain the displayed saved manual baseline and withhold current source
money. This is not a new source publication or automatic rebinding.

## Proposed exact redacted response

The response has exactly these 22 top-level fields:

| Key | Meaning |
| --- | --- |
| `schema` | `operations-scope-obligation-drilldown.v1` |
| `organizationId` | Actual live profile organization |
| `rootKind` | Exact supported selected root kind |
| `rootId` | Exact authorized root UUID |
| `economicScopeId` | Exact persisted scope identity |
| `scopeRevision` | Revision captured in the selected immutable composition |
| `compositionRevision` | Selected saved composition revision |
| `compositionSnapshotId` | Exact selected immutable capture UUID |
| `compositionFingerprint` | Saved capture fingerprint |
| `obligationProjectId` | Captured local project, reauthorized live |
| `obligationId` | Exact selected captured obligation |
| `asOf` | Actual read observation timestamp, not upstream freshness |
| `state` | `received_evidence`, `baseline_changed` or `unsupported_basis` |
| `referenceCurrentness` | Exact object described below |
| `baseline` | Exact saved manual object described below |
| `sourceCurrentness` | `saved_receiver_heads_only` |
| `upstreamCurrentness` | Always `unverified` |
| `coverage` | Exact unavailable coverage object described below |
| `prognosis` | Exact four null values described below |
| `sources` | Bounded redacted individual source rows |
| `diagnostics` | Bounded predefined diagnostic codes; no raw error strings |
| `shadowOnly` | Always `true` |

`referenceCurrentness` has exactly `composition` (true after snapshot CAS),
`membership` (actual saved composition reference check), and `baseline` (whether
the current immutable manual event equals the selected captured event). These
flags do not establish full-source completeness or perpetual currentness.

`baseline` has exactly nine saved fields: `eventId`, `revision`, `fingerprint`,
`evidenceBasis` (`operations_manual`), `currency`, `category`, `costBasis`,
`estimateMinor`, `committedMinor`. Money preserves independent nulls. This is
the selected captured baseline, never silently replaced by a newer manual row.

`coverage` has exactly `total`, `source`, `personnel`, `supplier`, `catering`,
`other`, `credit`; every value remains `unavailable`. `prognosis` has exactly
`remainingMinor`, `eacMinor`, `budgetMinor`, `marginMinor`; every value remains
null. The wrapper does not call a kernel calculator or aggregate a new subtotal.

Each source row has exactly 13 fields:

| Key | Meaning |
| --- | --- |
| `sourceKey` | SHA-256 of the permanent source anchor; opaque row identity |
| `bindingEventId` | Saved binding event UUID |
| `sourceSnapshotId` | Saved invoice evidence UUID |
| `sourceEconomicRevision` | Saved positive economic revision |
| `status` | Copied current `preliminary`/`confirmed`, otherwise null |
| `amountMinor` | Copied resolved current amount, otherwise null |
| `bindingState` | `resolved` or `unresolved` |
| `policyState` | Copied `current`, `missing` or `stale` |
| `policyEventId` | Actual saved policy UUID or null |
| `policyRevision` | Actual saved policy revision or null |
| `replacesEstimateMinor` | Exact current explicit policy value or null |
| `consumesCommitmentMinor` | Exact current explicit policy value or null |
| `reason` | Whitelisted saved diagnostic code or null |

Current source proof must match the current baseline, actual immutable v1
binding and unified saved invoice heads, exactly as the existing private reader
requires. Current-policy replacement/consumption must remain null when its corresponding
saved estimate/commitment is unknown; the client rejects impossible combinations
without calculating totals. Unknown, changed, rejected or withdrawn evidence cannot reuse old
money or become zero. Missing policy retains a verified current invoice amount
but nullable replacement/consumption; it does not invent a remaining forecast.
Explicit policy amounts may exceed the observed invoice amount where the actual
baseline authority permits it; do not add a price cap or recalculate them.

Diagnostics are the existing predefined coverage/source/credit/personnel/Catering
codes plus `changed_baseline`, `changed_invoice_economics`,
`saved_source_provenance_unavailable`, `positive_original_unavailable`,
`missing_source_binding`, `missing_invoice_obligation` and
`unified_current_economics_unavailable`. Unexpected saved codes fail closed.
Product text translates these codes to plain Swedish. No schema, receiver
version, person, rate, raw payload, actor reason, invoice source tenant, local
Booking identity or internal error text is displayed.

## Coherent reads and bounds

Take live authority locks, then the existing `obligation-org:<org>` advisory lock.
Actual `scope_membership_v1` may authorize/capture the selected root graph here:
it does not acquire invoice protocol-head locks. Resolve the immutable selected composition and captured baseline. Derive current
latest binding invoice selectors while local writers are serialized. Include
all saved composition source anchors too: the unchanged scope reader also checks
other captured obligations. Acquire
`lock_invoice_economic_sources_v1` in its existing global order **before** any
private scope/original reader obtains invoice protocol-head row locks. Invoke
the unchanged scoped reader and unchanged private obligation evidence reader
inside that same transaction and verify the selected capture/baseline again.
Calling the scoped reader first and only then acquiring invoice barriers could
invert importer lock order; that approach is excluded.

Fail closed above 200 current source anchors, 100 distinct invoice selectors or
256 KiB serialized response. Check bounded membership before invoking the
existing service reader; do not truncate rows and call the result complete.
Safe integer checks, exact UUIDs, full ISO/calendar timestamps, exact field
sets and status/money/policy null semantics are required in both SQL and client.
No aggregate cost, remaining amount, forecast or margin is calculated client-side.

Client requests must be abortable and bind the actual session before and after
RPC, with an opaque session cache boundary and no stale-data fallback. Snapshot,
root, actor, organization or selection changes unmount/cancel the drilldown;
revocation hides saved money. A future panel action remains disabled by default
until source, native authenticated SQL/HTTP and rendered browser gates pass.

## Proposed verification gates

1. Genuine invoice receiver → actual admin baseline/binding/policy → saved scope
   composition → authenticated wrapper returns the same copied values/nulls.
2. No actor, foreign live profile org, grant-only nonadmin, role revocation,
   deleted project/large root, disabled packing-status policy, deleted local project
   and unselected obligation are denied.
3. Replaced displayed composition returns `PT409` / HTTP 409; baseline change retains saved manual
   evidence while current source money is unavailable.
4. Changed invoice heads, missing policy, rejected/withdrawn source and unsupported
   time/other basis preserve explicit unknown state and all prognosis nulls.
5. Several source allocations remain distinct by permanent source anchor; no
   full invoice, child scope, Catering or personnel double-counting occurs.
6. Native two-session importer/current-head and baseline/policy changes exercise
   the real barrier order and compare source observations within one read.
7. Real authenticated PostgREST and rendered revoked-session tests are distinct
   from pure parser/DOM tests; every read preserves publication, cost, billing
   and provider ledgers. No real provider request or gate activation is allowed.

## Draft source and remaining evidence

The CLI-generated additive migration is
`20261002054010_operations_scope_obligation_drilldown_read_v1.sql`.
The genuine receiver/admin fixture is
`scripts/project-economy/operations-scope-obligation-drilldown-postgres-test.sql`.
New client/model files are `src/lib/economy/projectScopeObligationDrilldown.ts`
and its `.test.ts`; new unmounted component files are
`src/components/project/OperationsObligationDrilldownPanel.tsx` and its
`.rendered.test.tsx`.

Supplementary matching-major Vitest 3.2.7/React 18 rendering and client contract
checks pass 30 cases (21 model/client, nine intercepted-RPC rendered cases).
Deno 2.8.1 checks the new client; actual Operations ESLint rules pass the four
new TypeScript files. All current SQL migrations plus the actual isolated
receiver/admin commands pass the new rollback fixture in embedded PGlite. This
is not native PostgreSQL, authenticated PostgREST, real browser or lock-race proof.
Independent final source review and exact canonical native gates remain required
before mounting the new panel. Existing saved scope UI, service mapper, kernel,
source policies, HTTP proof and all production gates remain unchanged.
