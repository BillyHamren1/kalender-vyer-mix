# Accepted caller isolation — unreviewed local draft

Base genuine Operations `e28414f44068716a798831a9c0acb36bb20d7d61`. Owner `/root/time_recovery`; lease `/tmp/eventflow-accepted-caller.lease`, until 2026-10-12 22:22 UTC. Root alone publishes after independent review. No source publication, grant, enrollment, key creation, migration or activation performed by this work.

## Current work and evidence

The candidate connects the existing publisher/dispatcher to the existing accepted issuer and signed-ACK sender. It adds permanent default-off organization/worker ownership with frozen source identity, same-OID legacy façades before replay, fixed-owner private canonical implementations, and OLD/NEW direct-DML guards. The mode RPC recognizes historical accepted enrollment even without a new policy. Accepted SQL claim scopes issuer/epoch before leasing. One authenticated frozen Time read feeds at most three SQLSTATE40001 CAS attempts. SQL errors retain only bounded typed status, not database details. Delivery ACK never applies Finance money.

Local evidence so far: **65 composed PGlite checks PASS**, including twelve new caller groups and all 53 existing owner checks; **76 TypeScript tests PASS** including signed frozen-read CAS, lost committed response, missing new day, key separation, legacy mode and signed-ACK dispatch. Targeted transitive TypeScript check passed. Logs `/tmp/personnel-caller-freeze.log`, `/tmp/personnel-caller-ts-final.log`, `/tmp/personnel-caller-types-final.log`. This is synthetic local verification, not hosted authentication.

Native overlap harness and separate PostgreSQL 17 workflow have been written but not executed yet. Scoped claims scan up to min(1000, 128 × requested count) candidates, stop after successful leases, and preserve per-stream head ordering; locked or revoked workers do not consume the returned-count limit. Native coverage adds actual issuer-created two-stream first-row-locked progress. Namespace/claim/OID tests now pass. Final independent review and native CI remain open. Expected native total is 70 (65 sequential, existing metadata overlap, four new ownership/claim overlaps), not yet proved. This checkpoint is WIP, not publication approval.

## Ownership concurrency and privilege boundary

All supported writer entry points take SHARED transaction advisory lock `hashtextextended('eventflow:personnel-accepted-ownership:v1',0)` before tuple/issuer/project locks. Direct DML also acquires it in BEFORE STATEMENT triggers. Rare owner provisioning takes EXCLUSIVE before source/stream rows. Normal publication never implicitly enrolls or upgrades shared to exclusive. Separate ordinary writers retain concurrency. Arbitrary caller transactions that lock unrelated tuples before invoking these ports can still deadlock; PostgreSQL abort/retry applies, not a claim of unconditional deadlock freedom. Native tests must physically observe both absent-first-day enrollment/writer orderings and overlapping bulk writers.

Fixed database owner/superuser remains trusted, as with existing SECURITY DEFINER administration. Public legacy façades check ownership even in owner context. New canonical inner EXECUTE and all new API wrappers are revoked from public/anon/authenticated/service_role. Exposed historical authenticated review and service proof helpers are also fenced before delegating. No caller-controlled GUC, flag or supplied owner name grants access.

## Installation and remaining caller gates

This SQL is a dormant draft script, not a migration. Install only after canonical accepted rate/review issuance, TEXT compatibility, accepted issuer/transport, causal metadata v2 and reviewed-descendant v2. **Even a legacy-enabled handler now requires the persisted read-only mode RPC.** A separately authorized staged grant for that mode read must precede deployment to a legacy-enabled environment. Flags false alone do not preserve the old runtime without this prerequisite. Missing RPC/permission fails closed; never bypass it.

Future source issue/claim/finish grants, server-only distinct issuer/delivery keys, explicit worker+stream enrollment, routes and flags require separate coordinated installation review. Issuer and delivery keys cannot equal the Operations database credential, ingest secret, Time read secret, legacy shadow signing key or each other. Public request bodies never select issuer/epoch/destination/mode or supply snapshots.

First-day setup remains an explicit gate: current enrollment requires an existing canonical stream. A safe next code batch can atomically initialize an empty canonical stream and prospective floor under exclusive ownership lock without any shadow publication. That missing implementation is not intrinsically an external blocker; do not enable this patch by inventing a shadow seed.

Accepted project-review UI remains separate: no existing UI caller was found for the canonical review API. Finance application requires a real authorized actor and explicit accounting period, separately from transport. Hosted migrations/rollback, auth and equipment coverage remain open.

## Review corrections before freeze

Independent review required key separation from the existing shadow signing key, not only DB/Time/ingest keys. Scoped claim now filters and locks the current enabled source binding equal to frozen worker policy before acquiring any queue lease; disabled or rebound workers do not consume attempts. A bounded candidate scan preserves progress past a locked earlier unrelated stream, with returned count measured after successful lease.

An adversarial legacy-stream alias test reproduced a real hole: an unowned worker/stream alias could copy an accepted Time organization/auth identity. OLD/NEW DML checks and all owner-context source façades now check that immutable source identity independently of stream spelling. Existing heads with such source identity also resolve accepted ownership. The tests retain actual row-count preconditions, public/private review replay denial, and exact canonical function OID/ACL assertions.

The isolated fresh issuer test initializes revision-zero heads only as disposable setup, creates actual accepted publications via the reviewed canonical issuer, and never fabricates an issuance marker. A production bootstrap API is still absent. Its follow-up must additionally handle store.current revision-zero heads (currently reported as missing publication evidence) safely.
