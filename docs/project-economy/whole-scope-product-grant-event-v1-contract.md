# Whole-scope product export grant event23 — proposed field and revoke lock

Status: NEW contract proposal only. Command16 has independent pure source ACK; it authorizes no event or SQL writer. This document requests exact event/helper field review before a pure event helper/test is written. No mutable grant storage, privileged entry, secret schema, source read or product NULL constraint is changed. Finance's verifier and unfinished-admission barriers remain unchanged.

## Exact private event23 and fingerprint

Candidate schema: `operations-whole-scope-product-export-grant-event.v1`. This private event contains only disclosure metadata and actual full canonical membership; it has no projection, money, rate, source amount, Finance recipient or success/eligibility Boolean.

| Field | Actual origin/domain |
| --- | --- |
| schema_version | Exact candidate literal |
| event_id | Server-generated lower dashed UUID |
| organization_id | Actual authenticated actor's unique live Operations profile organization |
| economic_scope_id | Actual current canonical scope selected by command16 |
| revision | Actual previous grant revision+1, integer1..9007199254740991 |
| enabled | Exact command Boolean; immutable event value |
| actor_id | Actual authenticated auth.uid(), never caller field/service surrogate |
| created_at | Actual server clock, strict valid Gregorian UTC `YYYY-MM-DDTHH:mm:ss.SSSSSSZ` (six fractional digits); preserve all six digits |
| partner_version | Actual immutable server-maintained enrollment UUID resolved from command16 |
| destination_organization_id | Actual matching enrolled Finance organization UUID |
| destination_scope_id | Actual matching enrolled whole destination UUID |
| destination_mapping_id | Operator-declared Finance mapping event UUID from normalized command16 |
| destination_mapping_revision | Operator-declared safe positive mapping revision |
| destination_mapping_fingerprint | Operator-declared lower64hex mapping tuple fingerprint |
| scope_snapshot_id | Actual current immutable canonical membership snapshot UUID |
| scope_revision | Actual current membership revision, safe positive integer |
| membership_fingerprint | Actual saved canonical membership fingerprint, lower64hex |
| composition_snapshot_id | Actual current immutable composition snapshot UUID tied to the same scope snapshot |
| composition_revision | Actual current composition revision, safe positive integer |
| composition_fingerprint | Actual saved composition fingerprint, lower64hex |
| full_membership | Exact existing `operations-project-scope-membership-v1` document from actual scope snapshot; integration_state=membership_only/economic_mapping=unavailable remain unchanged |
| command | Exact normalized command16, including actual operator reason/idempotency selectors |
| command_fingerprint | Exact existing command-purpose-array SHA256 lower64hex |

Fingerprint bytes: UTF8 compact canonical JSON of `["operations-whole-scope-product-export-grant-event-v1", exact_event23]`, no BOM/trailing LF. The event fingerprint is stored separately and excluded from event23 to avoid circular hashes. Use actual `operations_economy_private.canonical_json_v1`, with explicit integer-normalized command revisions and UUID-lower normalization; JSONB 1.0 must not generate different command bytes from the pure integer1 domain. Creation time is a server-rendered UTC six-digit string, not the session-dependent text conversion of timestamptz or JS millisecond truncation.

The eventual pure helper would validate/canonicalize these **metadata values only** and cross-check all command/event pairs, revision=expected_grant_revision+1, full membership organization, declared destination tuple, and command fingerprint. It must not validate actual auth/database liveness, claim a Finance mapping current, return authorized/verified, query a secret or manufacture a source receipt. Root must lock helper names/paths after this exact field review. A valid synthetic event vector is only encoding evidence, never an authentic grant.

Full membership validation must preserve its exact root/evidence/project/booking/relationship domains and full ordering; it is not reconstructed from invoice manifest, obligation count or project UUID resemblance. Existing14937 membership_fingerprint is SHA256 of UTF8 `operations_economy_private.canonical_json_v1(full_membership)`, with no purpose prefix/BOM/trailing LF; do not invent a new membership fingerprint. Array/string order uses UTF8 byte comparison to match SQL COLLATE C. A pure helper may recompute this structural fingerprint, while composition_fingerprint remains an opaque actual saved row reference checked against command/event tokens; the composition document is not embedded here. The event does not embed a new composition monetary body or treat membership_only as complete economic coverage.

Grant7 for product document22/proof18 is a projection of the actual immutable event: event_id, revision, event fingerprint, destination_organization_id, destination_scope_id, destination_mapping_id, destination_mapping_revision. It is not a separately writable object or mutable alias. Replacing a grant7 in a saved product row is forbidden; actual new product publication revision remains mandatory. Existing143348 rows retain constrained NULL grant/body until a separately approved writer successor exists.

## Actual operator, service and partner boundaries

A future authenticated public invoker calls a NEW private writer with real auth.uid() and existing `authorize_scope_read_nowait_v1` semantics: actual auth user row, unique profile organization and current admin role under SHARE NOWAIT. Do not switch JWT claims to impersonate the saved actor. Same-org admin project-grant bypass remains; full canonical+baseline project union must nevertheless contain only actual live same-org projects. The compatible entry's source/barrier/permission closure is required before event save; every additional privileged caller enters a reviewed installed successor graph.

