# Whole canonical scope publication → Finance copy v1

Contract proposal only. No writer, route, receiver, migration, mount, default gate,
financial posting or complete-cost claim is implemented by this document.
Operations owns cost calculation. Finance copies the same saved projection; it
must not recalculate EAC, sum component money, infer budgets or repair coverage.
The first publication is a **partial current invoice capture of the whole
canonical scope**, not a complete cost of that scope.

## Existing authority and limits

| Actual source | Meaning for the proposed boundary |
| --- | --- |
| `20261002014937_operations_project_scope_enrollment.sql` | Immutable canonical scope/root/membership, permanent member ownership; legacy Booking IDs remain TEXT |
| `20261002030747_operations_scope_obligation_composition.sql` | Explicit captured manual baselines and permanent scope ownership; no whole-scope budget |
| `20261002052436_operations_scope_invoice_kernel_capture.sql` | Same-transaction current baseline/source/policy capture, entire sorted invoice selector set, caps and graph recheck |
| `_shared/project-scope-invoice-kernel-evidence.ts` | Operations validates the capture, invokes its unchanged leaf kernel and produces `operations-scope-invoice-kernel-projection.v1` |
| Finance `20261001230603_operations_personnel_bound_read_v1.sql` | Existing captured personnel destinations and component read; its component totals are not an input to the new whole-scope copy |
| Finance `20261002024010_operations_catering_validating_copy_v1.sql` and `20261002061347_operations_catering_allocation_receiver_v2.sql` | Existing exact-byte native snapshots, current stream/route binding and immutable receipts; useful transport patterns, not extra scope money |
| `canonical-scope-view-alias-v1-contract.md` | Alias helper/preview only; no persisted alias authority/event/RPC exists |

The existing Operations projection contains known/confirmed/preliminary captured
invoice subtotals, nullable when no current charging allocation exists. It retains
excluded anchors and diagnostics. All category coverage and source coverage are
unavailable; budget, remaining, EAC and margin are null and credit eligibility
false. Time, native Catering, hired-personnel metadata and credits do not enter
this projection. Their separate saved evidence is neither erased nor added to it.
Booking revenue is never an expense budget. Tax, currency conversion, insurance,
company policy and whole-versus-leaf budget policy are not supplied by this slice.

The new protocol cannot turn an empty catalog into zero complete project cost.
An actual Operations-produced zero within an otherwise supported projection can
be copied as zero; a missing/unresolved amount remains null. Finance does not
infer equality from the two cases.

## Stable proposed destination body

The proposed wire schema has exactly these 23 keys; names and bounds require
independent contract ACK before implementation. UUIDs use canonical lowercase
dashed strings, revisions are positive safe JSON integers and hashes lower64hex.

| Key | Rule |
| --- | --- |
| `schema_version` | `operations-whole-scope-cost-destination.v1` |
| `delivery_kind` | `snapshot` or explicit `withdrawal` |
| `source_organization_id`, `destination_organization_id` | Enrolled Operations and Finance tenants, never caller-selected authorization |
| `economic_scope_id`, `destination_scope_id` | Actual canonical Operations scope and explicitly mapped whole Finance scope; no UUID resemblance |
| `publication_id`, `publication_revision` | Immutable Operations publication UUID and monotonic stream version |
| `source_publication_fingerprint` | Purpose-bound full immutable Operations publication semantic proof, opaque to Finance |
| `source_evidence_fingerprint` | Purpose-bound entire saved raw capture proof; excludes only separately stored observation timestamp |
| `scope_snapshot_id`, `scope_revision`, `membership_fingerprint` | Actual saved canonical membership tokens |
| `composition_snapshot_id`, `composition_revision`, `composition_fingerprint` | Actual saved canonical composition tokens |
| `destination_mapping_id`, `destination_mapping_revision` | Immutable captured source-scope → whole destination-scope mapping version |
| `scope_semantics` | Exactly `full_canonical_scope`; never an alias portion |
| `calculation_basis` | Exactly `current_invoice_capture_only`; more source categories require a new reviewed version |
| `projection` | For snapshot, the exact existing Operations projection schema/values; for withdrawal, null |
| `source_manifest` | Redacted saved proof rows defined below; withdrawal uses an explicit empty array |
| `shadow_only` | Exactly true |

For snapshot, all repeated scope/organization/revision/fingerprint fields must
agree with the copied projection and immutable capture. No caller supplies any
monetary field to the public Operations command. Finance validates exact shape,
integer ranges, scope proof consistency and hashes, but does not run the kernel,
add confirmed/preliminary fields, derive missing totals or price any source.
The copied projection preserves its `as_of`, `membership_currentness:as_of_graph`,
`source_currentness:saved_receiver_heads_only`, partial amount labels and every
unavailable/null field. Finance adds its own received timestamp/currentness
outside that projection, never by modifying Operations values.

