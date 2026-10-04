# Private held original receipt eligibility

This additive precursor exposes no public RPC and does not replace the original hard `42501` receipt-authority stub. No existing admission, transport, gate, queue, head, publication or source writer changes. All four new functions revoke execution from PUBLIC, anon, authenticated and service_role.

`collect_admission_receipt_scopes_v1(cursor_id)` first invokes the existing live organization administrator authorization. It binds the actual actor organization to the immutable signed cursor, then calls the reviewed cache collector. That collector creates an owner-private, immutable hold bound to the actual PostgreSQL transaction ID, actual `auth.uid()`, cursor ID/hash and exact candidate receipt IDs/keys. Neither a caller list nor a session setting supplies authority.

The eventual authenticated caller must collect once before acquiring policy, original transport route, project, obligation, Finance capability, native mapping, stream or allocation-head locks. Current original mapping-before-stream order remains mandatory. The early collector holds original cursor key, sorted receipt keys and both cache gates before those later barriers. Cache keys/configuration writers must preserve the reviewed key-before-gate order.

After the caller's currentness barriers, `delivery_eligibility_held_v1(cursor_id,hold_id)` requires the latest local publication. `historical_delivery_eligibility_held_v1(cursor_id,hold_id)` requires the cursor's actual saved local publication, allowing a later local head but never changing an old queue's state. The source parity test compares each complete function against the current original strict implementation. Only the function signature, preliminary private hold validation and final receipt authority call differ. Every original queue/publication/envelope/source/revision/body SHA/snapshot FK and thirteen-field receipt predicate remains byte-for-byte identical.

The hold verifier first checks actual current administrator and private same-transaction actor/cursor scope. The final frozen cache verifier rejects changed candidate sets before resolving only the previously captured IDs. It compares every primitive of the actual local ordinary delivered receipt with the independently signed Finance-own saved receipt. It cannot invent a local acknowledgment, reinterpret Finance cursor hash as receipt UUID authority, renew cursor expiry, or acquire a newly appearing key after stream locks.

The schema owner remains trusted to retain the installed functions/triggers and secret provisioning. Direct owner INSERTs under the installed guards are checked; a malicious owner altering the schema is outside this application authority claim.

## Evidence and required gates

The three Deno checks prove source parity and private collector order only. The SQL fixture proves unauthenticated owner calls are denied, create no holds, expose no private EXECUTE grants, and leave the existing hard stub closed. PGlite execution is a supplementary single-session rehearsal.

A positive fixture must run the genuine source → Operations publication → original transport → Finance saved snapshot/ordinary thirteen-field receipt → actual Operations lease finish. A new protected Finance lookup must then read that same saved receipt and sign its own exact response; the Operations SQL cache must verify it independently. Only this actual local delivered receipt is eligible for the new private helpers. No synthetic receipt or direct queue status/ACK seed may substitute.

Native PostgreSQL must prove queued receipt-key insertion/revocation, old/new gate revocation, competing source/allocation advancement and expiry after waiting. Actual protected HTTPS must prove request/response signature, nonce/request SHA binding and all thirteen primitives across the independent databases. Missing/foreign/changed hold, nonadmin/revoked role, mismatched receipt UUID, stale cursor and newly appearing key must reject atomically. Public admission or historical reconciliation integration remains a separate reviewed, default-off step after these gates.
