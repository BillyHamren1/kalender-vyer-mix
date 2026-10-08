# Next private held-permit contract v1

Status: documentation-only candidate. This document does not issue a permit, prove positive eligibility, authorize a sender, replace a guard or activate a module. The existing `require_verified_original_receipt_v1` unconditional42501, `resolve_permit_v1`, permit/capture INSERT guards and public admitted allocator remain unchanged. The source-approved inventory85 branch still requires actual native acceptance. Any next implementation needs a separate ownership/source review.

## Exact source audit

Actual structured Git reads were checked against recomputed Git blob SHA1 before this audit. Operations source is `d8265818c9a8012539657460a377993dacdce8e6`; all five audited SQL files also match actual current `aa8f1895f69ba258fca4b0a7004bb3319f494d5a` byte-for-byte. Its historical112625 and held135138 bytes match the independently fetched published `d5cb82a485f1c555d97d214274b1533408331dd9`. Finance source is `cffd19bc95c8d51ad6e91220f63585a434241ae0`; the two getters below were independently fetched at immutable `fcc4c6510d129905dcb0722982db9b93d64127f7` and match actual CFFD byte-for-byte. This is source evidence, not hosted state, native execution or an enrollment assertion.

| Source file | Actual blob SHA1 | Scope relevant here |
| --- | --- | --- |
| Operations101049 admission | `968b6cd3af1b426a26e544930cb025fef7384615` | Exact12 permit command; policies/barriers; original hard42501 |
| Operations120804 receipt cache | `e09e0271ac251b378b861e66ee2608d2b09f3f9d` | Independently signed original13; immutable actual-TX receipt selection |
| Operations125625 held eligibility | `dcaf10d2c1a06fdedddeb74f87463b8c9a5ee4a8` | Actual admin before collection; frozen delivered/source/all13 predicates |
| Operations112625 historical capture | `23f280170c1efc12f223eb3154c2a12df0a80900` | Original19/history/route selection; unavailable permit/INSERT path |
| Operations135138 held inventory | `8f630a821f05d48938aba1ece8c4bba7bdd40041` | Early exact current candidate-set check; private inventory only |
| Finance94331 core | `645035c2345905201b96c0d5493d87830af15301` | Own cursor/receipt; shared stream; atomic final-only copy |
| Finance115645 original-receipt getter | `e203da8974c616cede157e8484d880765559aa4f` | Actual saved original13; request-bound signed lookup; no cursor renewal |

The implementation constraint is concrete: the original `resolve_permit_v1` calls unavailable `inventory_v1`; existing permit INSERT independently calls that original resolver, and capture INSERT reenters it. Calling private `inventory_held_v1` does not make these writers usable. A future private builder may be reviewed as a separate read-only candidate constructor. Persisting a usable permit would require a separately approved additive authority/storage design; this document neither substitutes the held predicate into old guards nor authorizes a new bypass table.

## Exact input and unchanged output contracts

The proposed private operation must reuse original exact12 `operations-catering-reconciliation-command.v1`, with no caller prices, receipt JSON, route selection or verified flag:

| Key | Exact constraint |
| --- | --- |
| `schema_version` | `operations-catering-reconciliation-command.v1` |
| `source_stream_id` | Actual lowercase `catering:<native-org UUID>:<entry UUID>` |
| `expected_publication_revision`, `expected_allocation_revision` | Positive safe integers, exact current immutable source/head CAS |
| `expected_event_id`, `expected_observation_id`, `expected_mapping_id` | Lowercase UUID strings, actual latest saved selectors |
| `finance_cursor_id` | Lowercase UUID of actual independently verified remote cursor |
| `finance_cursor_sha256`, `preview_sha256` | Lowercase64hex commitments, exact current saved proof/inventory |
| `idempotency_key` | ECMAScript-trimmed text,12–200 characters |
| `reason` | ECMAScript-trimmed text,3–1000 characters |

