# Native Catering backlog reconciliation v1 — contract draft

Documentation-only; proposed interfaces and constants, not implemented authority. The independently reviewed proposal remains unchanged. Review this draft before any product code. Isolated ordered-v2 PostgreSQL/HTTP proofs do not prove backlog support.

## Pinned protocol basis

| Repository / exact source | Required preserved behavior |
| --- | --- |
| Operations `b4272d1d0255034633c618d5728f72b83b1835e6`, `supabase/functions/_shared/catering-allocation-finance-proof.ts` | Original seven-line v2 signing message; `v2=` HMAC-SHA256; strict original 13-field receipt; accepted current=applied=requested, replayed current≥applied=requested, stale current=applied>requested. |
| Same Operations source, `_shared/catering-project-reassignment.ts` and migration `20261002044059_operations_catering_allocation_authority_v2.sql` | Existing scalar canonical hash, native cost exclusions, immutable 26-field event, map-before-stream lock order, disabled historical native map, future producer lineage guard. |
| Same Operations source, migrations `20261002052437_operations_catering_allocation_delivery_v2.sql` and `20261002062550_operations_catering_allocation_dispatch_v2.sql` | Original 19-field immutable captured body; current map/event claim; 60-second lease; delivered-predecessor hint and explicit unsupported backlog. |
| Finance `0bad515303782124a677e25822746eccbf355978`, `_shared/operations-catering-allocation-transport.ts` | Strict signature scope, ten-digit Unix timestamp, 120-second signature skew, constant-time signature comparison; no v1/personnel purpose substitution. |
| Same Finance source, migrations `20261002024010_operations_catering_validating_copy_v1.sql`, `20261002052036_operations_catering_allocation_contract_v2.sql`, `20261002061347_operations_catering_allocation_receiver_v2.sql` | Exact shared economic-stream advisory barrier, Finance-own accepted predecessor, consecutive allocation adoption, immutable accepted snapshot/head, unchanged byte replay, rolled-back denied nonce. |

The draft adds a separate reconciliation purpose and authority. It does not modify any of these functions, migrate an old native map to enabled, weaken the old receiver or claim that Operations queue state is Finance acceptance.

## Hash grammar and fixed commitments

`C(o)` is the existing compact scalar-object canonical grammar: exact documented keys; ASCII snake_case keys sorted lexicographically (PostgreSQL `COLLATE "C"`, JS `.sort()`); compact JSON with no whitespace separators; UTF-8. Values are strings, null, booleans or safe integers in `[-9007199254740991,9007199254740991]`; reject arrays/objects, fractional/exponential numeric spellings, NaN, infinities, negative-zero input, missing/unknown keys, NUL and unpaired surrogates. Contract revisions are positive except explicitly permitted initial allocation revision 0. UUIDs and SHA256 are lower-case canonical strings. JSON encoding preserves Unicode, escapes quotes/backslash/control characters like `JSON.stringify`, and does not normalize Unicode. U+2028/U+2029 remain literal UTF-8. Reject duplicate JSON keys before accepting raw protocol input; do not rely on JSONB/JSON.parse's last-key behavior.

For **new** commitments only:

`H(domain,o) = lowerhex(SHA256(UTF8(domain + LF + C(o))))`.

Every domain below is a literal ASCII string. Prefix is exactly one LF, with no trailing LF after the object. Existing event/cost fingerprints remain their existing unprefixed SHA256 algorithm. Original request/raw-body hashes remain SHA256 of their original exact UTF-8 bytes. Never hash PostgreSQL `jsonb::text` as a substitute for compact scalar canonical bytes.

