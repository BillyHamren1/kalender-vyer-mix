# First-day caller to explicit financial review

This archive retains the exact eleven integration harness modules from local evidence commit `3c32a23b2f680a2f833b0de3a4ea29e276961dd4`, original and independently identical logs, sixty dependency pins, and the independent report. Product sources are Operations `dc0d3cc1cad774f5bf09a3d6e7cc2526c6192053`, Finance `c3484475ab130f4ce9c2ec867e230b690c3b5935`, Time `adae19549703d3b12b1730c15a32a49afbe40df5`; unchanged TEXT calculator dependency is pinned separately to Operations `a443566f`.

The original provenance's Time upstream_head field contains the source tree ID `f5dca7b9`, not a commit ID. DEPENDENCY_BLOBS.json resolves it to the exact genuine Time commit above, with the same verified blobs. No private Finance product SQL or invoice schema is copied into this Operations archive.

Independent result: 53 existing owner checks, three real caller source revisions, and the first-day transport/application checks pass. Bootstrap creates head/floor zero with no accepted marker or shadow predecessor. Actual ingestion and dispatch handlers, signed metadata and cost receipt transport, causal retry and lost-response recovery reach explicit actor/period/reason review. Canonical balances change 240000 → 180000 → 0 minor units once; customer row and eight invoice tables are unchanged. Both logs SHA256: `f85f02aa0e64f0410e8ee067050920c5f32cd992622dfa1f38498c8312a0d183`.

## Reproduction

Use already authorized local genuine Git repositories containing the exact objects. The helper performs no network/authentication and reads/verifies all source objects before writing a new disposable directory outside the repositories:

```sh
python prepare-reproduction.py --operations-repo /path/operations --finance-repo /path/finance --time-repo /path/time --output /path/new-disposable-fixture
```

Install or reuse isolated `@electric-sql/pglite@0.5.9` and TypeScript dependencies. From the generated `operations` directory run:

```sh
ACCEPTED_FIRST_DAY=1 FINANCE_SOURCE_ROOT=../finance FINANCE_METADATA_SOURCE_ROOT=../financeMetadata TEXT_BOOKING_SOURCE_ROOT=../text TIME_SOURCE_ROOT=../time NODE_PATH=/path/isolated/node_modules node ../harness/acceptance-runtime.mjs
```

This is two-PGlite actual-code composition with synthetic source policy, Time immutable-read RPC, auth/grants and in-memory HTTP. It is not native cross-system concurrency, deployed acceptance or logged-in published UI. It does not prove project-wide coverage, equipment authority or permission to activate. FIRST_DAY_ACCEPTANCE.md and INDEPENDENT_FIRST_DAY_REVIEW.md specify those boundaries.
