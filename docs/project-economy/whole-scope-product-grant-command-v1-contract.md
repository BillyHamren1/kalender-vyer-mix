# Product whole-scope export grant command16 — pure candidate

Status: NEW command encoding only. No grant/event/enrollment/endpoint or SQL writer exists from this slice. It never returns an authorization result, supplies source evidence, enables disclosure, removes product143348 NULL constraints or alters either Finance barrier. The parent-approved export/admission next-contract remains the broader design; this supplement fixes the first command domain for independent review.

Owned files: `supabase/functions/_shared/whole-scope-product-grant-command-v1.ts`, dedicated `.deno-test.ts`, and this document. Root owns eventual SQL/API/workflow/Git/schema lock. Current dependency is actual `20261002143348_operations_whole_scope_product_publication_v1.sql`; authorizers/compatible capture remain actual130228, not caller JSON. Finance independent destination/map/share/recipient authority remains94533. The isolated product snapshot native gate on bb95 is accepted only for its authored snapshot/NULL-export scope, not this absent grant writer.

## Exact command16

Schema literal: `operations-whole-scope-product-export-grant-command.v1`. No organization or actor field: actual source organization and actor must derive from authenticated live auth/profile/admin rows in the future writer.

| Field | Domain and meaning |
| --- | --- |
| schema_version | Exact schema literal |
| economic_scope_id | Strict dashed UUID, canonical lower case |
| partner_version | Strict dashed UUID of a NEW immutable server-maintained enrolled purpose/destination tuple; not a current mutable route alias |
| destination_organization_id | Explicit Finance organization, strict dashed UUID |
| destination_scope_id | Explicit whole Finance scope, strict dashed UUID; no component/alias inference |
| destination_mapping_id | Declared immutable Finance mapping event UUID |
| destination_mapping_revision | Safe positive integer1..9007199254740991 |
| destination_mapping_fingerprint | Declared lower64hex Finance immutable mapping tuple fingerprint |
| expected_scope_revision | Safe positive current canonical scope revision |
| expected_membership_fingerprint | Lower64hex existing canonical membership fingerprint |
| expected_composition_revision | Safe positive current composition revision |
| expected_composition_fingerprint | Lower64hex existing composition fingerprint |
| expected_grant_revision | Integer0..9007199254740990, allowing first0 and one safe next revision |
| enabled | Exact Boolean; false records an explicit disabled grant, never a zero cost |
| idempotency_key | Well-formed Unicode12..200 scalar values; no NUL/leading or trailing ECMAScript whitespace |
| reason | Well-formed Unicode3..1000 scalar values; no NUL/leading or trailing ECMAScript whitespace; interior quote/newline/Unicode preserved |

Only these own enumerable data fields are accepted. Extras, inherited custom prototypes, getters/setters, symbols, array roots, nonenumerable fields, UUID coercion/compact/brace spellings, malformed surrogate pairs, unsafe/noninteger numbers, negative zero and non-Boolean enablement are denied. Native data descriptors are snapshotted once; no caller property getter or mutable reread participates in encoding. A Proxy supplying primitive data descriptors is not authority: encoded output is a new frozen validated primitive record, without a caller iterator/toJSON/prototype. Functions must not be used as a raw JSON parser; lexical number spelling cannot be recovered from an already-created JavaScript number.

The helper emits compact command JSON with ASCII-lexicographic keys (fixed domain field names), no BOM/trailing LF. UUIDs normalize lower case before encoding; fingerprints remain strictly lower64hex. Maximum encoded command is16384 UTF8 bytes. Input is already a primitive object domain, not a raw request decoder. A later raw endpoint must preserve exact decimal/duplicate-key/UTF8/size semantics and actual SQL JSONB numeric comparisons; no generic `JSON.parse` rounding can authorize near-safe-limit fractions or nonzero underflow. SQL JSONB erases lexical negative zero; do not claim raw-number spelling parity from this object helper.

Command fingerprint bytes are UTF8 of the compact purpose array:

`["operations-whole-scope-product-export-grant-command-v1", exact_normalized_command16]`

