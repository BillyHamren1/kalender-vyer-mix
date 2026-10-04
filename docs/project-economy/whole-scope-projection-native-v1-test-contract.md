# Native whole-scope projection parity: test contract

Status: NEW runner source, no actual native result yet. The approved [projection prototype](whole-scope-projection-sql-prototype-v1-notes.md) and [authority audit](whole-scope-atomic-publication-authority-audit.md) remain unchanged. Root owns workflow, engine pins and remote commits.

The runner is [operations-whole-scope-projection-native.py](../../scripts/project-economy/operations-whole-scope-projection-native.py). Its [guard tests](../../scripts/project-economy/operations-whole-scope-projection-native.guard.test.py) have no PostgreSQL or Docker capability. The exact [40-file SHA256 closure](../../scripts/project-economy/whole-scope-projection-native-closure.json) includes all selected DDL, actual SQL fixtures, transitive local TypeScript dependencies and frozen private child-process cleanup. Any changed byte, extra/missing path, wrong order or symlink fails closed before a database child starts. No cross-repository checkout or unpublished dependency is needed.

## Isolation and prerequisites

Require `CI=true`, exact repository `BillyHamren1/kalender-vyer-mix`, numeric `GITHUB_RUN_ID`, `EVENTFLOW_SCOPE_PROJECTION_ISOLATED_DB=true`, `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGUSER=postgres`, `PGDATABASE=operations_scope_projection_runtime`. `PGPASSWORD` is allowed solely for the explicit local connection. Reject other libpq settings, Supabase/PostgREST/Compose/Docker settings, database URLs and temporary-directory overrides. Optional `EVENTFLOW_SCOPE_PROJECTION_DENO_BIN` selects `deno` or an absolute existing nonredirected binary. No arbitrary command, database, SQL path or source fixture is accepted.

Before fixtures/DDL, an actual read-only psql query requires this database name, superuser `postgres`, server version number `150019` (PostgreSQL 15.19), UTF8 server/client encodings, no application namespace and no public table/view/sequence/foreign table. The workflow must create a genuinely fresh disposable instance with no hosted tunnel. The marker and local URL alone are insufficient; the empty-domain query is mandatory. This is a scoped foundation schema, not a full hosted Supabase reset.

The precise DDL order is the existing HTTP21 foundation closure, with `20261002052436_operations_scope_invoice_kernel_capture.sql` inserted before the final `20261002054010_operations_scope_obligation_drilldown_read_v1.sql`, then `operations-transport-seed.sql`: **23 paths**. Their hashes are in the new manifest. This supplies actual V1/V2 receivers and entry barriers, manual baseline/permanent binding/policy, scope enrollment/composition, leaf capture and whole capture. The native fixture does not need hired assignment, credit eligibility, GoTrue, a provider or a Finance account.

Reuse of `operations-hired-personnel-native.py` is pinned to SHA256 `cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76`. Only its approved private process helper is imported: 8MiB output limits, private file modes, own session creation, TERM/KILL/reap and bounded no-live-group observation. It is not invoked as the hired workflow or modified. Its schema tuple also verifies the HTTP21 source list; the new exact manifest verifies every source byte before import/use.

## Actual native sequence

1. Invoke the unchanged Deno generator with restricted private read/write permission and no libpq credentials. It calls original TypeScript functions and original acceptance assertions. Validate exact **41** synthetic labels/results/errors; run the frozen `pg_temp` calculator in a fresh actual psql session and compare every complete result or expected error.
2. Privately apply the exact23 schema/seed paths, under per-statement and whole-child deadlines. Generate the actual immutable obligation fixture using the existing `operations-obligation-fixture.ts`.
3. Run the unchanged invoice six-vector and whole-scope five-vector SQL fixtures through actual public/service/authenticated database entrypoints. Replace only their single fixture data placeholder with a selected temporary JSON datum and their final output SELECT with a private JSON aggregate. Keep all original domain assertions, role transitions and rollback. Capture the actual reader responses before rollback; these are not fabricated projection inputs.
4. Pass both real six/five response catalogs into the unchanged Deno generator. Its original TypeScript validators and existing assertions must accept them. The generated catalog has **52** exact labels, including the actual11. Run the same complete result/error comparisons in an actual psql session again.
5. Only after all comparisons and source assertions succeed, emit exactly three public lines, in order:

```text
whole-scope-projection-native PASS synthetic41
whole-scope-projection-native PASS actual_reader11
whole-scope-projection-native PASS combined52
```

All JSON crosses psql as CSV COPY data on private stdin into temporary tables. SQL expressions never interpolate JSON strings, requested function names or prices. A static CASE dispatches the three fixed prototype functions. JSONB whole-result equality and exact original error-message equality are checked inside a private DO block; mismatch emits a fixed exception, not the observed value. Normal SQL JSON object key order is irrelevant, arrays/diagnostics/nulls remain exact.

## Privacy, boundedness and tests

Temporary parent/phase directories are mode700; output/error files are mode600 and limited to8MiB. Fixtures, costs, source envelopes, SQL errors and credentials never reach stdout. Public failure is one closed phase plus one of the explicit 17 reviewed SQLSTATE values or `unclassified`. Raw files are deleted after confirmed owned-child termination. If owned termination cannot be confirmed, retain the private directory rather than deleting under a live writer; no private path is printed. SIGINT/SIGTERM enter the same owned cleanup.

Freshness query child budget30s; generator/schema/fixture/comparison child budgets90s. SQL statement budgets15s for initial identity, 30s thereafter, lock timeout10s; the reviewed child cleanup has its own bounded escalation. Native tests must assert all final markers and inspect actual engine/workflow versions; zero/partial markers are failure.

Guard cases cover hostile environment before any child, exact closure hash/order/symlink/path failures, nonfresh database before DDL, adversarial quote/newline/backslash/metacommand data confined to COPY, exact catalogs/functions/counts, actual private error redaction, owned timeout/reaping, nonfinite/oversized/redirected private JSON. These are executable boundary tests, not native parity evidence.

The exact23 closure and real6/5 reader responses were rehearsed locally with PGlite successfully. That is supplementary only. This source contract does **not** claim native51/52 PASS, atomic persisted publication, Finance copying, concurrency, graph completeness, current upstream provider coverage, Time/Catering cost inclusion, credit eligibility, cost suppression, budget or EAC authority. The first native run remains the root-owned CI gate.
