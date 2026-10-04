# Disposable native proof for canonical scope view aliases

This is a TEST-only source batch. It adds no product alias migration, saved event, public RPC, grant policy, UI or economic publication. The frozen alias helper remains a contract preview with `full_canonical_scope`, explicit additional members, required live organization administrator, unavailable economic mapping and NULL EAC.

## Dedicated source closure

Use a fresh PostgreSQL 15.19 database named `eventflow_scope_alias_<safe suffix>`. Apply these exact prerequisites in order:

1. `scripts/project-economy/operations-postgres-bootstrap.sql`
2. `supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql`
3. `supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql`
4. `scripts/project-economy/operations-project-review-bootstrap.sql`
5. `supabase/migrations/20261001232438_operations_personnel_project_reviews.sql`
6. `scripts/project-economy/operations-scope-bootstrap.sql`
7. `supabase/migrations/20261002014937_operations_project_scope_enrollment.sql`

Then apply `operations-scope-view-alias-native-setup.sql` and `operations-scope-view-alias-native-capture.sql` from this directory with the explicit isolated GUC `eventflow.scope_alias_isolated=synthetic-disposable`. Run `bash scripts/project-economy/operations-scope-view-alias-native-concurrency.sh` with CI true, `EVENTFLOW_SCOPE_ALIAS_ISOLATED_DB=true`, explicit loopback PGHOST, PGPORT5432, PGUSERpostgres and the dedicated PGDATABASE. The caller's PGOPTIONS must be unset for the shell harness; its helper supplies bounded statement/connection/lock options and the exact isolated GUC internally. Set `EVENTFLOW_SCOPE_ALIAS_DENO_BIN` to the exact Deno binary if not on PATH.

The seed's guard precedes all CREATE/INSERT/UPDATE work and requires the exact known synthetic actors/profiles/roles/projects/bookings/parent joins, an empty canonical scope ledger and zero personnel evidence. The committed setup creates only a private native test schema and real synthetic source rows. It uses the unchanged authenticated canonical enrollment RPC and unchanged project-review grant RPC. The granted project reviewer is deliberately denied full-scope capture.

This minimal bootstrap represents the actual columns and live authorization semantics used by the existing migrations. It is not the full production schema or a substitute for Supabase Auth. Native sessions set fixture JWT claims under the real authenticated PostgreSQL role; this batch does not claim real signed-JWT/PostgREST/browser proof.

## Actual coherent capture

`operations_scope_alias_native.capture` is an isolated private test helper, not a product alias API. It has no supplied actor or organization. It calls the actual locked administrator authorization, takes the actual `operations-economic-scope:<org>` reservation barrier, locks the real canonical head and live roots, and locks the actual enabled packing policy when that view is selected.

One CTE statement captures the canonical head and saved revision/fingerprint, both root selectors, the full bounded relevant source catalog, any existing canonical head for the selected view, and exact permanent saved member owners. Relevant foreign edges are retained rather than filtered into apparently valid membership. A canonical head for the selected view in another economic scope is a hard SQL23505 conflict. The complete captured context/catalog/owners then feed the unchanged alias helper, which independently derives both graphs and validates saved canonical identity, subset and permanent ownership.

Existing source joins and absent source members are deliberately not claimed to be protected by the canonical reservation barrier. The test holds an actual capture transaction open while a legacy source writer **without that barrier** updates a parent join identity and commits. It proves the writer really commits while the reader is still in PgSleep. The before capture remains valid as-of its statement; the fresh capture fails exact `alias_canonical_graph_stale`. An authenticated explicit canonical CAS refresh appends revision2 before a new preview is accepted.

A second genuine legacy transaction inserts a new Booking TEXT ID, source project and master join while another capture remains open. A fresh capture refuses the unmatched permanent owner with `alias_permanent_owner_missing`. Explicit real canonical re-enrollment appends revision3 and reserves both new members permanently. This is currentness detection and explicit revalidation, **not phantom serialization or perpetual freshness**.

## Live authorization races and hard denials

Real packing-policy UPDATE and real organization-admin role DELETE are observed waiting on row locks while a capture holds its actual SHARE locks. Their pre-commit source rows remain enabled/current. After the capture commits, each revocation commits, and a fresh capture fails the exact expected SQL42501 business denial. Isolated restoration lets a subsequent fresh capture succeed; it does not restore or fabricate an alias event.

The actual explicitly granted project reviewer, a foreign organization administrator, absent actor and foreign root are separately rejected. A fixture-only zero-revision canonical head for the same packing view in another scope is inserted inside an adversarial transaction; capture rejects even though its source graph is compatible, and the transaction rolls back. This checks a reserved root conflict without asserting a second source owner could be enrolled through the normal member-ownership checks.

The final ledger has one actual canonical head at revision3, three immutable snapshots with distinct membership fingerprints and the actual admin actor, four original reservations at revision1, two new reservations at revision3 and one unchanged leaf review grant. Personnel publication tables remain empty. No price, estimate, commitment, invoice, credit or cost policy is created.

## Exact output and execution limits

The strict Deno verifier accepts exactly twelve actual raw SQL captures: `initial_project`, `initial_packing`, `before_legacy_writer`, `after_legacy_writer`, `after_reenroll`, `policy_before`, `policy_restored`, `admin_before`, `admin_restored`, `legacy_insert_before`, `legacy_insert_after`, `after_second_reenroll`. It requires exact expected success/rejection, canonical revision2/3 after real refreshes, genuine two/three-Booking membership, full-scope labels/additional members, Unicode Booking TEXT preservation and NULL EAC.

Sentinels are `operations-scope-view-alias-native-setup PASS`, `operations-scope-view-alias-native-capture PASS`, `operations-scope-view-alias-native-vectors PASS 12`, and `operations-scope-view-alias-native PASS coherent_as_of_capture_live_authorization_legacy_writer_currentness_no_alias_authority`.

Logs and raw captures are in a private mode0700 temporary directory with umask077. Initial guard stderr is suppressed before that directory exists. Subsequent observers, foreground helpers, restoration commands, vector preparation and Deno diagnostics use private logs; successful public stdout contains only fixed proof markers. Only directly owned psql processes are tracked. Cleanup uses bounded TERM/KILL/reap; if a child cannot terminate, logs are retained and the harness fails. Writer transactions have explicit12second statement bounds and5second connection bounds; observers have1second statement and2second connection bounds. Observation loops use a3second monotonic acceptance deadline checked before and after each bounded query, and reject late results rather than repeating queries for minutes. Remote libpq/service/options overrides are rejected before any psql access.

Supplemental single-session PGlite rehearsal of all seven prerequisites, actual source setup/capture, authorization/policy/root denials, real canonical CAS receipts and all twelve SQL-to-frozen-helper vectors passed. Its namespace guards were omitted only in the temporary in-memory rehearsal because PGlite has no disposable native database name. The checked-in guards are unchanged. Bash syntax and Deno graph checks passed. Twelve hostile pre-connection environment vectors were rejected with zero psql calls. Actual PostgreSQL two-session execution, pinned CI source/head, independent native evidence and any future alias persistence/combined financial lock ordering remain open until separately verified.
