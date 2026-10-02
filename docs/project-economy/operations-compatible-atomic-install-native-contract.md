# Compatible reader atomic-install disposable test contract

This is a new test-only design. It does not apply hosted DDL, replace frozen migrations or establish actual installer/provider privileges. The current hosted candidate remains absent. The approved prerequisite query found all five measured facts true; there is no observed hosted partial installation or prerequisite discrepancy. The new native test will prove bounded, per-migration installation atomicity on a fresh disposable PostgreSQL 15.19 schema only.

## Owned source boundary

New paths are this contract and `scripts/project-economy/operations-compatible-install-native-setup.sql`, `operations-compatible-install-native.py`, `operations-compatible-install-native.guard.test.py` and `operations-compatible-install-native-closure.json`. Parent owns Git/workflow routing; no existing migration, native runner, closure, API, query, UI or gate is edited. Exact candidate sources are full commit `91ee5b68d76d078941e99f9fc09436ca4dd642a6`; the assessment documents genuine remote/local Git and SHA256 parity for the two compatibility migrations and admin predecessor.

The closure includes all 23 ordered paths from frozen `operations-scope-compatible-read-native-closure.json` SHA256 `7afa5082e3c118ffe318e7699a55b1e70d3561b00da006525c35828e0f9a95cb`, followed by genuine `61253` SHA256 `6835726268be0809e2eef57075d6c794712ecbb44ced1e22399da0aa1cb4bca3`. Exact install targets are `130228` SHA256 `2bd6d7ba1dcd0edc052bb45c4abb4f5458be7d624472b115b8ba20e15e1921b8` and `145349` SHA256 `7cf7c89308ef4b021a344f3586697123b9d182338750c833d11e82c42dd0addd`. These bytes are never stripped, rewritten or nested blindly.

The 23-path baseline is synthetic: four bootstraps, eighteen migration files and one transport seed. It is not a hosted installation plan or a complete production catalogue. The new guarded setup adds only the faithful role FK and named role/organization unique index already modeled by the existing permission fixture; actual profiles/auth/role identities and typed prerequisites are checked before any setup DDL. It does not import the old TEST publication ledger, invent monetary rows, activate a read gate or install an auth provider. Known production caller/owner families absent from this selected closure remain outside the proof.

## Isolation and privacy

Use one fresh independently provisioned cluster and exact named database `operations_compatible_install_runtime`, PostgreSQL 150019/UTF8, loopback127.0.0.1:5432, authenticated fixture superuser postgres, `CI=true`, the exact repository/run provenance and `EVENTFLOW_COMPATIBLE_INSTALL_ISOLATED_DB=true`. Reject ambient PostgreSQL service/address/options, proxy, Python/bash/node/loader injection overrides before children. Reject existing user/domain objects before bootstrap, and reject foreign synthetic identities or a pre-existing install-control namespace before setup.

Use closed output phases/SQLSTATE/markers only. Raw SQL, bodies, row values, exception text and unrecognized diagnostics stay in bounded owned0700/600 logs. All connections, statements and children have bounded deadlines; cleanup verifies owned resources and preserves private diagnostics if cleanup fails. No network service, customer action, invoice, approval, payment, email or arbitrary dispatcher is invoked. Failure tests are real psql/PostgreSQL transactions, not PGlite or mocked SQL execution.

## Genuine transaction boundaries

The accepted first-two native success/queue suite does not certify its installation-failure rollback: its psql uses ON_ERROR_STOP without --single-transaction, and `130228` has no outer BEGIN/COMMIT. This is a scoped proof gap, not evidence of a defective hosted migration runner.

Execute exact `130228` bytes between explicit external BEGIN and COMMIT. Execute exact `145349` as its own script: it already contains BEGIN/COMMIT, so no external transaction is opened around it. Use a separate child/session for each operation. This contract deliberately proves two per-migration boundaries; it does not claim the combined multi-file bundle is one atomic transaction. A later `145349` failure must preserve the already committed `130228` baseline rather than silently reverse it.

