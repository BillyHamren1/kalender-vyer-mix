# Isolated authenticated obligation drilldown HTTP extension

This extends the existing native signed-JWT project evidence harness with new
files only. The original 15 cases, source fixture, controller, runner, manifests,
workflows and product mount are unchanged by this worker. Root integrates and
byte-pins the reviewed extension. This proves application authorization with
synthetic signed JWTs and actual PostgREST/database functions; it does not prove
hosted GoTrue login, device sessions, provider freshness or complete economics.

## Exact prerequisite and fixture sequence

Retain the exact original named disposable database
`eventflow_project_evidence_http_runtime`, PostgreSQL 15.19, PostgREST 12.2.3 and
Deno 2.8.1. Retain the original fresh-cluster guard, four canonical bootstraps,
15 selected migrations and actual source fixture generator. Add the actual
`20261002044751_operations_invoice_obligation_kernel_read.sql`, then
`20261002054010_operations_scope_obligation_drilldown_read_v1.sql`. The original
19-file closure becomes 21 unless another reviewed extension already supplies
these exact files. No gate/function/table shim or broad historical migration
installation is permitted.

First run and verify all original 15 signed actor cases. Only after their actual
success, run `operations-obligation-drilldown-http-fixture.sql` with the same
generated `:'fixture'` JSON and `test.project_evidence_fixture=true`. The new
guard requires the exact database, unused new synthetic namespace and the prior
journey's actual deleted root/revoked admin state. It does not restore or reuse
those mutated actors. A new synthetic admin ending199 and project-role user
ending292 have actual Auth/profile/role rows in organization ending001.

The fixture uses genuine recipient receiver, baseline, binding, scope enrollment,
composition and project grant commands. Four explicit allocation/project mappings
copy one synthetic received invoice allocation of 180000 to each of four separate
local projects. The project, large and packing selectors own distinct canonical
member sets; no project is enrolled under multiple roots. Local Booking IDs remain
TEXT fixture source-graph identities, with no inferred canonical UUID/revenue.
The packing root has an explicit `drilldown_ready` enabled status policy.

Six selectors cover project/large/packing positives, saved baseline 1000000 with
current baseline 2000000, superseded displayed composition, and actual changed
membership. The last state inserts a new real related project after capture,
rather than manufacturing a stale flag. The fixture proves a disabled read gate
denies before enabling the existing gate only inside this disposable test.
Invoice receipt enrollment finishes disabled. Existing default-off product gate
definitions and production data are untouched; root disposes the whole cluster.

The SQL emits `operations-obligation-drilldown-http-fixture SETUP PASS` and one
`DRILLDOWN_HTTP_SELECTORS=<JSON>` containing exactly schema, organizationId,
actorId and six actual returned capture/baseline selection requests. It contains
no invoice amounts, rates, raw documents or credentials. Root captures it into
`PROJECT_EVIDENCE_DRILLDOWN_SELECTORS` only after its existing isolation guard;
caller-supplied overrides remain forbidden. The journey bounds this JSON to
16 KiB and verifies exact static fixture identities and six-key requests.

## Pure fixed controller extension

`project-evidence-http-runtime/drilldown-controls.ts` exports only
`drilldownFixtureGuard`, `drilldownMutations` and `drilldownStateSql`. It performs
no environment lookup, SQL execution, network access or source mutation itself.
Root's existing bounded child/transaction wrapper applies the fixed database and
fixture guard, then requires exactly one changed row for each literal mutation.
The module accepts no caller SQL, identity, organization, table, amount or source
command. Root extends its exact path/method whitelist without weakening old tests.

| Path | Fixed operation |
| --- | --- |
| `GET /drilldown/state` | Actual evidence table counts and exact database name |
| `POST /drilldown/move-admin-org` | Admin199 profile expected org001 → actual foreign fixture org099 |
| `POST /drilldown/restore-admin-org` | Same profile expected org099 → org001 |
| `POST /drilldown/delete-project-a` | Only live local root/project117 in org001 → soft deleted |
| `POST /drilldown/revoke-admin` | Only admin199/org001 actual admin role removed |
| `POST /drilldown/revoke-packing-policy` | Only org001/drilldown_ready enabled true → false |

New POST bodies are exactly `{ "fixture": "project-evidence-drilldown-http-v1" }`;
the existing private `x-project-evidence-control-token` authenticates the fixed
disposable controller, not production read requests. Successful mutation replies
are exactly `{ "status": "accepted", "operation": "drilldown/<operation>" }`.
State has exactly databaseName, cateringPublications, cateringObservations,
cateringOutbox, invoiceSnapshots, baselines, bindings, sourcePolicies, compositions.
Before/after counts must match. Intentional profile/role/root/policy controls are
fixture authorization mutations, not evidence writes; no primary invoice,
official cost, payment, provider or customer billing command is invoked.

## Actual authenticated journey

`operations-obligation-drilldown-http-journey.ts` uses actual HS256 fixture JWTs
with role authenticated and the real subject; no decorative org claim or
service-role read header. The existing ephemeral distinct 32-byte-minimum JWT
and controller secrets are reused only inside the guarded local runtime. Every
production call uses the actual public RPC and new strict response validator.
Only the two genuine reader RPC names are allowed. Fixed control calls cannot
replace the application reader. URLs are bare loopback origins, redirects fail,
PostgREST/control ports must be exactly 55610/55611 respectively before any
credential is signed/sent; requests/bodies have a 15-second deadline, 2 MiB/4096-chunk response cap and fatal
UTF-8 decoding; no raw secret/body/error is logged.

The exact 18 case markers are:

1. drilldown project root copied individual invoice
2. drilldown large root copied individual invoice
3. drilldown packing root copied individual invoice
4. drilldown unavailable categories and null prognosis
5. drilldown changed baseline preserves saved amount and null sources
6. drilldown superseded displayed composition returns PT409
7. drilldown actual membership change returns PT409
8. drilldown unselected obligation returns PT409
9. drilldown caller actor field is rejected
10. drilldown foreign live profile actor denied
11. drilldown actual project grant does not confer scope admin
12. drilldown signed missing actor denied
13. drilldown HS256 signature genuinely checked
14. drilldown live profile org change invalidates old tuple
15. drilldown live packing status policy revoke denied
16. drilldown deleted actual project root denied
17. drilldown revoked live administrator denied
18. drilldown reads and metadata controls preserve evidence ledgers

Every marker is `{ "case": "<exact name>", "result": "PASS" }`. Final output
is exactly `{ "result": "PASS", "cases": 18, "scope": "native signed fixture
JWT/PostgREST one-obligation authorization; received evidence only" }`.
Business conflicts require actual HTTP409 plus SQLSTATE PT409, not serialization
retry 40001. Actual denial requires HTTP403/42501, unknown caller actor field
HTTP400/22023, tampered signature HTTP401. The project-role user's real saved
grant first permits the Catering project reader, then the scope admin drilldown
must deny: a valid project grant cannot be mistaken for administrative authority.

Supplementary Deno 2.8.1 type checks pass the new journey and pure controls.
Embedded PGlite actual publisher/receiver/admin preparation and new strict client
validate all three root amounts, baseline preservation and both PT409 states;
that supplement excludes the named native/previous-HTTP guard and is not a native
JWT/HTTP/concurrency result. Source review, root wiring and exact native execution
remain open. Frozen product drilldown, kernel and original 15-case proof are
separate gates; successful earlier HTTP cases cannot certify this new endpoint.
