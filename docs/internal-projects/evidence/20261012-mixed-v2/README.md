# Durable mixed-day evidence and reproduction

The original nine harness files, corrected 50-file manifest, author log and independent report/log are archived byte-for-byte from evidence commit `7b84f5a`. `ACCEPTANCE.md` records the original run paths; use the portable procedure below for a fresh reproduction. No Finance or WMS product SQL is copied into this repository. `DEPENDENCY_BLOBS.json` maps every source pin to a genuine repository/commit/path/blob. All 17 Finance source objects and the separate invoice DDL blob were freshly checked against GitHub `9442108d`; all 33 Operations/TEXT objects were checked using genuine Git objects.

The Operations baseline calculator in the historical owner regression suite is pinned to its historical genuine commit. The mixed source uses the separately pinned TEXT-capable calculator, as the actual original harness does. This mixed baseline is intentional, recorded and reproduced; it is not a claim that every source pin came from one tree. Product composition and independent native CI remain distinct evidence.

## Reproduce without copying private dependencies into Operations

Obtain authorized local Git checkouts containing the exact objects in `DEPENDENCY_BLOBS.json`. Do not use synthetic repository history, infer credentials, or substitute latest files. Then materialize outside both repositories:

```sh
python docs/internal-projects/evidence/20261012-mixed-v2/prepare-reproduction.py \
  --operations-repo /path/to/operations --finance-repo /path/to/finance \
  --output /tmp/eventflow-mixed-reproduction
npm install --prefix /tmp/eventflow-mixed-deps --no-save --package-lock=false @electric-sql/pglite@0.5.9 typescript@5.6.3 pg@8.16.3
cd /tmp/eventflow-mixed-reproduction/operations
NODE_PATH=/tmp/eventflow-mixed-deps/node_modules \
  FINANCE_SOURCE_ROOT=/tmp/eventflow-mixed-reproduction/finance \
  TEXT_BOOKING_SOURCE_ROOT=/tmp/eventflow-mixed-reproduction/text \
  node ../harness/acceptance-runtime.mjs
```

Use Node 24 and leave `INTERNAL_PROJECTS_TEST_DSN` unset. The preparation helper performs only local Git reads, checks SHA-256 and Git blob IDs before writing any materialized dependency, and refuses an output under a source repository. The private invoice SQL exists only in that disposable reproduction directory. It is required by the unchanged oracle, but is deliberately absent from this archive.

Expected output: **53 owner + 3 genuine source + 6 chain checks PASS**, including total 240000→180000→0, exact replay, unchanged entire customer project and eight invoice tables. Source generated UUIDs vary; compare assertions and dependency hashes rather than generated identifiers. Original author and independent logs are byte-identical (SHA256 `585b8d55804dbbf7799f0e2d4cd723b664e672e0aa1885828eb9fa59a999d2d8`). The corrected 50-file manifest SHA256 is `137b56a656bfe61e05bb8dc18d414e87075d0063ae5e0dc55db7bba8539f894e`.

## Remaining gates

The WMS subdirectory archives 14 selected actual-owner SQL fixture findings, not authorized project integration or deployed privileges. Its reproduced bypasses remain open. The caller design/inventory are read-only proposals: lower RPCs and direct canonical DML require a complete ownership fence before a callable accepted adapter. Root approved bounded default-off design work; that approval does not activate a caller, grants, keys or enrollment.

All composition here uses isolated PGlite, synthetic tenants/auth/enrollment and in-memory HTTP. Native PostgreSQL concurrency is separately documented in INTEGRATION.md. No hosted authentication, signed-in UI, migration, deployment, financial attestation, invoice issue or payment is proven or performed by this archive.