`source_manifest` is the actual current `source_inventory` captured by Operations,
ordered uniquely by source_anchor, with its two upstream private keys
`source_organization_id` and `invoice_id` removed. Its exact remaining 16 keys are:
source_anchor, project_id, obligation_id, binding_event_id, source_snapshot_id,
source_economic_revision, source_economic_fingerprint, source_raw_sha256,
current_snapshot_id, current_raw_sha256, policy_state, policy_event_id,
policy_revision, policy_fingerprint, mapping_state, reason. Keep historical refs
and null current refs for excluded/unsupported anchors. No upstream document IDs,
raw snapshots, actor reasons, personnel identity, hourly rate or ingredient detail
cross this boundary. Diagnostic reasons must be approved machine codes from the
actual server capture, not arbitrary operator text. The private full capture and
manifest remain immutable in Operations; redaction does not manufacture source
currentness or make Finance the proof authority.

One recipient must be authorized to receive the whole scope. Mapping a leaf is
insufficient. If the scope cannot be wholly mapped to one authorized destination,
block publication delivery explicitly. Do not split a whole projection between
Finance organizations, distribute its subtotal over leaf projects or deliver
another organization's private source IDs. Data-sharing/operator policy must be
explicitly enrolled, not guessed from existing project/booking maps.

No whole-scope Finance mapping/entity/grant is established by the inspected
existing component consumers. `destination_scope_id` and its versioned mapping
are NEW required authority, not an alias for an existing Finance project UUID.
Before receiving a copy, root must lock that entity's actual tenant ownership,
full member-set correspondence, access policy and immutable mapping contract.
Retain exact Operations leaf/legacy Booking identities in Operations; translate
only through explicit captured destination bindings. Missing correspondence or
policy blocks delivery/read, with no inferred Finance hierarchy or budget.

## Canonical evidence and byte identity

Separate the three proofs:

1. Evidence fingerprint: SHA256 UTF8 of the canonical array
   `["operations-whole-scope-cost-evidence-v1",savedCaptureWithoutAsOf]`.
   Preserve all other capture fields, exact historical/current refs and nulls.
2. Publication fingerprint: SHA256 UTF8 of
   `["operations-whole-scope-cost-publication-v1",fullImmutablePublication]`.
   The immutable object has no self-fingerprint field. It includes its actual
   calculation version, capture/projection identity, source proofs and original
   observation timestamp. Once saved, neither those fields nor the timestamp
   changes on retry.
3. Destination body hash: SHA256 of the **exact UTF8 wire bytes**, independent of
   semantic fingerprints. Save raw_body and raw hash before the first attempt.
   Retry signs those same bytes with a fresh nonce. Same revision/different bytes
   is a permanent integrity conflict, even if JSON parses identically.

Use the approved Operations `canonical_json_v1` contract with matching reviewed
TypeScript UTF8 key ordering/Unicode/escaping vectors. Do not silently reuse the
scope adapter's private JavaScript `.sort()` serializer for an unrelated new
fingerprint purpose. The existing captured_inventory_fingerprint remains copied
unchanged and uses its existing approved inventory contract. Add cross-SQL/TS
vectors for supplementary Unicode, BMP keys, quotes, slash/newline, UUID identity,
null and array ordering before any new canonical implementation is accepted.

## Operations publication authority and transaction

Proposed public authenticated command: exactly schema_version, economic_scope_id,
expected_scope_revision, expected_membership_fingerprint,
expected_composition_revision, expected_composition_fingerprint,
expected_publication_revision, idempotency_key and reason. Actor and organization
come from the live organization administrator; a leaf grant, alias preview,
service identity or caller tenant cannot register whole-scope financial authority.
A separate service orchestration command can select an already authorized scope,
but cannot establish actor authority or supply trusted money.

A future immutable publication ledger has one stream per Operations tenant and
canonical economic_scope_id. Exact command replay returns the original immutable
publication/receipt; it never reactivates historical policy, mapping or source.
Changed command under the same idempotency key fails; deliberate stale business
CAS is PT409, not retryable40001. New source/policy/baseline/composition/mapping
observations produce a new revision. No mutable legacy route ever rebinds old
publication bytes or replaces the current stream by an older head.

