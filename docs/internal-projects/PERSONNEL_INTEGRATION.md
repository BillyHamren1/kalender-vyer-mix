# Canonical personnel closure on current integration

Base: `82b9e3f81`. Source manifest records exact PR48 and accepted-rate source commits, blobs and SHA256 for each adopted file. No broad PR merge and no new monetary ledger.

## Adopted runtime

Six canonical PR48 migrations preserve the existing personnel rate/history/publication/outbox/project-review identities. The reviewed accepted-rate migration requires prospective immutable issuance references and exact approved admin provenance. The service adopts only cost engine, Time ingestion, store, transport and publisher handler/index. The existing `timeServiceProof.ts` is byte-identical to PR48 and is retained. No project-review UI/Edge endpoint or unrelated PR48 module is imported.

`project-personnel-cost-publish` uses its existing custom service-secret authentication. Both `OPERATIONS_PERSONNEL_PUBLISH_ENABLED` and `OPERATIONS_PERSONNEL_FINANCE_TRANSPORT_ENABLED` default false. This change supplies no caller, scheduler, environment values, workers, bindings, rates or routes. Existing Finance totals, internal close guards and cost-source selection are unchanged.

## Migration order and compatibility

The six October 1–2 migrations depend on existing April project `deleted_at`, profiles/user_roles/auth and project identity. Their new tables do not depend on October 12 classification columns. The current October 12 classification migration precedes the October 12 accepted-rate migration lexically. The isolated runtime applies that exact order: six existing migrations, actual current classification migration, accepted-rate migration. Hosted migration history may already have later versions: deployment must explicitly reconcile missing earlier migrations; do not assume a normal latest-only push applies them. No hosted migration has been executed.

The compatibility fixture supplies only preexisting referenced base columns/tables. It applies the full actual classification migration, classifies a real fixture project as `internal_project`, publishes120min ×30000 minor/hour=60000 with NULL booking, verifies no artificial booking exists, and exercises actual internal billing-trigger rejection. This verifies classification compatibility; authenticated hosted UI and full real schema deployment remain separate gates.

## Fresh local proof

- Existing cost/ingestion/transport/disabled-handler Vitest:41 PASS across2 files.
- Actual SQL/engine/resolver and current-classification oracle:33 PASS (PGlite).
- Publisher handler and all transitive modules:TypeScript PASS.
- `git diff --check`:PASS.
- Native PostgreSQL17 proved21 accepted-rate scenarios on canonical PR48 head730e0bf92466fb96dde904bfb01ba7cb36a970ab earlier. It does not prove this expanded33-check integration head; workflow now runs the expanded exact suite.

Run `vitest run --config scripts/internal-projects/personnel-vitest.config.mjs` and `node scripts/internal-projects/accepted-rate-provenance.test.mjs` with pinned dependencies from the workflow. Native mode accepts only an empty isolated loopback `accepted_personnel_cost_ci` database. No external HTTP is used by these tests.

## Remaining gates

Independent integration review and exact-head CI/native33 proof; canonical Time scoped-read integration; explicit worker/target enrollment authority; approved real prospective rate basis/source/interval; signed Finance accepted-cost port and one-source total replacement/coverage; secure provisioning; coordinated migration/release; concurrency/fault and authenticated end-to-end acceptance. Do not activate dormant chain or count its rows as trusted Finance totals before these gates close.

## Prospective review authority follow-up

The separate additive `20261012165000_operations_personnel_review_issuance.sql` closes inherited service write access to review grants and reviews. Default-empty private immutable references bind only newly authenticated grant/review issuance; old review-shaped rows are never backfilled. Exact old command retries cannot mint references. Authorization uses issued grants, while review reads and derivation use issued review events. Original raw sequence CAS, live user-role checks, tenant/project scope, fingerprints and source locks remain intact. Later grant/role revocation prevents new commands but does not erase issued historical evidence.

Publication and canonical-ingress replay require complete matching saved project proofs bound to issued events. A confirmed proof requires an issued approved decision and a saved submitted/approved/locked source; rejected events or voided/correction-requested sources cannot be relabeled confirmed through raw service proof insertion. The authenticated review publisher separately validates frozen complete-cost lines against exact prospective rate issuance, interval, category, currency, minutes and integer amount basis; it never selects a newer rate or rewrites saved money. Missing-rate rows remain incomplete. This prevents a new genuine review from promoting old unaudited shadow cost.

Added adversarial fixture seeds forged grants/reviews and publishes their old confirmations before applying the seam; current read, auth, command retry, review-publisher retry and canonical-ingress retry all reject them. Genuine delegated review and project-specific publication pass; A cannot confirm B. The exact integrated native33 run is still pending. No runtime activation occurred.