| Commitment | Literal domain / exact scalar keys |
| --- | --- |
| Finance cursor, ten keys | `eventflow.catering.reconciliation.cursor.v1`: `schema_version`, `cursor_id`, `operations_organization_id`, `finance_organization_id`, `source_stream_id`, `snapshot_id`, `publication_revision`, `allocation_event_id`, `allocation_revision`, `snapshot_body_sha256`. Only event ID is nullable, with revision 0 for a v1 cursor. |
| Captured Finance map, six keys | `eventflow.catering.reconciliation.map.v1`: original `mapping_id`, `mapping_revision`, `source_project_id`, `source_obligation_id`, `destination_project_id`, `currency`. |
| Child map set, two keys | `eventflow.catering.reconciliation.mapset.v1`: `current_map_sha256`, `retirement_map_sha256`. Retirement is null for a non-adoption source update; adoption requires original old and new maps. Array/order is never silently sorted into authority. |
| Step, nineteen keys | `eventflow.catering.reconciliation.step.v1`: `index`, `publication_revision`, `allocation_revision`, `event_id`, `event_fingerprint`, `source_outbox_id`, `source_observation_id`, `source_mapping_id`, `source_entry_version`, `source_cost_fingerprint`, `raw_entry_sha256`, `raw_review_sha256`, `delivery_body_sha256`, `previous_body_sha256`, `previous_publication_revision`, `route_id`, `route_revision`, `key_id`, `destination_capabilities_sha256`. Review hash alone is nullable. Cost fingerprint hashes the supplied current native snapshot with the original five exclusions; it never computes cost. |
| History seed, two keys | `eventflow.catering.reconciliation.history.v1`: `cursor_sha256`, `step_count`. |
| History link, three keys | `eventflow.catering.reconciliation.link.v1`: `index`, `previous_link_sha256`, `step_sha256`. |
| Preview, fourteen keys | `eventflow.catering.reconciliation.preview.v1`: `schema_version`, `organization_id`, `destination_organization_id`, `source_stream_id`, `cursor_sha256`, `history_root_sha256`, `step_count`, `latest_publication_revision`, `latest_allocation_revision`, `latest_event_id`, `latest_observation_id`, `latest_mapping_id`, `latest_body_sha256`, `route_id`. |
| Permit, twenty-two keys | `eventflow.catering.reconciliation.permit.v1`: `schema_version`, `permit_id`, `organization_id`, `destination_organization_id`, `source_stream_id`, `actor_system_user_id`, `idempotency_key`, `reason`, `created_at`, `expires_at`, `cursor_sha256`, `preview_sha256`, `history_root_sha256`, `step_count`, `expected_publication_revision`, `expected_allocation_revision`, `expected_event_id`, `expected_observation_id`, `expected_mapping_id`, `route_id`, `route_revision`, `key_id`. |

Reason and idempotency key retain the current command grammar: 3..1000 and 12..200 Unicode scalar characters respectively, no leading/trailing ECMAScript trim whitespace, strict string types and no truncation. SQL uses the existing explicit Unicode trim character set; JS counts `Array.from(text).length`, not UTF-16 code units.

History seed is `h0`. In actual ascending publication order, indices are 1..N and `hi=H(link,{index:i,previous_link_sha256:h(i-1),step_sha256:si})`. The preview binds `hN`. First step revision equals cursor revision+1; every later step increments publication revision exactly once and binds the previous child's original body hash. A newly adopted event increments allocation revision exactly once, and its base publication must be the actual preceding Finance snapshot. A genuine source update retains adopted event identity and advances native version/observation; it does not change the event's original source-cost fingerprint.

Raw body bytes, embedded native snapshot/event, six-field maps and original outbox identities must match these scalar commitments. Hash equality alone never proves authority, source existence or Finance acceptance.

## Exact command and schema literals

The authenticated permit command is an object with exactly these twelve fields; additional/missing keys and wrong primitive types fail before lookups. Actor, organization, recipient, route, money and expiry are not client-authorized selectors.

| Field | Exact type / selector |
| --- | --- |
| `schema_version` | String literal `operations-catering-reconciliation-command.v1`. |
| `source_stream_id` | Canonical string `catering:<native-org-lowercase-UUID>:<entry-lowercase-UUID>`, same enrolled stream as cursor/preview. |
| `expected_publication_revision` | Positive safe integer, equal current actual Operations stream revision. |
| `expected_allocation_revision` | Positive safe integer, equal latest actual Operations allocation head; backlog permit is unsupported before any allocation event exists. |
| `expected_event_id` | Lower-case UUID, equal latest actual allocation event. |
| `expected_observation_id` | Lower-case UUID, equal current publication's saved source observation. |
| `expected_mapping_id` | Lower-case UUID, equal latest enabled derived native map. |
| `finance_cursor_id` | Lower-case UUID, equal server-saved dedicated Finance cursor proof ID. |
| `finance_cursor_sha256` | Lower-case 64-hex hash of the exact ten-field cursor with the cursor domain. |
| `preview_sha256` | Lower-case 64-hex hash of the resolved fourteen-field preview; re-resolve complete history under local locks. |
| `idempotency_key` | Exact untrimmed string, 12..200 Unicode scalar characters with preserved current trim constraints. |
| `reason` | Exact untrimmed string, 3..1000 Unicode scalar characters with preserved current trim constraints. |

