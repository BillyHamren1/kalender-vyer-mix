# Minimal caller connection for accepted personnel evidence

Read-only design for coordinator decision; no product patch, keys, enrollment, grants or activation performed.

## Existing seams

`project-personnel-cost-publish/handler.ts` already authenticates a bounded POST using the server ingest secret, accepts only ingest organization/worker/submission IDs or dispatch limit, reads Time and owns a three-attempt CAS loop. It currently always invokes shadow ingress and shadow outbox claim/finish. `index.ts` only wires legacy publisher/transport configuration.

`_shared/project-personnel-source-issuer.ts` already performs a real authenticated scoped Time read, verifies accepted ancestry for same-version reuse, calculates through accepted rate history and signs the exact issuer command. It has no caller. The accepted TypeScript sender already validates pinned HTTPS endpoint/issuer/epoch, immutable body hash, signed receipt with `financially_applied=false`, and retry/blocked outcomes. It also has no caller.

Private issue/accepted claim/finish ports intentionally have no caller grants. Existing accepted claim is global across all enrolled issuers/epochs, whereas the TypeScript sender takes one configured issuer/epoch. A single-config dispatcher must not claim foreign rows and then mark them blocked. Enrollment currently requires an existing canonical stream; generating a shadow publication merely to seed a new accepted day is not acceptable.

## Proposed bounded patch

1. Extend the existing `handler.ts`/`index.ts` with separate default-off accepted issuer and accepted transport configurations. Reuse existing inbound Bearer authentication and exact request fields; requests cannot supply issuer, epoch, keys, destination URL, raw Time data, allocation/rate data or a route mode. Keep source-attestation HMAC, accepted-delivery HMAC, ingest authentication and Time adapter signing keys separate. Validate server-configured HTTPS destinations and key separation.
2. Extend `_shared/project-personnel-ingestion-store.ts` with named RPC adapters for persisted mode, issuer submission, scoped accepted claim and accepted finish. Parse bounded structured database errors sufficiently to distinguish retryable CAS from authorization/provenance failures. Do not turn every HTTP failure into an indistinguishable string.
3. Refactor `_shared/project-personnel-source-issuer.ts` so the accepted path can reuse one verified frozen Time read across three bounded CAS retries. Each retry rereads the Operations head and accepted ancestry, creates the command with the corresponding expected revision and signs fresh timestamp/nonce. Retry only a CAS/serialization result; stale Time/review, changed binding, wrong epoch or missing causal metadata is fail-closed. Ambiguous committed response is resolved by immutable source event/idempotency and accepted ancestry, never by shadow retry. Do not silently reprice a saved same-version snapshot.
4. `dispatch` uses an issuer+epoch-scoped private claim selection **before leasing**, then the existing accepted sender and signed-ACK finish. Claim one immediately before each attempt, preserving the existing 20-second handler budget; use a lease long enough for request+bounded response+finish (for example 60 seconds within the existing 120-second maximum). ACK advances delivery only. Missing metadata remains retryable; neither receipt nor delivery means financially applied.
5. New `scripts/internal-projects/accepted-personnel-caller.sql` stays DRAFT ONLY. Public API-schema wrappers use `SECURITY DEFINER`, empty search path and exact typed parameters to delegate existing private issue/claim/finish. All functions immediately revoke default/public/browser execution; future narrowly scoped service-role grants are a separate reviewed installation step, not executed now. Keep private tables/keys inaccessible and return only mode identifiers or required evidence, never secrets. Add a scoped claim function/overload instead of client-side filtering of the current global claim.

## Mode isolation and authorization

Persisted enrollment determines accepted ownership; the HTTP body cannot choose shadow. A stream with accepted history/enrollment but disabled, ambiguous or unconfigured current issuer must fail closed. Missing new-day enrollment is an explicit setup gate, not permission to seed shadow history. A non-enrolled legacy stream can retain legacy behavior only under its existing explicit server enablement.

Protect this rule in SQL as well as TypeScript: legacy service ingress and shadow claim must exclude accepted-enrolled streams (including disabled enrollment), not merely rows already bearing accepted markers. The accepted issuer's owner-executed canonical delegation remains permitted; do not use a caller-settable session flag as a bypass. Existing accepted-marker guards on shadow finish remain. These checks share stream locks/current source identity and preserve canonical rate/review/CAS validators.

Accepted project-review UI is a **separate caller seam**. A future authenticated user wrapper must derive issuer/mode from server state and invoke the fenced review descendant, retaining actual `auth.uid()` and current grant checks. Merely connecting the source publisher does not prove that UI seam complete.

Finance application is also separate. A future explicitly authenticated Finance command must supply a user-selected accounting period and accepted receipt, invoke the existing fenced canonical writer and preserve exact actor-bound replay. No service transport wrapper or ACK callback may call the writer, infer a period, attest, invoice or pay.

## Installation and verification order

1. Retain canonical classification, rate/review issuance, TEXT compatibility and current authority fences.
2. Install disabled prospective metadata/source/receiver v2 and accepted transport contracts before the caller wrappers. Install scoped mode/claim isolation before the adapter can run.
3. Deploy caller code with all new flags false; no key creation, enrollment or grants as part of this patch.
4. Separately authorize/provision issuer epoch, immutable stream floor/source binding, metadata enrollments and destination routing, then separately grant the reviewed service wrappers and test in the intended environment.
5. Activate metadata delivery and prove its receipts before accepted cost dispatch; absent metadata must remain a retry. Finance apply remains an explicit authorized actor action with a period.

Tests must cover default-off/no network, inbound unauthorized/no RPC, no caller mode injection, accepted-disabled/no legacy fallback, genuine Time read→signed issuer RPC, CAS overlap/lost committed response, scoped claim isolation across two issuers, signed-ACK finish, metadata prerequisite retry and zero Finance events from transport. Existing native source/review/transport tests and the mixed 240000→180000→0 composition remain regression gates. Hosted authentication, new-day bootstrap and production installation are not implied by these tests.