The final writer must capture and validate the actual projection, insert the
immutable publication and all selected destination bodies/outboxes, and advance
its head in one atomic Operations transaction. Source aliases/amounts from an
earlier HTTP response are not authority. Existing52436 is currently a read,
and the adapter is a TypeScript function; neither is already an atomic saved
publication writer. An implementation must first resolve this calculation bridge:

- A new Operations-only private writer/calculation validator must prove parity
  with the unchanged projection/leaf kernel using exact database vectors; all
  supplied calculated money must be checked against actual server-selected
  locked evidence before commit.
- Alternatively, a staged immutable candidate can be calculated by the actual
  Operations server adapter, but final publication must repeat and verify the
  same protected current proofs and the Operations-authorized result. A shape,
  hash, service role or prior calculation response alone cannot authorize money.
  If that atomic authority cannot be established, keep publication unavailable;
  do not solve it by allowing a caller-supplied projection.

No calculation bridge is implemented or source-approved by this document. Root
owns its physical API/transaction orchestration gate. Finance does not fill it.

Preserve existing financial capture lock order: obligation-org:<org>, default-off
capture gate, ALL globally deduplicated/sorted source Finance-org/invoice barriers,
then current canonical scope/composition/head, live leaf projects/baselines and
policy/source head rechecks. First counterpart inserts remain protected by the
existing entry barriers. Publication stream CAS/head lock must come after the
protected source set, never create an inverse source→organization order.
Authenticated entry-level actor/project checks must be audited with current
writers before implementation. Any additional operations-economic-scope:<org>
reservation or alias lock needs a joint owner/reviewer audit before combining
it with the financial capture order; preview compatibility is not that proof.

Existing legacy graph inserts are not all frozen by52436. Preserve coherent
`as_of_graph` membership, final locked scope/head/graph recheck and the explicit
late-join diagnostic; do not claim absent legacy joins cannot arrive after the
observation. A source change after a publication commit makes a later revision
necessary; a delivery queue acknowledgement cannot prove upstream freshness.

Bounds remain global:100 distinct invoice selectors,1000 obligations,10000
anchors and256KiB capture/wire bound without truncation. If a new destination
shape exceeds the bound, return unavailable rather than silently omitting rows,
partially serializing a scope or splitting transport into unrelated money.

## Immutable routing, corrections and outbox

Proposed versioned route/mapping records default disabled, with separate enabled
and active-for-new-publication flags. Capture whole source/destination tenant and
scope, mapping version, route UUID/version, HTTPS endpoint, key ID and secret UTF8
fingerprint permanently before enqueue. New routes never mutate existing rows.
Different key IDs allow old/new drains; changing secret under the same key ID
blocks old captured fingerprints visibly rather than pretending both can drain.

Validate every intended recipient/map before creating any outbox row. A missing
route/map/capture yields durable unavailable/blocked health with no made-up cost.
Mappings require real Finance target tenant/scope/project authority and a genuine
whole-scope grant/enrollment. Existing mutable personnel project/booking maps are
not this new authority. Client-supplied Finance target IDs cannot repair it.

A new publication is a full scope snapshot, including all retained excluded
anchors. Corrected/removed source obligations invalidate old current evidence;
new copied known values/nulls replace current projection rather than append a
second charge. A destination move creates a new publication revision with a full
snapshot to the new authorized destination and an explicit null-projection
withdrawal to every historical recipient. Retain the old bodies/receipts/history.
Without a saved successor/withdrawal lineage, do not transfer scope ownership.
An alias never causes another money stream or recipient-specific subtotal.

Claim via actual SKIP LOCKED and lease-owner/token/expiry CAS; only one claim can
own a row. Check captured route/map/key enabled status and secret fingerprint at
claim and immediately before native send. A revocation after preflight cannot be
claimed atomic; the receiver performs its own current enrollment checks.
Lost response after Finance commit yields durable retry/unknown outcome, no
fabricated ACK. Fresh-nonce retry keeps exact body bytes and Finance deduplicates.
Finishing a lease requires a strict committed receipt; expired/stale owner tokens
cannot mark delivery successful. Blocked/retryable/delivered/superseded states
and private diagnostic codes remain durable and distinct.

## Finance fixed-purpose receipt and read

Proposed exact route: `/functions/v1/operations-whole-scope-cost-receive` over
trusted HTTPS, no redirects/query/credentials/fragments. Dedicated disabled
feature/key/enrollment namespace; old personnel/Catering/invoice HMAC keys do
not authorize this purpose. Sign exact newline-joined UTF8 bytes, no trailing LF:
`POST`, `operations-whole-scope-cost-receive`,
`operations-whole-scope-cost-destination.v1`, keyId, timestamp, nonce, rawBody.
Freshness±120s, strict key/nonce bounds, secretUTF8≥32bytes. Bound request256KiB,
receipt16KiB, strict UTF8, whole fetch/body/parse deadline and late-body cancellation.

