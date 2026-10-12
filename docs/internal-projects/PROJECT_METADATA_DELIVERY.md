# Project metadata delivery v1 — source-only, dormant

2026-10-12. Sender base fd77f26de. Operations remains metadata/cost owner; this protocol transports classification and budget observations only. It cannot supply cost evidence, establish Finance enrollment, or authorize financial closure.

## Wire contract

POST body is the immutable outbox receipt serialized in PostgreSQL, exactly eight fields: `schema` (`operations-project-metadata.v1`), `source_project_id`, `source_organization_id`, integer `revision`, `operation`, `metadata`, `fingerprint`, `captured_at`. The source fingerprint remains PostgreSQL jsonb SHA256, distinct from raw-body authentication. No caller supplies this body.

Headers: `x-operations-issuer`, `x-operations-timestamp` (13-digit epoch milliseconds), `x-operations-nonce` (fresh random UUID each attempt), `x-operations-signature`. Signature is `v1=` + lowercase hex HMAC-SHA256 over five LF-separated fields: `finance-operations-project-metadata.v1`, issuer, timestamp, nonce, exact raw body. Maximum request is 16,384 UTF-8 bytes. Finance enforces five-minute skew and persistent nonce replay protection.

Successful response is signed with the same issuer/timestamp/nonce and domain `finance-operations-project-metadata-ack.v1`, over exact raw ACK bytes. Exact ACK fields: `schema` (same ack domain), `issuer`, `destination` (`finance-project-metadata-v1`), `source_organization_id`, `source_project_id`, `revision`, `fingerprint`, boolean `replayed`. The sender validates the signature, original nonce and every receipt identity before acknowledging delivery. Maximum ACK is 4,096 bytes; redirects are forbidden.

## Authority and ordering

The new owner-managed `operations_project_metadata_destinations` table is empty by default. Enrollment binds exact source organization/project and approved `first_revision` to a pre-existing explicit, booking-free upsert receipt. Identity/floor cannot be changed or deleted; only enabled may change. Application and service roles cannot provision enrollment. This is a prospective starting boundary reviewed jointly with Finance's mapping/floor; earlier receipts remain retained and unconsumed, never claimed as complete history. No project-name guessing or implicit legacy enrollment.

The worker inserts queue state only for enabled enrolled streams. It claims the earliest incomplete revision per project with row locks/SKIP LOCKED and a unique 90-second lease. Only a matching unexpired lease may record result; stale workers cannot acknowledge later workers' delivery. Different source projects may progress independently. Append-only source rows are never updated. No HTTP occurs in a source transaction; no trigger or cron is added.

Transport errors, HTTP 408/429/5xx and invalid ACKs retry with bounded exponential backoff (max one hour). A permanent HTTP 4xx is recorded as `remote_rejected`, quarantining that stream and blocking later revisions until owner-reviewed reconciliation resets delivery state. Do not bypass a rejected revision by changing the enrollment floor. Timeout after a remote commit retries the same semantic receipt with a fresh nonce; Finance must return its persisted idempotent ACK. A successful response followed by DB acknowledgement failure is recovered by lease expiry. Delivery status is transport state, not financial acceptance or cost coverage.

The two RPCs are service-role-only SECURITY DEFINER functions with empty search paths, revoked PUBLIC/anon/authenticated execution and no direct service DML. Service role is explicitly a trusted backend boundary: signature verification is performed in the sender handler before invoking finish; a stolen service credential is outside this boundary and must be rotated. End-user JWTs cannot claim or finish. Enrollment provisioning is database-owner release administration.

## Activation prerequisites (not performed)

All environment variables are server owned: `PROJECT_METADATA_DISPATCH_ENABLED=true`, a dedicated minimum-32-character `PROJECT_METADATA_DISPATCH_TRIGGER_SECRET`, `PROJECT_METADATA_ISSUER` (1–64 safe characters), dedicated minimum-32-character `PROJECT_METADATA_SIGNING_SECRET`, exact HTTPS `PROJECT_METADATA_FINANCE_URL`, and matching independently reviewed `PROJECT_METADATA_FINANCE_ALLOWED_URL`. Missing or mismatched configuration makes no DB or network calls. Neither destination nor tenant can come from the trigger request; authenticated trigger body must be empty. Configure no cron until acceptance.

Deployment must explicitly review the custom-trigger authentication boundary: the new Edge endpoint uses dedicated bearer authentication, so the default platform JWT check must be disabled for this endpoint only at approved activation (`verify_jwt=false`), not globally. No existing config or deployed runtime is changed in this patch. Sender/Finance source versions, issuer/secret and approved enrollment floor must match before enablement. Hosted queue concurrency/lease expiry, failure injection, migrations/rollback and real authenticated UI acceptance remain open. Rollback first disables trigger invocation and enrollment; retain receipts, queue history and accepted Finance evidence.

## Test evidence

- `node scripts/internal-projects/project-metadata-dispatcher.test.mjs`: 8 mocked HTTP/security/retry scenarios pass; Node 24 native TS stripping.
- `PGLITE_MODULE=/tmp/internal-project-db/node_modules/@electric-sql/pglite/dist/index.js node scripts/internal-projects/project-metadata-delivery.test.mjs`: 10 actual migration scenarios pass against synthetic PostgreSQL-WASM roles and outbox. Includes no enrollment, cross-tenant floor rejection, ordered claims, expiry/reclaim, exact ACK, service DML denial, retained pre-floor history and permanent rejection quarantine.
- Standalone handler TypeScript check passes (ES2022/DOM, bundler module resolution).

These are synthetic tests, not hosted PostgreSQL concurrent-session or deployed signed-in proof. Parent owns integrated validation, publication, release and final gate claims.
