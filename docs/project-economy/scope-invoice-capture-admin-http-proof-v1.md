# Read-only authenticated scope invoice HTTP proof

This is a new isolated proof extension for the source-approved admin read API.
It does not mount a UI, activate a source gate, mutate project/economic evidence
or change the existing ProjectEvidenceController and its database namespace.
Actual native execution remains required; source review is not HTTP evidence.

## Source and runner ownership

The extension contains only:

- `operations-scope-invoice-capture-admin-http-role.sql`: guarded disposable
  connection role and a test-only, read-only state-fingerprint RPC.
- `operations-scope-invoice-capture-admin-http-journey.ts`: actual signed fixture
  JWT, default fetch, PostgREST, new app loader/parser and frozen Operations
  scope/leaf projection.
- This proof contract.

Root owns the actual workflow, isolated server startup, source manifest, pinned
PostgREST image and PostgreSQL version, connection cleanup and CI evidence.
No existing runtime/controller/job files are changed by this extension. Its
minimal client adapter sends each RPC through actual HTTP; it does not inject
responses, replace database handlers or reconstruct financial evidence.
The local session context is the actual signed fixture token offered to
PostgREST. It models browser lifecycle, not a replacement for Supabase Auth.

## Dedicated guarded order

1. Create a fresh native `eventflow_scope_invoice_kernel_*` database using the
   existing frozen scope-job isolation contract. Apply its exact fifteen-file
   closure, then `20261002061253_operations_scope_invoice_capture_admin_read.sql`.
2. Run the unchanged frozen scope native setup under its exact isolated GUC and
   fresh synthetic guards. The current seed contains two actual invoices, three
   real positive allocation bindings across two projects/bookings, three manual
   baselines and one explicit composition. Source gates are enabled only by this
   already reviewed disposable fixture.
3. Run the new admin rollback-only SQL fixture and its four actual SQL vector
   verifier if not already executed. The fixture's outer rollback preserves
   the seed for subsequent proofs.
4. Run the new HTTP-role SQL as postgres with the same isolated GUC. Its guard
   checks the disposable database prefix, superuser, exact source heads/counts,
   genuine synthetic admin and absence of its own connection role before any
   DDL. It creates only `scope_invoice_admin_http_authenticator`, with noinherit,
   nosuperuser, nocreatedb and nocreaterole, and fixture-only password
   `synthetic-scope-invoice-http-only`. It can SET ROLE to the existing anon,
   authenticated and service_role test roles; it cannot remain postgres.
5. Start pinned PostgREST on loopback port 55406 with that dedicated connection
   role/database, public schema, anon role `anon` and an ephemeral JWT secret.
   Do not reuse an existing signed-in/hosted session or allow a remote URL.
6. Run the new journey with these exact variables:

| Variable | Required value |
| --- | --- |
| `CI` | `true` |
| `EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_ISOLATED` | `true` |
| `PGDATABASE` | The exact fresh `eventflow_scope_invoice_kernel_*` name |
| `EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_BASE_URL` | `http://127.0.0.1:55406/` (equivalent loopback host accepted) |
| `EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_JWT_SECRET` | Ephemeral UTF8 secret of at least 32 bytes, matching only this PostgREST server |
| `EVENTFLOW_SCOPE_INVOICE_ADMIN_COMPOSITION_SNAPSHOT_ID` | Root's actual immutable composition UUID selected from the seeded database |

`PGHOSTADDR`, `PGSERVICE` and `PGSERVICEFILE` must be unset. Every isolation and
identity check precedes network use. The root runner must retain its established
native psql/host/port/user/GUC guards; this Deno journey never invokes psql.
Signed HTTP requests use `redirect: 'error'`, so a redirect cannot forward the
fixture JWT. A single monotonic 15 second request budget covers fetch, every
stream read, UTF8 decode and JSON parse. Replies are capped at 256 KiB/4096
chunks, empty chunks do not enter the payload, and cancellation is not awaited
on an invalid, expired or oversized reply.

7. After the journey, stop/reap the owned HTTP server under bounded root cleanup,
   then run the unchanged existing scope concurrency shell. The HTTP proof must
   leave that shell's entire economic/graph/source/baseline fixture unchanged.

## Actual state proof

The test-only `operations_scope_invoice_admin_http_test_state_v1()` exists only
in the guarded CI fixture SQL, never in a product migration. It requires the
actual synthetic authenticated admin and returns the real database name, fixed
initial source counts and a SHA256 of deterministically ordered complete rows
from auth/profile/role, root/booking/join/policy, invoice v1/v2, manual obligation,
binding/ownership/policy, scope/composition, source gate and native fixture tables.
It returns no raw rows, PII, invoice payload or secret. The journey requires the
same exact state fingerprint before and after all reads and denials, and requires
the actual reported database name to match its independently supplied namespace.

The journey uses genuine signed JWT claims for the actual app read. It proves:

1. Actual copied split subtotal 541000 minor units from three legitimate
   allocation anchors/two invoices, with unsupported personnel baseline retained
   and category/remaining/EAC/budget/margin unavailable.
2. The exact four-field caller request and captured token through actual loader.
3. Caller organization rejection.
4. Caller source selector rejection.
5. Nonstring identity rejection.
6. Actual foreign-project authorization denial.
7. Stale displayed composition PT409 and actual loader discard.
8. Signed missing-actor denial.
9. Anonymous denial.
10. Service-role denial for this authenticated app boundary.
11. Genuine wrong-signature JWT denial.
12. Same signed JWT with changed local view actor: real RPC result discarded.
13. A final independently validated current capture.
14. Real dedicated database identity and identical complete fixture fingerprint.

The final marker is `operations-scope-invoice-admin-http PASS TOTAL 14`.
No gate, actor profile, graph, source publication, policy or baseline is changed
by the journey. It calls only the actual read API and guarded test-state RPC.

## Evidence limits

Deno type checking and hostile pre-network refusal checks are source evidence.
A supplemental PGlite rehearsal can compile the disposable role/state SQL and
prove read-state hashing, with in-memory native database guards/CONNECT grant
omitted because PGlite lacks the native database environment. That does not prove
native guards, connection role startup, JWT, PostgREST or HTTP. Those must run at
the exact committed source in the fresh native job. Preview, DOM, upstream
currentness, complete category costs and release remain separate gates.
