# Granted whole-scope destination renderer v1 — pure field lock proposal

This slice is a pure deterministic renderer proposal. It does not authorize disclosure, authenticate an actor, establish currentness, enable a grant, store a destination document, create a nonce, sign or send a packet, or admit a Finance cost. Existing publication `destination_raw_body` remains SQL NULL. Existing Finance product-source and unfinished-admission barriers remain unchanged. Old NULL-grant publications are rejected by this renderer rather than rewrapped.

The genuine source is the shared physical publication introduced by `supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql`, extended by `20261002203540_operations_whole_scope_granted_product_publication_v2.sql`. The deferred trigger security repair `20261002224027_operations_granted_publication_deferred_completeness_security_v2.sql` changes execution context only. The renderer consumes immutable lineage from that one stream, never an alternate grant-bearing head. Actual native grant-bearing runtime acceptance remains separate from this proposal.

## Owned proposed files

Only NEW `_shared/whole-scope-granted-product-destination-renderer-v1.ts` and `.deno-test.ts` are proposed after independent field-lock ACK. No SQL, endpoint, protected proof helper, publisher, nonce writer, Finance receiver, or existing frozen helper is modified.

## Input boundary

The pure API accepts one immutable raw JSON string, not a caller object, with exact five keys:

| Key | Exact value |
| --- | --- |
| `schema_version` | `operations-whole-scope-granted-product-renderer-input.v1` |
| `publication` | Saved granted publication document22, schema `operations-whole-scope-granted-product-publication.v2` |
| `binding` | Actual saved binding4: `publication_id`, `organization_id`, `economic_scope_id`, `grant_event_id` |
| `grant_event` | Actual saved grant event document23 |
| `receipt` | Actual saved accepted publication receipt12 |

The input is bounded at 4 MiB UTF8 before parsing, and additionally by depth, node count, strict duplicate-free keys, valid Unicode, finite safe-integer numeric domains and exact known field sets. Lexical nonzero fractions rounded into integers, underflow, negative zero and unsafe values are rejected with a fixed error. The renderer uses the existing reviewed raw parser/canonical JSON domain. No caller iterators, property getters or Proxy objects are accepted through this raw-string boundary.

This wrapper is not an authorization token or a source verifier. Synthetic equivalent values remain synthetic. A future server must obtain all five values from genuine immutable rows under the complete independently approved authorization/currentness transaction. No input includes `authorized`, `verified`, `current`, a source amount override or a destination success boolean.

## Exact immutable integrity checks

The publication is exact22. Its command is validated by the unchanged granted-command10 helper; its grant7 is compared against the unchanged event23 helper's grant projection. The actual binding4 must agree with the publication ID/org/scope and saved grant event ID. The saved accepted receipt12 must bind the publication revision, source publication fingerprint, source evidence fingerprint and grant event/revision/fingerprint, with `historical_only=false`, `shadow_only=true` and `delivery_state=blocked_missing_protected_source_export`.

The command's economic scope and expected scope/membership/composition selectors must equal the saved publication selectors; expected publication revision plus one equals the saved revision, and expected grant revision equals the saved event revision. Publication, event and capture organization/scope must agree. Saved event scope/composition snapshot IDs, revisions, fingerprints and complete canonical membership must equal the publication's corresponding immutable values. Capture/projection scope/composition selectors and original observation timestamp must agree with the publication. Manifest must equal the exact saved capture inventory with only the two approved private fields (`source_organization_id`, `invoice_id`) removed, preserving original order and every other value. These are structural lineage comparisons; no inventory amount aggregation or projection recalculation is performed.

The renderer recomputes the publication's *encoding fingerprint* using SHA256 of compact canonical UTF8 `['operations-whole-scope-granted-product-publication-v2', document22]` (JSON array with double-quoted strings). No trailing LF or BOM is added. It recomputes the grant event encoding fingerprint through the existing event helper. These are integrity comparisons, not authorization, calculation verification or remote currentness. The source-evidence fingerprint retains the original full capture and its timestamps; existing capture fingerprint helper verifies compact canonical UTF8 `["operations-whole-scope-product-evidence-v1", capture]` encoding only. No timestamp is stripped from saved evidence or fingerprints. A future current recapture may omit only the two previously locked comparison locations; that operation is outside this pure renderer.

The publication's current-grant relationship is not inferred from receipt completeness. The immutable event may be disabled or superseded now; rendering its historical immutable bytes still does not make it exportable. A future export entry must require the actual current physical publication head and independently locked current enabled grant/partner, current actors and full project union, exact saved owner/binding/receipt and fresh compatible capture under RR/SERIALIZABLE. An old NULL head blocks a formerly granted head.

## Output body23 mapping