Fix schema values separately from hash domains: cursor `operations-catering-reconciliation-cursor.v1`; preview `operations-catering-reconciliation-preview.v1`; permit `operations-catering-reconciliation-permit.v1`; command as above; outer delivery `operations-catering-reconciliation-delivery.v1`. The four-field cursor proof wraps the exact cursor and has no fifth schema key; its dedicated signature message supplies `operations-catering-reconciliation-cursor-proof.v1`. Step descriptors, history seed/link and map/mapset do not carry schema keys: their exact domain and fixed key set identify the contract. Embedded native event/snapshot/delivery retain original v2/v1 schema values without normalization.

## Wire bytes and dedicated signatures

The private reconciliation envelope has exactly seven keys: `schema_version`, `permit`, `permit_sha256`, `preview`, `cursor_proof`, `steps`, `history_root_sha256`. Schema is `operations-catering-reconciliation-delivery.v1`. Permit and preview use the exact flat objects above. Cursor proof has exactly four keys `cursor`, `cursor_sha256`, `issued_at`, `expires_at`; its cursor is the ten-field object. Each ordered step has exactly three keys `descriptor`, `step_sha256`, `delivery_raw_body`; the last is the actual original 19-field child JSON body **as a string**. Parse and validate each captured child separately; never regenerate already captured child bytes. This outer envelope's exact initial bytes are persisted and reused; JSON object order/spacing is not regenerated on retry.

New reconciliation endpoint purpose `operations-catering-backlog-reconciliation-receive`, signature prefix `reconcile-v1=`. Message is the exact LF join of `POST`, purpose, `operations-catering-reconciliation-delivery.v1`, key ID, ten-digit Unix timestamp, nonce, entire outer raw body. HMAC-SHA256 key is dedicated, at least 32 UTF-8 bytes; key ID `[A-Za-z0-9_-]{4,64}`, nonce `[A-Za-z0-9_-]{16,128}`. Signature skew is ≤120 seconds, including the boundary; signing timestamp does not extend permit expiry.

Cursor-read uses a different key and purpose `operations-catering-backlog-cursor-read`, schema `operations-catering-reconciliation-cursor-request.v1`, prefix `cursor-v1=` and the same seven-line structure. The response proof is authenticated over exact response bytes by the enrolled Finance cursor key; explicitly specify a response message `RESPONSE`, cursor-read purpose, `operations-catering-reconciliation-cursor-proof.v1`, key ID, response timestamp, request nonce, exact four-field proof raw body. A response signature cannot authorize a reconciliation request. No browser/service JWT or payroll/personnel/v1/v2 key is forwarded to the peer endpoint.

Initial limit is eight steps and 262144 total UTF-8 request bytes, including child-string escaping. Exceeding either blocks recovery; no truncation or automatic paging. New receipt limit is 16384 bytes. Preserve bounded chunks (4096 maximum including empty chunks), monotonic checks before/after every await/decode/parse, 15-second whole fetch/body boundary, expiry-before-abort, cancellation without waiting, redirect:error, fixed private errors. Dedicated SQL statement budget ≤12 seconds and lock timeout ≤3 seconds must fit inside that boundary; test abort-ignoring streams and commit-after-network-loss.

## Clock, expiry and retry contract

