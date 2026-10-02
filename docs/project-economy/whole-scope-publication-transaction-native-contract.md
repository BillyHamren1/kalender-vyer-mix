# Whole-scope publication transaction: disposable prototype

Status: contract for a **test-only** transaction, 2026-10-02. No production migration, public RPC, endpoint, transport, alias authority or release is authorized by this document. The unchanged SQL calculation prototype and its differential runner remain owned separately. This experiment must use a fresh `eventflow_scope_publication_*` database with explicit isolated-fixture guards before any mutation.

The calculator's separate actual PostgreSQL 15.19 parity gate passed at Operations `fa862`, run `36987786209`, job `110776653818`: 41 synthetic and 11 actual reader vectors. This closes that tested typed-input differential gate only. It provides no publication transaction, live enrollment, concurrency or release authority.

The causal question is whether actual Operations source capture, Operations calculation and immutable publication can commit as one database transaction. A caller-supplied projection or a capture from a previous transaction cannot answer it. Finance whole-scope destination enrollment does not exist, so this experiment cannot fabricate a deliverable Finance message.

## Owned new files

All paths below are beneath `scripts/project-economy/`, except this document. They are disposable test sources, not Supabase migrations.

- `whole-scope-publication-transaction-native-setup.sql`: guarded private fixture ledger, default-disabled test publication gate and integrity guards.
- `whole-scope-publication-transaction-prototype.sql`: session-local `pg_temp` publisher, loaded after the unchanged `whole-scope-projection-sql-prototype.sql` in each trusted test session.
- `whole-scope-publication-transaction-native-postgres-test.sql`: exact-command, authorization, replay/CAS, atomic rollback and persisted-value assertions.
- `whole-scope-publication-transaction-native-concurrency.sh`: genuine writer/read contention and two-publisher CAS, with private bounded logs and owned-process cleanup.
- `whole-scope-publication-transaction-native-vector-test.ts`: saved SQL capture/result through the unchanged strict TypeScript validator and kernel; no expected money supplied by a caller.

The parent owns workflow routing, Git and canonical source pins. Existing frozen reader, calculator, alias, fixture and workflow files must remain unchanged. The calculator owner's native parity runner is disjoint.

## Request and receipt

The session-local function accepts exactly nine fields. `schema_version` is `operations-scope-publication-native.v1`; `economic_scope_id` is a UUID; `expected_scope_revision` and `expected_composition_revision` are positive safe integers; `expected_membership_fingerprint` and `expected_composition_fingerprint` are lowercase SHA-256 strings; `expected_publication_revision` is an integer in `[0, MAX_SAFE_INTEGER-1]`; `idempotency_key` is trimmed, 12–200 characters; `reason` is trimmed, 3–1000 characters. No organization, actor, money, status, source payload, projection, function name or destination is accepted.

The test session supplies genuine JWT claims to the actual existing scope-admin authorizer. It derives organization and actor, locks current auth user/profile/admin rows and rejects a leaf review grant, missing/foreign actor or removed admin. The private default-disabled native publication gate is distinct from the unchanged read gates and is explicitly provisioned only by the guarded synthetic fixture. A production implementation would need separately approved durable enrollment and source/domain validation; this gate is not that authority.

Accepted receipt fields are `schema_version`, `outcome`, `publication_id`, `publication_revision`, `publication_fingerprint`, `evidence_fingerprint`, `historical_only`, `delivery_state`. `outcome=accepted` and `historical_only=false` describe the committed capture as of its saved observation. Exact retry returns `outcome=replayed`, `historical_only=true`, the original immutable identity and hashes; it never implies current source assignment, refreshes time, or advances a head. Receipt state is always `blocked_missing_authoritative_destination`. A reused key with a changed exact command fails `23505`; expected-head mismatch fails `PT409` without a ghost initial head or any saved rows. Replay remains subject to live admin and native gate permission.

## One transaction and source trust