A service/HMAC source read has no operator session. Its NEW private saved-actor check resolves actor_id only from the actual current saved grant event and checks that actor's actual auth/profile/current admin rows for captured organization under NOWAIT. No caller actor parameter, JWT mutation, service-admin surrogate or cached pure grant validation establishes this. Existing row-existence/admin semantics do not claim human GoTrue login, an invented banned-user rule or company disclosure policy. Actual complete source/project/root permission union is rechecked in the source transaction, independently of Finance recipients.

Proposed NEW partner enrollment is immutable-versioned metadata, defaultfalse, scoped to source organization/economic scope and destination Finance organization/whole scope plus exact whole-source purpose. Operator cannot INSERT/UPDATE it. Server config role can provision explicit identity and UPDATE(enabled) only; no rewrite/delete/truncate, no secret/endpoint in event23. Different key/partner version cannot reassign a permanent economic owner. Existing personnel/invoice/Catering component maps/routes cannot serve as whole enrollment.

The enrollment permits destination selection, not remote rights. Finance mapping tokens remain declarations: local equality against an operator-supplied token is not remote verification. The private declared destination_mapping_fingerprint is audit-only: locked grant7/body23/proof18 expose mapping ID/revision but not that declared fingerprint. Finance resolves its own actual immutable current mapping by ID/revision and checks full membership/rights; it cannot compare the private declaration from the signed packet. Do not call that declaration a remotely enforced fingerprint CAS. Such a precondition would require separately reviewed genuine provenance, not a fabricated attestation or an unapproved ABI extension. Finance separately checks its actual current entity/map/share/component bijection/live recipient on final admission. Secret/key rotation and transport routes remain separately reviewed; no event helper installs them.

## Proposed enable/disable/replay behavior

The following behavior is a candidate lock, requiring independent review before SQL:

- First event, whether enabled or disabled, requires an actually enabled matching partner enrollment and the independent grant-write gate. It permanently reserves source org/scope and destination org/whole scope to each other. Defaultfalse enrollment cannot be used to reserve a new owner.
- An enabled event or re-enable requires an actually enabled matching current selected partner version, current real operator permissions, complete current scope/composition hints and exact grant CAS. A different partner version is allowed only for the same permanent economic destination after actual server enrollment; it does not rotate ownership.
- An explicit disabled successor may retain the **same partner version and tuple captured by its current actual grant**, even if that partner has since been disabled. It still requires real current operator/admin/full known live permission union, independent grant-write gate, current scope/composition hints, exact previous grant CAS and permanent ownership. This supports recording a disable after partner revocation without temporarily re-enabling disclosure. It cannot select a disabled unrelated version or reserve a new owner.
- Partner/read-gate/key disablement independently blocks new source proofs regardless of the saved event's enabled value. It does not delete/zero an old Finance copy, and it need not wait for a new operator event to be recorded.
- A revoked operator or missing/deleted/foreign required project cannot execute a successor merely to bypass full authorization. Disclosure is already blocked by current checks. Server purpose/read/partner disablement is the fail-closed control if current capture conditions prevent an authenticated metadata event. A broader operator revocation-only API is not introduced here.
- Exact idempotent replay returns actual historical event/receipt facts with historical_only=true; never enables an old event, changes current head, replaces partner, releases ownership or produces a positive source proof. Current actor and available enrolled context must still be checked; missing/corrupt stored receipt/head fails closed. Changed normalized command or actor under same idempotency key rejects23505.
- Expected grant revision mismatch uses PT409 before writes; actual RR serialization conflicts stay40001. Source scope/composition advancement likewise rejects old hints. A failed command leaves no owner/event/head/receipt or partial partner mutation.

Disabled grant means **no new disclosure**, not withdrawal/retirement/cost rejection. Actual Finance historical copied money remains immutable received evidence. Immediate distributed remote revoke at Finance commit, withdrawal and successor ownership are not provided. Grant7/current proof must be checked against the current actual event, not a boolean copied in a prior service response.

## Concrete writer lock audit to finish before implementation

Proposed known-row plan follows existing product entry: actual auth/profile/admin SHARE NOWAIT → independent grant gate and immutable selected partner SHARE NOWAIT → immutable expected scope/composition hint discovery → sorted complete canonical+baseline live project SHARE NOWAIT and actual root/status/packing policy NOWAIT → TRY obligation-org and operations-economic-scope → explicit TRY absent-owner reservations → current scope/composition/grant-head NOWAIT and current source recapture through approved compatible entry. No blocking advisory lock or new late permission project is acquired. Any discovered union difference fails PT409.

Reservation keys, destination-owner uniqueness and head write-lock mode are not final: they require concrete source audit against canonical enrollment, manual baseline/policy, product143348, partner config and Finance-independent metadata writers. TRY prevents waits but does not refresh an RR snapshot or serialize legacy graph phantoms. A pure event helper or prior native snapshot gate cannot close this writer audit. Direct UPDATE to event enabled is forbidden; service enabled-column privilege belongs only to independent config, not immutable event authority.

Required separate native cases: two real first-owner contenders and actual Lock/TRY observations, same/different partner versions, disabled-then-recorded-disable, operator/project/partner/gate revoke in both real lock orders, actual wrong source/membership/composition/CAS, historical replay after revoke/head advance, RC denial/PGRST RR/40001, no direct service ledger writes, exact SQL event23→TS bytes/hash/grant7, and no original143348 NULL row rewrite or Finance ledger writes. All databases fresh named synthetic-only; no customer/provider data or production attest. Canonical partner/event SQL source, ACL/config/caller guards and actual native execution remain open.