The body has schema `operations-whole-scope-cost-destination.v1`, exact23 and no private event, actor, reason, command, raw capture, private grant audit mapping fingerprint or recipient user ID. The frozen redacted manifest16 intentionally retains project/obligation/binding/snapshot/policy identities; it removes only source organization and invoice IDs. This renderer does not broaden that disclosure schema.

| Body fields | Source |
| --- | --- |
| `source_organization_id`, `economic_scope_id`, `publication_id`, `publication_revision` | Saved publication22 |
| `source_publication_fingerprint` | Exact v2 publication encoding fingerprint already bound by saved receipt12 |
| `source_evidence_fingerprint` | Saved publication22, exact original capture encoding check |
| `scope_snapshot_id`, `scope_revision`, `membership_fingerprint` | Saved publication22 |
| `composition_snapshot_id`, `composition_revision`, `composition_fingerprint` | Saved publication22 |
| `destination_organization_id`, `destination_scope_id`, `destination_mapping_id`, `destination_mapping_revision` | Exact saved grant7 derived from the saved event23 and matched binding/receipt |
| `projection`, `source_manifest` | Exact copied saved projection33 and manifest16 values |
| `schema_version` | `operations-whole-scope-cost-destination.v1` |
| `delivery_kind` | `snapshot` |
| `scope_semantics` | `full_canonical_scope` |
| `calculation_basis` | `current_invoice_capture_only` |
| `shadow_only` | `true` |

Projection33 and manifest16 must satisfy the frozen Finance structural domain: canonical-scope invoice capture, `membership_currentness=as_of_graph`, `source_currentness=saved_receiver_heads_only`, unavailable source/category coverage, `credit_eligible=false`, and NULL remaining/EAC/budget/margin. Exact integer values, diagnostics, exclusions, source statuses/versions/fingerprints, inventory fingerprint and original `as_of` are copied. No component sum, money arithmetic, reclassification, repricing or replacement policy inference is performed. Full canonical membership remains in the private publication/proof; manifest is not substituted for that membership.

The output body is compact canonical JSON in the reviewed safe canonical JSON domain. All schema keys are the locked ASCII field names. UTF8 encoded output must be at most 262144 bytes. Any unsupported diagnostic, unexpected field, stale schema or excessive size fails closed; there is no truncation or fallback body.

## Pure result and artifact policy

The renderer returns exact four fields:

1. `schema_version=operations-whole-scope-granted-product-renderer-result.v1`;
2. `destination_raw_body` — the exact compact canonical body23 string;
3. `destination_body_sha256` — lowercase SHA256 of those exact UTF8 bytes;
4. `source_publication_fingerprint` — the existing source v2 encoding fingerprint.

It returns no `authorized`, `transport_ready`, source proof, signature, Finance receipt or currentness claim. This is an in-memory deterministic value only. No new persistent artifact/table or mutable cache is authorized. If a later proposal persists an artifact, it must be immutable and bound to the same physical publication ID, with exact source/grant lineage and no competing economic head; that requires separate SQL/role/native review.

## Protected packet and key boundaries

The result may eventually populate the already locked request2 `destination_raw_body`. It does not itself create request2, proof18 or request/response HMAC. Raw request max786432, body max262144, seven/eight HMAC lines, ±120 request freshness and exact60-second proof expiry/+30-second future allowance remain the frozen Finance contract, not new renderer parameters.

Root has chosen owner-only immutable BYTEA secret storage to preserve the full raw UTF8-byte key domain, including NUL bytes; no PostgreSQL text/NUL subset is implicitly introduced. No key is provisioned in this slice. Exact issuer/source/destination/peer purpose/key revision/enrollment tuple, authority, current rights, rotation, owner ACL, nonce reservation and response envelope remain separately locked before any executable signing/proof entry. The renderer is key-free.

## Required tests before implementation acceptance

Use genuine saved SQL publication22/binding/event/receipt from the reviewed role fixture and native journey as structural crosswire inputs. Compare complete body23 and raw SHA against the unchanged Finance pure body parser/encoder. Label synthetic/PGlite/native provenance accurately; none of these shape tests is source admission.

Require old NULL publication denial; wrong publication/binding/event IDs/org/scope/revisions/fingerprints; mapping ID/revision substitution in actual event.document; missing/extra receipt fields; replayed or historical receipt instead of saved accepted receipt; changed command/event/capture/projection bytes; malformed Unicode, duplicate keys, unsafe/fraction-rounded numbers, huge input and body size. Confirm no key, actor, publication/grant command reason, command, full private capture or private audit mapping fingerprint appears in body23. The existing manifest reason and machine diagnostics remain copied, including their frozen permitted identities. Retain all copied NULL/status/diagnostic fields exactly. Verify historical rendering has no current/authorized output and cannot call any database/network/write/signing capability.

Native product source export, current grants/actors/project union, RR recapture, actual protected packet, persistent nonce, key revocation and atomic Finance local admission remain subsequent gates. No product/hosted/upstream completeness claim follows from this pure renderer.