1. Validate the exact request and derive the actual live scope admin. Hold the explicit native publication gate SHARE.
2. Select the exact immutable expected composition as a discovery hint, bound its captures to 1,000, derive its sorted distinct project UUIDs and lock all live member-project permissions **before** the organization barriers. This follows the unchanged manual-baseline writer's project-before-organization order. The hint is not currentness or authorization by itself; no caller member list is accepted.
3. Acquire `obligation-org:<org>` then `operations-economic-scope:<org>`. Check exact historical idempotency under these barriers and publication CAS for a new publication. Replay is also subject to the hinted projects' current live permissions. Neither barrier makes legacy relationship writers participate.
4. Under both barriers, require the actual current composition head to select the same immutable snapshot and exact project set as the preauthorized hint; otherwise fail `PT409`. No newly discovered project lock may be acquired late. The returned reader project set must match exactly before reentrant authorization checks. A private default-false test-only pause holds the already acquired project and organization locks before reader/calculator/save, solely to observe the queued-writer regression.
5. Call unchanged `operations_economy_private.read_scope_invoice_kernel_v1` with the server-derived organization and the expected canonical scope/composition tokens. This reader collects **all** distinct invoice selectors before leaf/protocol head locks and guards 100 invoices, 10,000 anchors and 1,000 selected baselines. It rechecks actual current membership, composition, permanent obligation/source ownership, current manual baselines and policies. Check each returned member again in deterministic project UUID order with the actual live project authorizer and verify organization agreement. Its returned immutable local JSON is the only calculator input. This is admin-only full canonical scope authority, never subset/alias permission. The current admin and project rows remain locked throughout the transaction. Test live member-project deletion/revocation in both orders; admin-only authorization means a member's soft deletion, rather than a subordinate review grant, is the actual project revocation control.
6. Invoke unchanged `pg_temp.prototype_scope(captured_evidence)` before releasing any transaction lock. The prototype assumes trusted reader-generated schema; it is **not** a production validator for arbitrary JSON. The actual saved SQL strings must also pass the unchanged strict TypeScript validator and equal its entire computed projection in differential tests.
7. Persist the evidence and calculated projection, actor, exact command, observation time, deterministic calculation version, purpose-prefixed canonical evidence/publication SHA-256, immutable receipt and monotonic head. Save one blocked-delivery control row in the same transaction, with NULL destination and NULL wire payload. This demonstrates atomic publication/control persistence, not an outbox capable of delivery. Injected failure after the first insert must roll back every row and the head.

The test ledger is in a guarded private native schema. Each trusted postgres test connection loads fixed local `pg_temp` functions; caller-selected functions, arbitrary SQL or dynamic calculated data are not exposed. The publisher may be session-local SECURITY DEFINER solely to exercise real authenticated claims against the actual private authorizers. It is not installed in a permanent/public schema, callable over PostgREST or reusable as a product permission boundary. No service role receives direct ledger/head mutation rights.

Evidence fingerprint bytes are `operations-scope-publication-native-evidence-v1` + LF + existing `canonical_json_v1(capture - 'as_of')`. Publication fingerprint bytes are `operations-scope-publication-native-publication-v1` + LF + existing canonical JSON of the complete immutable saved publication document without its own fingerprint. Exact request equality uses canonical JSONB field equality, preserving string values and numeric semantics after strict integer validation. Observation time is saved once and the projection retains the identical capture `as_of` value. These are test protocol domains and do not claim the proposed Finance wire is locked.

## Amount and currentness limits

Only the existing invoice-only projection is saved. Its known confirmed/preliminary partial subtotals, excluded anchors, current/historical inventory references and diagnostics are copied unchanged. A missing resolved subtotal is NULL, not zero. All category/source completeness remains unavailable, credit eligibility false, and remaining/EAC/budget/margin NULL. Time, hired personnel, Catering and credits are not silently added. Manual selected parent/leaf baselines cannot be summed as overlapping budgets.

Membership remains `as_of_graph`; receiver currentness remains `saved_receiver_heads_only`. A legacy edge writer can commit without the canonical barrier while capture is open; a later request must detect changed membership and fail. Final revalidation cannot claim phantom serialization or upstream/provider freshness. An exact historical retry cannot promote either currentness statement.

## Causal native matrix

| Case | Required observed evidence |
| --- | --- |
| Initial gate disabled; leaf grant; foreign/no actor; revoked admin | Actual authorizer/role call denies; zero ledger/head/control mutations. |
| Initial accepted; exact retry; changed key command; stale head | One immutable publication/control, original timestamp and hashes on historical replay, precise conflict SQLSTATE, no ghost head. |
| Mid-insert fault | Explicit sentinel failure rolls back publication, receipt, head and blocked control together; retry can then commit the same request. |
| Same expected publication revision, distinct commands | Observe second publisher waiting on the real organization barrier; exactly one accepted next revision, other `PT409`; no duplicated control. |
| Policy/baseline writer versus publisher in both orders | Observe actual writer advisory wait, parse genuine writer receipt; captured pre/post sources are coherent; stale baseline/composition tokens deny when appropriate. |
| Actual V1 correction and first absent V2 counterpart | Observe canonical invoice barrier waits, then higher/corresponding proof produces only the unchanged kernel's supported amount or explicit unresolved evidence; no old/new mixture. |
| Actual scope enrollment/composition versus publisher | Real canonical/organization barrier waits; stale expected graph/composition tokens deny; saved earlier publication remains unchanged. |
| Live admin/gate revoke versus publisher | Actual row-lock wait when publisher owns SHARE; revoke-before-next-call denies. No claim of revocation invalidating an already committed publication. |
| Live member-project soft deletion versus publisher, both orders | Actual project SHARE versus UPDATE contention; delete-before capture denies with no new publication/control; publisher-before deletion saves only as-of authority and next request denies. |
| Three-session queued project writer | Observe publisher paused inside its function holding project SHARE plus organization barriers; actual baseline holds project SHARE and waits on publisher organization barrier; actual project UPDATE queues behind those project locks. Publisher must finish its reentrant reader and commit, actual baseline must return accepted revision 4, then UPDATE must commit and a fresh publication must deny deleted project. No deadlock/timeout is a successful proof. |
| Legacy graph writer outside barrier | Writer demonstrably commits while publisher is alive; subsequent fresh call denies stale membership. Label the saved capture as-of, never phantom-protected. |
| Persisted calculator parity and immutability | Every raw saved capture passes strict TypeScript validation and its complete projection equals the saved SQL result; mutation/delete/truncate/rewind and direct client ledger writes fail. |