Receiver locks real enabled tenant/scope/map enrollment and targets, validates
full canonical-scope permission, and atomically inserts durable nonce, exact raw
snapshot/current head and immutable receipt. Failed scope/key/shape/CAS checks
consume no nonce. Expose only a service-only invoker entry/narrow private definer;
no direct service INSERT/UPDATE into snapshots, heads or receipts. Use immutable
identity, head-advance and no-delete/truncate guards, explicitly revoking inherited
privileges. Historical bytes may replay without rewinding current head; lower
unknown versions are stale and same version/different bytes are rejected.

Proposed exact14 receipt keys: schema=`operations-whole-scope-cost-receipt.v1`,
outcome=accepted|replayed|stale, source_organization_id, economic_scope_id,
destination_organization_id, destination_scope_id,
requested_publication_revision, applied_publication_revision,
current_publication_revision, request_body_sha256, snapshot_receipt_id,
snapshot_fingerprint, receipt_id, shadow_only=true. Accepted binds requested=
applied=current. Historical replay binds exact saved applied/requested bytes
and permits a later current revision. Stale binds requested raw SHA plus the
actual higher current snapshot/revision/fingerprint. Every successful finish
must re-read that real receipt UUID/snapshot FK and all scope/hash fields in a
native proof; a plausible JSON ACK is insufficient.

Finance stores exact projection values and source fingerprints in a NEW copied
whole-scope ledger, never its official accounting ledger. New admin read must
require actual is_org_finance_admin plus explicit whole destination-scope access
and access to all mapped current members; a leaf/project alias grant cannot
expose additional bookings. No current mutable remap can retarget historical
receipts. Label received_currentness=`latest_received_publication` separately;
Operations as-of graph/source fields remain unchanged. Historical/revoked/stale
mapping/alias evidence cannot be relabeled current or become complete coverage.
Alias display is a future gate: until persisted authority exists, allow only the
canonical scope. Future alias displays show the same full canonical projection,
including additional members, with a separate live alias revision/currentness.

## One charge and verification gates

Whole-scope and component evidence are different views of overlapping facts.
Finance must never add this projection to personnel, native Catering, allocation
V1/V2, official invoice/credit or leaf evidence totals. Maintain lineage links for
drilldown/comparison only. The canonical source stream key is source tenant plus
economic_scope_id, not root view/Booking/alias/receipt ID. Source allocation
uniqueness remains Operations tenant+permanent source_anchor; two distinct real
allocations in one invoice may each count once, while duplicate anchors fail.
Finance does not infer an exclusion from hired classification, role, cost-line
name, legacy consumes_commitment or identical worker/minutes.

| Native case | Required proof |
| --- | --- |
| Two bookings, two allocations, one invoice | Exact Ops whole projection copied; both legitimate portions once, no component re-addition |
| Empty/unsupported/stale/missing-rate categories | Unknown coverage and whole totals/nulls retained; no Finance hidden zero or EAC |
| Actual policy/source/baseline/graph correction | Protected Ops writer either publishes exact new evidence or conflicts; history immutable |
| First V1/V2 counterpart and reverse source lock orders | Actual Lock observation; no stale amount or phantom counterpart authorization |
| Auth/gate/whole-map/parent deletion or revocation | Fail closed before publication/nonce; leaf grants cannot expose whole scope |
| Alias preview and stale alias | Cannot authorize transport/read; future full-scope display requires actual saved current alias |
| Same version changed bytes, HMAC purpose/key/freshness | Exact denial; no nonce/head/snapshot mutation |
| Real simultaneous claims/expired owner | One lease; stale finish denied by CAS |
| Commit then lost response/fresh retry | One current copy, actual saved receipt pointer/rawSHA proof |
| Reverse delivery, withdrawal, tenant/mapping/route rotation | No old-head resurrection/rebinding/private recipient leak |
| Component plus whole presentation | No additive totals, no official postings, all copied values byte/proof equal to Operations |

First implementation ownership should stay disjoint: Operations capture/calculation
bridge and immutable publication; Operations new transport outbox/dispatcher;
Finance new enrollment/receiver/copied read; isolated exact-source native harness;
independent schema/auth/lock/privacy review. Root coordinates physical API/workflow,
source pins, release and policy gates. No implementation proceeds from this draft
until exact body/receipt/atomic calculator-bridge invariants receive review and
explicit lock. A partial invoice copy is never a complete project-economy release.