| Phase | Expected result | Required unchanged/new state |
| --- | --- | --- |
| Initial baseline | Real selected23+61253 and faithful role constraints installed | No new130228 helpers; no145349 namespace; original public APIs/ACLs retained. |
| 130228 causal late failure | Exact controlled SQLSTATE/message, nonzero child exit, connection closed | Initial baseline full catalogue and business/gate state restored; zero five new130228 helper functions and zero public routing/ACL delta. |
| 130228 exact successful install | Commit success and exact expected delta | Five new private helpers, two public routes and restricted old-core grants match frozen source; no business/gate state change. This is baseline2. |
| 145349 causal late failure | Exact controlled SQLSTATE/message, nonzero child exit, connection closed | Baseline2 catalogue and business/gate state restored; no new remaining-reader namespace, six public routes or client old-core ACL delta. |
| 145349 exact successful install | Its own COMMIT succeeds and exact expected delta | Thirteen new private functions plus the six exact public wrappers/role/config routes and client old-core revocations match frozen source; no business/gate state change. |

Zero new entries means zero changes relative to the respective pre-install baseline. Existing foundational economy/invoice schemas and old readers intentionally remain; claiming all candidate namespaces disappeared would be false.

## Causal mid-DDL failures without changed source

A test-only event trigger runs at ddl_command_end and is active only for a session's exact failure target. Its handler uses SELECT-only catalogue predicates, no dynamic EXECUTE, no named old-core call, no money, no actor switching and no arbitrary caller. Private setup/handler permissions remain denied to anon/authenticated/service_role. The installed source guards must pass normally with this known test control present; no arbitrary caller/dynamic guard waiver is permitted.

For `130228`, fail after its CREATE OR REPLACE of the public admin wrapper. Before raising, independently assert all five new private helpers already exist, the earlier service public wrapper already routes to the new compatible entry, and the currently created admin wrapper is also the new route. This proves real earlier DDL happened inside the transaction. A missing prefix is an unexpected fixture failure, not the accepted injection marker. The controlled failure occurs before final old-core client revocations and the external COMMIT.

For `145349`, fail after CREATE OR REPLACE of the fourth public wrapper, the invoice obligation kernel reader. Before raising, assert the new remaining-reader schema and all thirteen new private functions, the earlier parent/drilldown/composition replacements and the current fourth replacement. This proves genuine earlier namespace/function/grant/routing DDL occurred inside the migration's transaction. The original and policy replacements plus final old-core revocations/COMMIT have not completed. Again, an absent/wrong prefix cannot count as the expected injected failure.

The handler raises only a fixed owned failure SQLSTATE/message after these assertions. The runner requires both that exact private classification and a nonzero process exit. Timeout, deadlock, failed preflight, missing function/privilege, unexpected success or a general exception cannot substitute. The failed transaction is closed before independent post-failure catalogue/state collection.

## Complete bounded comparison

Capture each baseline's full selected API/function/schema/type/relation/index/constraint/owner/config/body-hash/ACL metadata, including effective anon/authenticated/service privileges, and hashes of every selected public/auth fixture row and read/delivery gate. The actual metadata and all row hashes share one READ ONLY REPEATABLE READ transaction; its exact bounded table set is rechecked against prior identifier discovery before collecting values. Use stable signatures/identities and ordered hash preimages; do not mistake rolled-back internal OID allocation counters for a committed semantic catalogue change. Metadata/data caps fail closed rather than omit objects. The test control objects are included consistently in before/after fingerprints; session injection settings are ephemeral.

No new installed generic dynamic hashing function is allowed: it could alter `145349`'s audited dispatcher closure. The runner may issue bounded SELECT-only hash statements over an independently captured, allowlisted fixed identifier set, or use explicit fixed unions. No unknown function is invoked. Source bodies/records may be read only inside this synthetic test for hashing and never emitted publicly.

After successful phases, allow only the exact frozen creation/routing/config/ACL delta and compare all other baseline metadata plus every business/gate row. Verify old API signatures/argument names/result shapes/allowed roles, new private client restrictions and old owner recursion are preserved. The suite does not certify absent hired/credit/containing owner paths or the complete generated/extension/dynamic production catalogue.

Only after actual native execution and independent acceptance can this close per-migration disposable installation atomicity. Hosted migration runner/installer identity, managed provider privileges/JWT/RLS, full installed caller graph, wider commands and release/activation remain separate gates. No successful test opens a cost/Finance admission gate or promotes observed/as-of source evidence into full economic authority.
