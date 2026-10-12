# Accepted personnel transport — dormant reviewed candidate

Source base: Operations PR55 `5a0601b6fb2e5aa0cce564ec5a72b77c3c34bb5e`. Scope owner `/root/operations_recovery`; local exclusive transport lease through 2026-10-12 20:09 UTC. No hosted migration, keys, enrollment rows, caller grants or activation are installed.

## Shared protocol agreed with Finance

Accepted source envelope remains the twelve-field `operations-personnel-accepted-envelope.v1`. Its raw text is frozen once by the source issuer. `source_snapshot_sha256` hashes the original PostgreSQL `cost_snapshot::text` stored in the canonical outbox; no JavaScript reserialization is substituted. Source and receiver both cap the envelope at 524288 UTF-8 bytes.

Request endpoint: `/functions/v1/operations-personnel-accepted-receive`. HMAC-SHA256 input is the newline join of:

1. `operations-personnel-accepted-delivery.v1`
2. `operations-personnel-accepted-receive`
3. Unix seconds timestamp
4. Fresh attempt nonce UUID
5. Issuer UUID
6. Enrollment epoch UUID
7. Exact raw envelope

Headers: `x-eventflow-issuer-id`, `x-eventflow-enrollment-epoch`, `x-eventflow-timestamp`, `x-eventflow-nonce`, `x-eventflow-signature`. Signature is lowercase hex64 without a prefix. Every retry uses new transport timestamp/nonce while preserving the same immutable outbox/envelope identity. The dedicated accepted delivery key is distinct from the source-attestation key and legacy shadow key. Source claim/finish fail closed if the configured accepted transport key equals the issuer attestation key.

HTTP 200 returns exactly `{raw_ack, signature}`. ACK signature input is `operations-personnel-accepted-ack.v1`, newline, exact `raw_ack`, using the accepted delivery key with domain separation. Parsed ACK has exactly these twelve keys: `schema` (`operations-personnel-accepted-receipt.v1`), `outcome` (`received` or `replayed`), `issuer_id`, `enrollment_epoch`, `source_organization_id`, `destination_organization_id`, `source_stream_id`, integer `source_revision`, `outbox_id`, `envelope_sha256`, UUID `receipt_id`, `financially_applied=false`.

Receipt confirms immutable evidence reception only; no financial posting or approval follows from it. An already received historical accepted envelope can replay its exact receipt. An unknown older revision is rejected; the source never fabricates a stale ACK from another revision. 400/401/403/409/422 responses block delivery, other non-200 failures and unknown/malformed ACKs remain retryable.

## Source boundary

`accepted-personnel-transport.sql` is a draft outside migration discovery. Its private enrollment function requires an existing canonical stream and locks its row with `FOR UPDATE`, exactly the lock used by canonical publication. It captures the current head as an immutable exclusive revision floor and retains the explicit worker/Time binding. Missing streams fail instead of creating a no-row lock race. Key provisioning and future administrative enrollment entrypoint remain absent.

Accepted delivery reuses `operations_personnel_cost_outbox`, including its identity, states, attempts and leases. The only added column is an ephemeral accepted lease route fingerprint binding current issuer/epoch, source/destination, endpoint and dedicated key. There is no second monetary ledger or dispatch queue. A private route table contains configuration only and defaults disabled.

The existing shadow claim and shadow finish reject accepted identities. A trigger also prevents the generic `service_role`, including BYPASSRLS, from directly editing accepted state, receipts, leases or route fingerprints. Owner-executed private procedures remain the only accepted delivery mutation path. Shadow behavior remains supported. Accepted claims wait for earlier accepted revisions in the same stream to reach delivered, even across epochs; an earlier blocked revision remains blocking. Lease expiration reclaims the same immutable row.

Edge verifies exact signed ACK fields against the claim; SQL finish independently verifies the signature, exact fields, unexpired owned lease and current issuer/route/key fingerprint. Changed endpoint, disabled route, rotated key or revoked issuer cannot finish the old claim. Claims are intended to be obtained immediately before each outbound attempt; there is no batch caller or scheduler yet. The pure sender does not perform a new database authorization read at the instant of HTTP. Finance independently verifies its current receiver enrollment. Do not claim instantaneous revocation of an already in-flight request.

## Verification

Current local result: **57 PGlite scenarios PASS**, preserving the prior 45 source/rate/review assertions. **68 Vitest tests across four files PASS**, including six new actual transport tests. Transitive transport TypeScript PASS. Independent composition additionally connects actual issuer SQL → actual source claim → actual TS sender → actual Finance Edge/SQL → signed ACK → actual source finish; its evidence is maintained separately by the composition reviewer.

Added native PostgreSQL scenarios explicitly observe physical lock waits for enrollment racing an actual canonical source publication and ACK finish racing route revocation. Concurrent claim workers exercise `SKIP LOCKED` on the actual outbox. These run in the isolated existing CI fixture and remain pending on a published exact head. PGlite and mock HTTP are not hosted acceptance or concurrency evidence.

Open: independent final review, exact-head native CI, accepted project-review descendant integration, exposed authenticated caller design, actual key provisioning/enrollment, hosted migration/rollback and real authenticated UI acceptance. No live source enrollment or financial action was performed.