| Evidence/action | Proposed precise validity |
| --- | --- |
| Cursor proof | Server-issued UTC timestamp with six fractional digits and `Z`; `expires_at=issued_at+60 seconds`. Must be unexpired when administrator creates permit. Finance still resolves its own actual cursor under the shared stream lock at acceptance. |
| Permit | New server timestamps use the same fixed UTC text. `expires_at=created_at+300 seconds`; never renewed in place. Fresh claim requires at least 20 seconds remaining and current actor, gates, mapping, route and exact latest tuple. |
| Attempt lease | Original 60-second lease ceiling; new reconciliation expiry is `min(claim_time+60 seconds,permit.expires_at)`. A lease never extends the permit. Immutable claim owner/token and body hash required at finish. |
| Receiver fresh acceptance | Dedicated enrollment/auth checks, then expiry using `clock_timestamp()` under actual locks; check again immediately before inserting final accepted batch/receipt. Cached transaction `now()` alone cannot prove current expiry after a lock wait. |
| Expired uncommitted permit | No append, no new lease, no head/nonce/receipt mutation. New authenticated preview/permit required. |
| Already committed exact body | Under still-enabled enrolled key/org/receiver gate, return actual saved receipt/snapshot history with a fresh nonce; expired permit or later source change grants no fresh append. No head restoration or mutable recipient lookup. |
| Expired unknown-ACK attempt | Separately protected lookup resolves Finance's own saved acceptance by exact permit/raw hash. If found, save reconciliation receipt evidence only; if absent, do not infer success. It never marks an ordinary v2 queue delivered. |

The cursor proof must have exactly its declared 60-second duration, a valid calendar timestamp, and no issued-at value more than the allowed 120-second clock skew in the future. Ops and Finance compare their own server clocks; a deployment with incompatible clock skew blocks fresh recovery rather than renewing a proof.

Authenticated permit-command idempotency is scoped to actual organization and key: exact same 12-field command returns the original immutable permit/result; changed command is a conflict. A replay never regenerates its ID/timestamps/body or extends expiry. A new expired/uncommitted recovery requires a fresh cursor, preview and distinct idempotency key.

Only new cursor/permit timestamps have the fixed format. Preserve all original historical event/native timestamp strings byte-for-byte, including `+00:00` and fractional precision; never normalize their hash input.

Fresh nonce collision returns permission failure and does not append another receipt. A retry uses a new nonce and identical immutable body. Denied mapping, permission, cursor, expiry or invalid final step rolls back every tentative snapshot, event/head, nonce and receipt. An exact saved result returns replayed; same permit ID with different raw bytes or preview hash is an integrity conflict. An unsaved batch with stale Finance cursor is **denied**, not accepted as a synthetic stale receipt.

The new reconciliation receipt keeps exactly the original 13 field names but schema `operations-catering-reconciliation-receipt.v1`. Accepted has requested=applied=current=approved latest revision; request hash is outer raw SHA; snapshot fingerprint is final child raw SHA. Those hashes generally differ. Replayed retains original requested/applied and both hashes, with current≥applied. Every acknowledgement is checked against the actual private Finance receipt's all 13 primitive fields, actual final snapshot FK/hash, actual accepted-batch history root and current snapshot revision. Only the separate real ordinary-v2 replay uses unchanged schema `operations-catering-receipt.v2` and then original lease finish.

## Authoritative transactions and concurrency

Operations authenticated permit creation uses real `auth.uid()`, unique same-org profile and live admin authority. It checks exact current source/target projects and active time-basis obligation/currency/revision, actual source enrollment, captured Finance capabilities, latest native map **enabled**, then obtains mapping-before-stream/allocation-head locks and rechecks every expected tuple. Earlier native maps stay disabled and are checked only as original immutable provenance. Every historical Finance retirement map and original route/key must still be enabled; a permit cannot replace revoked capabilities.

Finance order is enrollment/gates/native scope SHARE → dedicated nonce advisory barrier → exact existing `operations-catering-copy:<Ops-org>:<stream>` advisory barrier → adopted head/maps/real projects. Resolve Finance's own accepted predecessor and cursor under that barrier. Validate all child steps and apply consecutive events in one transaction; each step references the actual Finance predecessor inserted by the previous step. Only final current projection becomes visible after commit. No trigger disabling, direct service snapshot write grant, old-map reactivation, official posting, rate multiplication or baseline/EAC transfer.

Both database boundaries remain independent. Permission is checked at Operations locked claim and Finance locked acceptance; an already authorized request may remain in flight after a later Operations revocation/advance. Its actual accepted receipt proves history, not current Operations authority. New dispatch/admission must recheck latest state; instantaneous cross-database cancellation is unsupported. Test this interleaving explicitly.