Preserve existing cursor10/proof4, preview14, permit22, flat step19 and original delivery19/native25/authority26. The proposed permit candidate keeps `operations-catering-reconciliation-permit.v1`; outer delivery keeps exact7 `operations-catering-reconciliation-delivery.v1`. Existing eight hash domains, ASCII key ordering, compact canonical JSON, strict safe integer lexical rules, Unicode/quoted/multiline text and microsecond timestamp text remain unchanged. Original captured raw19 is reused byte-exact; a missing queue's server-derived19 is explicitly new capture provenance, never an ordinary queue or delivered ACK.

## Transaction-owned authority sequence

Fresh work starts with the existing actual authenticated admin/organization authorization before receipt collection. The early collector locks that live admin scope and the complete bounded actual cursor/cache/key selection. Its immutable hold must belong to the same transaction ID, actor, cursor/hash and both organizations. Revalidate the complete current candidate IDs/keys with the existing nonlocking selector before any policy, project, obligation, map, stream or head locks. A newly appearing candidate produces a conflict; no caller list/GUC or late new-key acquisition is allowed.

Then use the unchanged `inventory_held_v1` ordering and frozen historical eligibility predicate. Preserve the early route/outbox/queue selection hold, complete sorted project union before obligation, native mapping before stream/head, and exact latest hint/selection rechecks after waits. No new lock ordering is implied by this draft. A future constructor's idempotency barrier must be designed and reviewed against these actual entry paths before any write; adding an unreviewed early/late advisory lock is not permitted by this document.

The genuine local delivered ordinary13 must match independently signed Finance-own original13 in every primitive field, including receipt UUID, snapshot FK, raw body SHA, source/destination organization, stream and revisions. Initial adoption uses the explicitly supported v1 cursor allocation0/null-event branch and genuine delivered v1 receipt; later adoption uses the actual v2 accepted predecessor. A cursor body hash alone never authenticates a locally supplied receipt UUID. A newer same-body replay receipt mismatch is blocked; selecting an older receipt to force equality is forbidden.

Rebuild the complete contiguous1–8-step original publication/event/observation/outbox history from that accepted cursor. Lock the specific original routes/keys and durable event Finance capabilities selected by server-owned inventory, including absent-queue selection. Historical Operations maps remain disabled. Current native worker binding/map/project and actual time-basis obligation/currency/revision must be live and exact. Finance project eligibility uses only the exact existing ID/organization/currency predicate from its frozen receivers; no deleted flag or new archival rule is invented. Original/current retirement Finance maps and routes remain enabled and same-recipient; cross-organization transfer remains blocked. Preserve raw source/review, historical rate, minutes and Operations supplied amount; neither module recalculates source cost or transfers baseline/EAC policy.

The current Finance receiver independently owns its accepted predecessor. An Operations delivered ACK or historical queue is eligibility evidence only. Finance retains the canonical new reconciliation permission locks → all sorted original enrollments/gates → native scopes → nonce → shared economic-stream advisory → adopted head/maps/projects. Atomic child application advances only the final current copy and retains every immutable child. Failure rolls back all children, nonce, cursor/head/current changes and receipts.

## Freshness, retries and revocation

A fresh private candidate requires actual current cursor/key/gate/admin/source/route/capabilities at every post-wait barrier. Use server time and existing microsecond timestamp representation. Cursor lifetime remains60seconds, HMAC timestamp skew120seconds, inventory deadline12seconds, steps≤8 and outer raw body≤256KiB. Candidate permit UUID and creation time must be generated inside the reviewed server constructor after held authorization/CAS, never accepted as caller command fields. Creation must satisfy the original server transaction/clock predicates; its expiry is exactly creation+300seconds. No constructor extends the cursor or hides missing price as zero. If a required amount is unavailable, preserve null and original source coverage; this proposed constructor supplies no calculation.

There is presently no supported persisted idempotent private permit. A future design must durably bind organization, actor, idempotency key, exact unchanged canonical command bytes/hash, held cursor/preview/history, original route versions and final tuple. Use the actual existing admission convention: command bytes are UTF8 of `operations_catering_private.canonical_source_json_v1(validated_command12)` and the command commitment is plain SHA256 of those bytes, without adding a ninth domain. Key-order/JSON whitespace differences representing the same validated command share this identity; changed field values, actor or tenant conflict. Preserve supplied raw command separately as declared input provenance if needed; it never overrides canonical identity. Same key/different command conflicts. A rolled-back candidate consumes no key or receipt authority. A saved candidate replay proves only immutable provenance, not current dispatch permission; fresh dispatch requires live rights/current lineage. Expired uncommitted work is denied. Committed Finance acceptance may replay historically, but final adoption still requires current signed acceptance/cursor, live final scope and exact saved final19.