No trailing LF/BOM. SHA256 lowercase hex is a metadata command fingerprint only. It is not the future grant-event fingerprint, proof signature, source capture fingerprint or source admission. Async hashing snapshots the canonical primitive string before await.

## Partner, mapping and actor boundaries for the future SQL

A NEW private immutable `partner_version` enrollment must bind purpose, actual source organization/economic scope and allowed Finance organization/whole scope. Defaultfalse; identity never rewrites, service enablement is column-only, no delete/truncate or semantic rebind. No Finance component map/personnel transport route constitutes whole enrollment. Grant command cannot create this operator/server enrollment or set a secret/route/key through reason/metadata. Key/route lifetime is independent of permanent economic ownership and of the command fingerprint.

`partner_version` must resolve an actually enabled row with exact tuple in the grant transaction. It restricts the requested disclosure destination; it does not attest current remote Finance membership/mapping. Declared Finance mapping ID/revision/fingerprint are operator-selected declarations, validated locally only for type and enrollment relationship. Genuine Finance `inspect_v1` and later atomic packet admission still independently check actual current entity/map/share/full correspondence and recipient rights. There is no invented remote read or preapproved recipient token in this helper.

Future authenticated writer proposal is a NEW public invoker → NEW private owner function, with RR metadata and actual RR/SERIALIZABLE guard. Its exact name, tables and grant-event canonical tuple are not locked by this pure slice. It must derive actual scope/composition snapshot IDs, full membership, actor/time and event ID from locked server state. First positive or disabled event permanently reserves source org/scope to destination org/scope; historical idempotent replay never reactivates current enablement. An event captures command16 and actual snapshot IDs/full membership/partner tuple/current event references; event fingerprint necessarily includes server-derived immutable facts and is separately specified before SQL.

Known hints are immutable rows selected by exact revisions/fingerprints. Preauthorize complete source-project plus baseline-project union and live root/policy identities with existing actual authorizers; same-org admin project-grant bypass is preserved while missing/deleted/foreign actual projects reject. Auth/profile/admin/project/root/gate/partner rows use SHARE NOWAIT. TRY organization/economic-scope reservations come after known permission hints; any changed/new permission project causes PT409 before late acquisition. Exact source/grant permanent-owner reservation key/order, current grant-head NOWAIT and absent-owner contention must receive concrete writer audit before implementation. Do not add a blocking advisory call into the reviewed TRY closure.

New event state and current head/CAS/receipt must persist atomically; deliberate stale version uses PT409, genuine serialization races remain40001. A missing/corrupt replay head/receipt fails closed. Grant revision is independent from the strict first1/old+1 product publication revision. Capturing an enabled or changed grant in product document22/destination23 requires a new genuine server-calculated product publication; no old NULL row rewrite or Finance-side rewrap.

Service caller can never submit this helper's output as already authorized. Future service proof reads recheck live grant/actor/partner and current compatible capture; Finance final SQL rechecks signed raw packet/local current rights. Both remain absent and blocked today.

## Tests and remaining gates

Dedicated Deno nine exercise exact16/defaultfalse, extras/accessor/symbol/nonenumerable/inherited denial, descriptor snapshot/Proxy get trap avoidance, UUID canonicalization/coercion denial, revisions/negative-zero/non-Boolean boundaries, supplementary Unicode min/max and malformed text, quote/newline purpose bytes with an independently fixed Python UTF8 SHA256 vector, async source mutation, and fixed-error reflection trap/revoked-Proxy privacy.

Run `deno test --no-config --no-lock --no-remote --no-npm supabase/functions/_shared/whole-scope-product-grant-command-v1.deno-test.ts`. Local supplemental Deno2.5.2 is distinct from canonical CI2.8.1. Tests assert encoding only and create no authentic actor/grant/authority. SQL-generated tuple crosswire, actual role/recipient/partner revocation, genuine both-order locks/absent permanent-owner races, RR/40001/phantom semantics, protected HTTPS nonce/proof and Finance admission are later native gates. No field count/pure hash substitutes for them.
