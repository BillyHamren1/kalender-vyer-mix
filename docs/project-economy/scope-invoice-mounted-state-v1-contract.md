# Isolated fourth-view state protocol

This TEST-only contract prepares the actual App scope-invoice view. It does not authorize a product read entry, enable a feature, supply a publisher, or claim native/browser acceptance. Existing COST47, original mounted16, blocked exit78 skeleton, controller and public read ABIs remain unchanged.

## Actual source inventory

The financial inventory is the exact 47 tables from `operations-project-cost-mounted-state.sql`, plus `public.operations_scope_invoice_kernel_read_gates` created by genuine migration `20261002052436_operations_scope_invoice_kernel_capture.sql`. This table has `organization_id uuid primary key` and `enabled boolean not null default false`. Migration61253 creates the authenticated exact4 request/exact3 response wrapper; draft130228 creates compatible admission functions and changes grants, without creating a table. A future source revision that adds economic tables requires a reviewed inventory update; this contract is not an assertion that an unreviewed future migration contains no tables.

The old financial rows include whole composition/baseline/policy/current-head captures, received invoice/credit records, native Catering and personnel evidence, outbox/route/mapping/review records and the existing legacy purchases/budget/billing/time/labor rows. Hashes cover full rows, including mutable pointers and state, not just counts. They return no raw records or money. Whole-project EAC, current upstream source coverage, provider completeness and Finance whole-scope receipt authority remain unavailable.

## Exact wire

Schema: `operations-scope-invoice-mounted-state.v1`. Database: `eventflow_project_evidence_http_runtime`. Response has exactly nineteen fields:

- `schema`, `databaseName`.
- Fourteen safe integer counts in this fixed order: `cateringPublications`, `cateringObservations`, `cateringOutbox`, `invoiceSnapshots`, `baselines`, `bindings`, `sourcePolicies`, `compositions`, `personnelPublications`, `personnelStreams`, `personnelOutbox`, `personnelReviews`, `reviewGrants`, `scopeInvoiceReadGates`.
- `legacyPurchasesFingerprint`, `tableFingerprints`, `stateFingerprint`.

Counts must be 0..1000. `tableFingerprints` is exactly the C-sorted 48 names exported by the NEW helper. Every fingerprint is a lowercase64 SHA256 string. The legacy fingerprint must equal the `project_purchases` table fingerprint. Extra fields, a missing gate, an old COST47 schema, strings pretending to be counts and unknown tables are errors.

The PostgreSQL row hash uses `operations-scope-invoice-mounted-row.v1`, table name and full `to_jsonb(row)::text`, separated by newline. The table hash uses `operations-scope-invoice-mounted-table.v1`, table name, row count and C-sorted row hashes, retaining duplicate rows. Row/table hashes are opaque same-server values, not cross-language semantic source evidence hashes.

The outer SHA256 preimage is compact UTF8 JSON of this six-position tuple:

```json
["operations-scope-invoice-mounted-state-proof.v1", "operations-scope-invoice-mounted-state.v1", "eventflow_project_evidence_http_runtime", ["fourteen ordered integer counts"], [["C-sorted table name", "opaque table hash"]], "legacy purchases hash"]
```

The example count placeholder describes the type; production preimages contain actual numbers, with no whitespace. PostgreSQL assembles exact positional compact bytes using `to_json` for strings. Node recomputes them using `JSON.stringify`. It never hashes PostgreSQL `jsonb::text` using JavaScript's different object formatting.

## Read and resource boundary

NEW SQL is a fixed private read, not a migration/function/public RPC. It requires the exact disposable database and existing synthetic actors/project1017/bookingNULL/purchase fixture. No caller can submit a table, predicate or SQL statement. A single financial `WITH ... SELECT` captures all 48 tables in one MVCC statement; private guard checks do not supply economic hashes. Each table reads at most1001 rows and fails closed if count exceeds1000. A row may serialize at most2MiB and all rows at most16MiB; any exceeded cap yields no valid state. Statement3s, lock1s and idle-transaction5s bounds are preserved. No financial writes or foreign sessions are created by the state query.

Future integration must be a separate fixed private control path, protected by the existing strict disposable named-database/controller credential/runtime bounds. The old controller and old `/project-cost/state` endpoint must retain their existing protocol. This first source slice does not install a control endpoint.

## Meaningful negatives and limits

The private native-negative protocol requires seven newline records: actor counts before; financial state before; isolated same-count whole-gate change; isolated same-count personnel stream/head change; restored financial state; actor counts after; financial state after full rollback. Actor counts are exactly auth users/profiles/roles and must remain equal. Each mutation must change only its named table hash and the outer hash, preserve all counts, and both restored states must match the original compact preimage.

The composition-head update guard requires a real next immutable composition. This test must never disable that trigger or invent an accepted composition to manufacture a same-count mutation. Composition heads are still hashed in full; their guarded writes require a genuine writer fixture and an explicit post-write checkpoint rather than a false unchanged-state claim.

Node protocol tests and embedded PostgreSQL-compatible supplementation are source/rehearsal evidence only. The embedded supplement substitutes its own database name strictly inside private analysis, since that engine cannot create this native named database. Canonical fresh PostgreSQL15.19, actual PostgREST, genuine compatible product entry source/ACL/queued-writer/API/JWT proofs, real compiled App, strict read forwarding and final owned cleanup are independent gates. The fourth App mode remains BLOCKED and exit78 until those gates and root-owned exact source closure are approved. No environment value can promote this protocol into readiness.