Required native orderings: producer first versus permit/claim first; allocation first versus permit/claim first; v1/v2 receiver first versus reconciliation first; two identical fresh batches; two different cursors for same stream; role/map/gate revocation first versus authorized claim first. Observe actual `pg_blocking_pids`, bounded waits, post-wait stale/permission results and rollback. No repeated HTTP calls labelled atomic, no mock Finance predecessor and no PGlite concurrency claim.

## Admission and direct-call barrier

A cursor-read request has exactly four fields `schema_version`, `operations_organization_id`, `finance_organization_id`, `source_stream_id`; both organizations must match dedicated enrollment. The nonce is persisted in its separate read namespace; the proof is an expiring observation of Finance state, never a write permit.

A new enabled admission policy applies to **all fresh allocation events**, including direct calls to the original public RPC and ordinary service/owner DML attempts without valid admission, plus adopted head advances. The database schema owner remains trusted as explained below; this is not a claim of resistance to privileged identity/proof fabrication. A new authenticated wrapper checks an actual signed Finance cursor for the exact latest publication, then map-before-stream/head locks and rechecks local latest tuple, source enrollment, projects/obligation and admin authority. Receipt eligibility has two explicit branches:

- **First allocation (no local/adopted allocation head):** Finance cursor event is null and allocation revision is 0; its exact own accepted snapshot is schema `operations-catering-delivery.v1`. Require the ordinary v1 queue for that same current base publication to be delivered and its actual strict `operations-catering-receipt.v1` to resolve the Finance saved receipt/snapshot/current cursor. The incoming original allocation command expects revision 0. A v2 queue is neither required nor invented.
- **Subsequent allocation:** Finance cursor and local head identify the same existing event/allocation revision, same exact latest publication and native observation/body. Require the actual ordinary v2 delivered queue and its real strict `operations-catering-receipt.v2`, including all 13 fields and Finance receipt/snapshot/current cursor proof. After reconciliation this exists only following the real current-body v2 replay and lease finish.

Neither queue branch substitutes for the newly resolved Finance-own cursor. A signed receipt for another source version/stream/tenant or a locally marked-delivered queue is insufficient. Source advance between read and locks returns stale, with no event.

The wrapper inserts a private immutable admission record in the same transaction, tied to a unique command/event ID, exact base publication/native map/head/cursor hash/real ordinary receipt and actor. The original command generates its own event UUID internally. Therefore the admission is prebound to exact organization/command-idempotency-key, actor, base tuple and expected next allocation/publication revisions, rather than a caller-selected event UUID. A fresh event INSERT trigger locks and consumes that exact server-issued admission once and binds its actual `NEW.event_id`; a deferred constraint validates the created event, next map and publication. A second event or a mismatched generated document cannot reuse the admission. A head guard requires the corresponding admitted event and strict next authority. No transaction-local user GUC, caller-supplied actor, receipt JSON, current target pair alone or blanket service role can substitute for the private row. Table privileges revoke PUBLIC/anon/authenticated/service_role writes; only a narrow empty-search-path definer owning the authenticated checks can create admission. The admission table has its own INSERT/consume integrity triggers: verify schema/key counts, exact live actor `auth.uid()` and unambiguous tenant/admin resolution, actual current base publication/head/map/enrollment/projects/time-basis obligation, server-saved verified Finance cursor and actual receipt reference, exact command hash, prospective revision and one-use relationship. Consumption may only bind the generated event identity once; deferred checks bind actual event/next-map/publication. Guard UPDATE/DELETE/TRUNCATE of immutable admission fields. A service insert with null authenticated actor and an owner standalone insert lacking these exact integrity facts must fail; there is no caller GUC saying “admission authorized.”

**Trust boundary:** these checks defend application roles and ordinary direct DML against missing/malformed admission. An intentionally malicious schema owner can forge `request.jwt.claim.*`, rewrite private verified-proof cache rows or functions, or disable triggers; REVOKE and ordinary PostgreSQL triggers cannot make that owner untrusted. Such deliberate privileged identity/proof/DDL fabrication is outside this application threat model and requires deployment access controls. Do not claim a native owner test proves immunity to it. Required direct-owner tests cover missing admission, malformed tenant/base/provenance, expired proof, duplicate consumption and head/event mismatch under active guards, without impersonating an authenticated administrator or manufacturing verified proof-cache rows. Valid-authority owner execution is trusted database administration, not an independent application authorization path.