Revocation before commitment must deny and roll back fresh work. Cache key/gate/admin, original route/capability, native worker/map/project/obligation and policy changes need queued-writer native tests; a source-approved lock order does not prove these races. Revocation after accepted commitment may not erase history or redirect it. No automatic old-map reactivation or old-estimate resurrection is permitted.

After actual atomic Finance acceptance, final-current-only recovery must independently authenticate dedicated reconciliation RESPONSE signature/purpose/key/request context and exact frozen13 saved receipt/permit/outerSHA/final snapshot/capture. Later Finance currentness blocks adoption. Only the real unchanged v2 prepare/adoption, claim, byte-exact saved receiver replay, actual ordinary13 comparison and lease-token finish restore normal delivery. Dedicated reconciliation13 is never relabeled ordinary13, and no ACK/status is seeded. Lease remains≤60seconds; a lost lease never authorizes finish.

## Finite failure modes and required proof

| Failure | Required behavior |
| --- | --- |
| Wrong12 keys/types/lexical numbers/hash/text |22023; no hold-derived permit or mutation |
| No live actual actor/admin/tenant or disabled key/gate/capability |42501; deny fresh authority |
| Local all13 differs from signed own13, including UUID |42501; do not select older remote receipt |
| New candidate key/cache, changed preview/current source/selection |PT409; fresh read/retry, no late permission lock |
| Missing/gapped/too-many/oversize history or unrelated route/source |Deny bounded whole operation; no partial manifest |
| Cursor expired/future or deadline reached after wait |42501; no renewal or partial commit |
| Idempotency key reused with different command |Conflict; preserve original immutable candidate/authority |
| Existing hardstub or permit/capture INSERT |Still42501; no positive private candidate is claimed persisted |
| Any child application or actual predecessor failure |Rollback entire Finance batch and nonce |
| Lost ACK |Historical genuine receipt replay; current rights checked separately |
| Later Finance current revision, revoked final mapping or lost lease |Block final adoption/finish; preserve saved history |

Source/parity controls alone are insufficient. Required next evidence is actual native85 inventory acceptance first, followed by independently reviewed private constructor vectors and real native queued admin/key/policy/route/project/obligation writers in both relevant lock directions; exact SQL→Operations→Finance hash/Unicode/microsecond vectors; genuinely absent queue; expiry after wait; same-command retry/conflicting retry; every rollback invariant; genuine protected HTTPS acceptance/final-only current copy and real ordinary13/lease recovery. Official13 tables, billing/provider/source writers, immutable original outboxes and old maps must remain unchanged. No public API, hosted setting or module activation is inferred.

## Independent current harness audit

Catering source was read at exact `1f9cec05c1459eea83c677c6cc8f466d349b4e46`. Actual `run.sh` blob `be9cf00e1b98b6d1bf1f734f2b95a9b1e8fe57a1` sets only the outer `eventflow.project_economy_isolated_test` in `ops_sql`; line169 starts the companion receipt Operations seed without a `test.project_economy_isolated` prologue. Actual unchanged companion seed blob `debf0cd5f909c54fa06665a1406e3a9c03122eb5` requires that latter setting in its own SQL session. The narrow same-session prologue repairs fixture authorization while preserving the seed/outer guard.

Actual allocation journey blob `25717226747db56a510b3c83ded938327e223640` line426 unconditionally prints the new nonce status diagnostic before its unchanged successful-pair assertion. Actual original proof parser blob `fa6d41ae31aebb3ea2d24d6a35de6a332ddce779` requires exactly4 successful rows. An otherwise successful run now has5 rows. Emit that diagnostic only for the existing failed-pair condition; preserve actual concurrent requests, assertion and original strict4 success parser. These are source-grounded harness integration causes; they do not waive business assertions or prove positive inventory/permit execution.
