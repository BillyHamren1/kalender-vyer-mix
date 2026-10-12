# Public project review and recorded-cost read composition

This isolated extension starts from first-day composition3c32a23. It uses genuine Operations5a3337439021c9dae0d9d785e085c28cae7744a9 and Finance28fec04df85137d710c50275b713586389d900d1 read SQL with unchanged prior canonical Finance dependencies.

```sh
cd /workspace/scratch/3f646f03b350/recovery-review-read-source
ACCEPTED_FIRST_DAY=1 FINANCE_SOURCE_ROOT=../recovery-finance-evidence-read NODE_PATH=/tmp/operations-recovery-deps/node_modules node ../recovery-review-read-chain/acceptance-runtime.mjs
```

The source directory contains exact required Operations files materialized from the genuine commit. Relative module dependencies must match REVIEW_READ_SOURCE_MANIFEST.json. No product edits were made.

## Composition

The actual owner bootstrap creates head0 without a publication or accepted marker. Actual caller ingestion creates a mixed three-project stream at revision1. Under SET ROLE authenticated and an explicit synthetic administrator JWT subject, actual public get_operations_accepted_project_reviews_v1 filters the internal project's line. Actual public review_and_publish_operations_project_personnel_v1 approves that project and creates signed accepted descendant revision2. Exact command replay returns the same outbox ID and duplicate status. Correction and full withdrawal are new source revisions3/4. The review wrapper invokes its private implementation normally; the harness does not call the private review helper.

All four revisions pass actual accepted caller dispatch, transport/Edge/SQL receipt/ACK/finish. The source project review and Finance explicit actor/period/reason financial command remain separate actions. Canonical recorded personnel subtotal is240000→240000→180000→0; approved actual and preliminary accrual are read separately and summed exactly once, preserving the canonical accounting classification.

The genuine public Finance read API runs as authenticated after receipt but before each explicit application, and again after application. Initial receipt leaves no observed posted amount (null, not invented zero), with pendingFinancialReview1. Later unapplied receipts retain the prior canonical subtotal and report pending/stale evidence. After explicit command, per-project recorded subtotals match canonical cost lines and pending clears. Command replay and denied generic double-post leave counts unchanged. The complete customer row and eight genuine invoice tables remain unchanged.

Every read retains wholeProject=unverified, personnelCensus=unknown, unlocksFinancialClose=false. No project-wide coverage claim is inferred from the single observed worker/day stream.

## Boundaries

PGlite and in-memory HTTP, not native concurrency or authenticated hosted UI. Roles/JWT subjects, worker policy, tenant/source bindings and enrollment are synthetic fixtures; exposed API grants are added only inside the disposable database. Actual Time read handler verifies signatures and raw snapshot hashes around a synthetic RPC response, not real hosted Time storage. Retry timing alone is advanced; no accepted marker, receipt or delivery status is fabricated. All source fixtures roll back. No publication, deploy, migration or customer-data write was performed by this integration task.