Real PostgreSQL, simultaneous sessions, exact native source head, bounded SQL/wall deadlines and all wait/state/receipt assertions are mandatory. PGlite can rehearse SQL and raw-vector parity but cannot close concurrency, hosted enrollment, full cost coverage, Finance target authority or release gates. No product publication implementation is authorized by a passing disposable experiment.

## Reproducible routing and current evidence

The new setup copies the frozen existing whole-scope native source seed (`operations-scope-invoice-kernel-native-setup.sql`, SHA-256 `d2c06e9bfe4b141444c5fcbb6b892e2c9c6835e879c93184952fc763f7bcf642`) into a separately guarded database namespace. It uses the same actual public invoice/baseline/binding/policy/scope/composition calls and source amounts. It additionally creates a genuine narrow leaf review grant for the denial case and the private test ledger; no existing fixture source is edited.

Apply this exact ordered closure to the fresh publication database before the new setup:

1. `scripts/project-economy/operations-postgres-bootstrap.sql`
2. `supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql`
3. `supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql`
4. `scripts/project-economy/operations-project-review-bootstrap.sql`
5. `supabase/migrations/20261001232438_operations_personnel_project_reviews.sql`
6. `scripts/project-economy/operations-scope-bootstrap.sql`
7. `supabase/migrations/20261002014937_operations_project_scope_enrollment.sql`
8. `supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql`
9. `supabase/migrations/20261002023731_operations_project_obligation_authority.sql`
10. `supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql`
11. `supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql`
12. `supabase/migrations/20261002025617_operations_obligation_source_policy.sql`
13. `supabase/migrations/20261002030747_operations_scope_obligation_composition.sql`
14. `supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql`
15. `supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql`

Generate the unchanged `operations-obligation-fixture.ts` JSON into an owned private file. Setup requires psql variable `fixture`, dedicated `eventflow_scope_publication_ci`, and explicit GUC `eventflow.scope_publication_isolated=synthetic-disposable`; all other native/superuser/fresh-source guards must pass. Load the unchanged calculator SQL and new transaction prototype in the **same trusted psql session** before the direct fixture. Keep both stdout/stderr private; the direct SQL returns exactly two saved raw vectors before rolling back, so the private native ledger and economic seed remain fresh for the concurrency shell.

For the concurrency shell, require `CI=true`, `EVENTFLOW_SCOPE_PUBLICATION_ISOLATED_DB=true`, explicit `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGUSER=postgres` and the dedicated database. Reject ambient `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE` and `PGOPTIONS`. The shell installs fixed bounded options itself, loads the frozen calculator and session-local publisher in every publication connection, and emits only the closed verification markers. Its intended successful result is **18** saved SQL/TypeScript publication vectors, actual writer receipts and observed authority/source waits; none has yet run in native PostgreSQL for this new transaction.

Own supplemental checks on 2026-10-02: complete actual 15-prerequisite PGlite setup/direct fixture PASS; two saved direct captures/results passed the unchanged strict TypeScript validator, complete projection and independent canonical fingerprints. The same actual writer SQL/recomposition/revocation sequence passed sequentially with 17 saved publications; all 17 saved results passed that checker. Nine adversarial saved-vector cases were rejected, including altered money, claimed EAC, duplicate member anchor, bad fingerprint, array actor, changed command identity and invented queued delivery. Bash syntax and normal Deno check passed. Eleven hostile environment cases refused before any psql invocation; an inherited foreign log path remained untouched and fake private SQL diagnostics were suppressed. PGlite rehearsals waive only the dedicated native database-name predicate inside a private in-memory harness; checked-in guards are unchanged. These are supplementary source/SQL checks, **not** genuine concurrency, hosted authorization or product activation evidence.

The recovered six-file source approval was reopened on 2026-10-02 after an independent audit found a possible queued project-UPDATE cycle in the original organization-before-project ordering. This corrected candidate uses immutable hint preauthorization before organization barriers and adds a genuine three-session causal regression. Prior sequential 17-vector evidence applies to the recovered candidate only; corrected source review and real native concurrency remain required.