Original exact saved command replay is historical and must not consume a new admission or advance head. Gate-disabled fixtures can continue testing the old isolated contract, but activation must reject disabling admission enforcement while transport is enabled. The policy cannot be disabled to bypass a blocked backlog. Permit creation and active unresolved reconciliation block fresh allocation admission; genuine source publication continues and invalidates an outdated fresh permit rather than erasing evidence.

Return-to-v2 is a separate permission-checked current capture tied to the accepted reconciliation body and latest tuple. It copies the exact final child bytes into the original outbox-bound queue if absent, rejects any conflicting old capture, and obtains a real current-event/enabled-map claim. Actual Finance v2 byte replay produces original 13-field receipt; original finish records delivered under real lease. Only afterward can the next admitted allocation use delivered predecessor eligibility. Historic pending queues gain a separate immutable reconciled-resolution link, not fabricated delivered status.

## Serialization control vectors and proof limits

The following new-domain vectors are **serialization controls**, not native source, money, permit or acceptance fixtures. Python UTF-8/SHA256 and Deno `JSON.stringify`/WebCrypto independently produce the listed digests. No new SQL implementation exists yet, so native SQL parity remains mandatory before source freeze.

Domain for both: `eventflow.catering.reconciliation.scalar-control.v1`; prepend that literal and one LF to the compact object below.

```json
{"enabled":true,"issued_at":"2026-10-02T00:00:00.123456Z","reason":"Flytta kostnad – kök \"A\"\nprojekt B","review":null,"revision":3}
```

UTF-8 prefixed length 189; SHA256 `57cc592109395598a16d4d98d701af6fd390ba9165180192e98fb4b78a71be92`.

```json
{"amount_minor":null,"created_at":"2026-10-02T00:00:00.123456+00:00","hourly_rate_minor":null,"source_review_fingerprint":null,"source_status":"pending"}
```

UTF-8 prefixed length 205; SHA256 `34246453413e704cc50fbf43378b187f030ec1f42309154b0d02f727493701e4`.

Existing deterministic Operations-generated isolated authority controls passed through the actual-schema SQL parity fixture (synthetic fixture identities, not provider data) remain the prerequisite parity baseline:

| Vector | Existing event hash / compact UTF-8 bytes | Existing current cost hash / bytes |
| --- | --- | --- |
| Operations-generated control with Unicode/quoted multiline reason and null review | `af72a07da37d4f803c946d1b42608ca0f2ef0e02b3324fb60757e06b1fe60f7a` / 1376 | `e3dcc99463e8fe8749f62c321ef0ed2654f221b140c50e3aa2eb0ac16cc9d7fd` / 802 |
| Operations-generated missing-price control | `7c7921f11f4cefb8ebe201fbdcfdff25c4472ebaaf583044865e3b9dbb1f48c9` / 1376 | `c6f46c5b19515faa4dbeb9bb153f1953cad7324a65a5fde4ce19e1a409ac404f` / 786 |

The reproducible controls are built by `scripts/project-economy/catering-allocation-fixture.ts` and `_shared/catering-project-reassignment.ts` (complete and missing-rate variants). These were rehashed from the preserved controls used by `scripts/project-economy/catering-allocation-hash-parity-postgres-test.sql` and matched their saved fingerprints; that fixture explicitly labels them serializer controls, not authenticated/native source proof. They do not prove the new domains, authorization, chronology or concurrency. Future native vectors must additionally cover every exact object above, reordering/omission/unknown keys, duplicate wire keys, U+2028/non-BMP scalars, null review/rate/amount, maximum integer, negative zero, historical timestamp text, changed step order/previous hash, one changed route/map, and full SQL→Operations→Finance parity.

## Implementation review gates

Review this draft's exact shapes, sign/response purpose, token lifetimes and in-flight authorization semantics first. Then separately authorize disjoint implementation. Required evidence is full chained schema and existing v1/v2 invariants, exact vector parity, authenticated direct-RPC/owner-write admission denial, native rollback/concurrency/expiry, genuine source→Operations→Finance ordered reconciliation HTTPS, actual all-13 receipt and snapshot proof, real return-to-v2 lease finish, unchanged official/billing/baseline tables, and protected redacted operator reconciliation UI. Default-off until these gates and policy decisions pass. No arbitrary-backlog activation follows from this document.
