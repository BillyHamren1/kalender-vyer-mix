# First-day accepted personnel command composition

PASS in two isolated PGlite databases with in-memory HTTP. This extends the frozen existing-stream evidence at b606716; it does not replace its provenance.

Reproduce from a checkout containing the exact bootstrap source dependencies:

```sh
cd /workspace/scratch/3f646f03b350/recovery-accepted-bootstrap
ACCEPTED_FIRST_DAY=1 NODE_PATH=/tmp/operations-recovery-deps/node_modules node ../recovery-command-chain/acceptance-runtime.mjs
```

The 60 dependencies in FIRST_DAY_SOURCE_MANIFEST.json were captured before execution, compared after execution, and separately checked against committed Git blobs in FIRST_DAY_DEPENDENCY_PROVENANCE.json. The final author source working tree was clean. The changed final bootstrap regression fixture is not executed by this harness. It uses the metadata fixture callback and explicitly installs the bootstrap SQL.

Published source pins: Operations dc0d3cc1cad774f5bf09a3d6e7cc2526c6192053 (all executed Operations blobs independently compared to the genuine Git commit); Finance c3484475ab130f4ce9c2ec867e230b690c3b5935; Time adae19549703d3b12b1730c15a32a49afbe40df5. Detailed per-file ancestry remains in the provenance manifest.

Final log SHA256: f85f02aa0e64f0410e8ee067050920c5f32cd992622dfa1f38498c8312a0d183.

## Proven behavior

- Real owner-only bootstrap derives a new worker/day stream from an explicitly seeded fixture policy, creates empty head/floor 0, and creates neither publication nor accepted marker. No historical shadow row is inserted to get first-day acceptance.
- Actual Time Edge signature/read validation plus actual Operations caller ingest issues mixed full-stream revisions 1, 2, 3. No fabricated verified flag or accepted marker is used.
- Actual caller dispatch branch invokes real claim, sender, Finance Edge/SQL receipt, signed ACK and finish. Missing causal metadata retries with no money. Actual signed metadata outbox/claim/sender/Finance SQL/ACK delivers the required identity proofs.
- Losing an already committed Finance response yields one receipt and zero financial events; exact retry delivers the same evidence.
- Explicit Finance preview and actor/period/reason/reviewed command posts customer4h/internal3h/activity1h exactly once: 240000 minor, correction180000, then empty-stream withdrawal0. Per-project sums are120000/90000/30000 →120000/60000/0 →0/0/0.
- Command replay adds no event. The generic canonical writer cannot double-post these owned lines. Complete customer project attributes and all8 actual invoice owner tables remain byte-equivalent in observed row state. Final caller dispatch has no remaining accepted item.
- Source owner regression53, mixed source3 and first-day integration6 groups pass. The source callback rolls back its transaction when complete.

## Limits

Synthetic tenants, actors, policy/enrollment, worker/source bindings and input submissions are disposable test setup. Time read RPC returns a synthetic immutable snapshot through the actual Time handler; real Time database enrollment/nonce procedures are not exercised. Operations network RPC adapter runs owner SQL and does not establish deployed grants. Finance private command grants are fixture-only. Retry time is advanced through next_attempt_at, never by manufacturing a receipt or delivered state.

This is not native concurrency, hosted authentication, UI acceptance, real staff attestation, deployment or activation. Source authority remains fixture-only. Finance project_coverage remains unverified; this does not prove all expected worker/day streams or WMS/material/supplier completeness. No WMS source is included.
