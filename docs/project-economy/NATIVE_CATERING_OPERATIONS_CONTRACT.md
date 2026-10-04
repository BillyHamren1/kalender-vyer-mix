# Native Catering → Operations shadow contract

This additive path reads native Catering time entries through its protected TanStack server route and stores immutable Operations observations/publications. Both source and destination boundaries are disabled by default. It changes no payroll approval, Billing, Fortnox, existing cost totals or live source record.

## Identity and authority

| Concern                   | Durable identity or authority                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Source person             | Explicit Catering organization/person → Operations organization/worker binding                               |
| Source time               | Genuine Catering entry ID and current integer entry version                                                  |
| Source review             | Original immutable Catering review ID and exact before/after payload                                         |
| Cost stream               | `catering:<source organization UUID>:<native entry UUID>`                                                    |
| Allocation                | Explicit enabled native entry/workplace/date/timezone → Operations project/obligation mapping                |
| Project scope             | Existing Operations project organization and `deleted_at IS NULL`, locked during publication                 |
| Source authorization      | Dedicated ES256 purpose/audience/key, exact body/org/person/entry/version, source persistent nonce           |
| Destination authorization | Dedicated internal ingest secret, Operations service credential, tenant publish gate and enabled binding/map |
| Financial decision        | Operations project review, independent from Catering payroll/source review                                   |
| Finance delivery          | Parked outbox only; no native receiver/dispatcher is activated                                               |

The handler accepts only `operations-catering-ingest.v1`, `time-entry.ingest`, Operations organization/worker, native time-entry ID and expected source version. Callers cannot supply source documents, rates, allocations or project decisions. Database credentials stay within Operations; the Catering request carries only its dedicated source service proof.

The public publisher RPC is a service-only SECURITY INVOKER wrapper around a narrow private SECURITY DEFINER body with an empty search path. This permits the real project row lock without granting service-role project UPDATE. Application roles cannot call either publisher or edit native evidence. Source bindings and mappings preserve their identity; only explicit enable/disable is mutable. Stream identity is fixed and revision advances once. Observations, publications and parked outbox are append-only.

## Cost and version rules

Operations calls the existing native Catering evidence adapter and shared historical personnel rate/rounding helpers. Finance does not recalculate. Absent rates remain `amount_minor = null`; no zero fallback is created.

A new persisted pending source entry is preliminary project cost. Source payroll approval does not confer project confirmation. Existing Operations confirmation or rejection survives a later source version only when the complete economic tuple is identical: organization/worker/project/obligation/currency/date/timezone/native source identity/minutes/captured rate/amount/coverage. Genuine economic changes return to preliminary. Global source rejection stays rejected.

Same-date versions use the previously captured rate revision and amount basis. A missing captured rate remains unavailable across payroll-only versions. An absent saved complete rate fails closed. Same source version with different raw bytes, review evidence or mapping fails; exact polling replay does not overwrite a project decision. Currency and cost-stream identity cannot change.

Raw source and review bytes are stored with exact SHA256. Their source fingerprints are independently recomputed from parsed canonical source documents in SQL. The initial supported native schema has lowercase ASCII SQL column keys and safe integer numeric fields; future unsupported JSON shapes fail closed. A genuine native-row fixture has the same canonical fingerprint in the actual TypeScript helper and SQL. Source bytes and canonical fingerprints are distinct fields.

## Evidence and remaining gates

The isolated TypeScript tests exercise actual builder, service-proof signing, HTTP handler and database client with synthetic schema-shaped source responses. Existing Catering/Time economics tests also pass. The scoped PostgreSQL fixture rehearses default-off gating, pending publication, a seeded saved project decision, payroll-only confirmation preservation, economic correction, captured-rate preservation, exact replay, raw collision, immutable history and forbidden application publication/direct legacy project mutation. It runs with the actual historical-rate interval guard; its later rate has a nonoverlapping interval.

PGlite rehearsal is not native PostgreSQL, deployed HTTP, concurrent transaction or human attest proof. The seeded project decision is explicitly not an authenticated human action. Current source linkage and source service approval do not mean the whole Catering integration is complete.

Still required: native PostgreSQL/full current schema CI; actual protected-source HTTP → Operations durable end-to-end/concurrency evidence; explicit enrollment/history/deactivated-person UI; an authenticated native Operations project-review ledger/publication writer; native Finance receiver/transport; project-view history/coverage presentation; guarded deployment and real authorized runtime validation. Ingredient/purchase/stock valuation coverage remains separate and unavailable where genuine price/movement/project relations are missing.

## Isolated database fixture order

Use a fresh isolated database only:

1. `scripts/project-economy/operations-postgres-bootstrap.sql` (roles).
2. Existing Operations full source schema, or the narrow `operations-catering-bootstrap.sql` for the real project columns.
3. `20261001220652_operations_personnel_cost_evidence.sql` (existing shared immutable rates).
4. `20261001235558_operations_catering_project_evidence.sql` (native shadow evidence).
5. Existing `operations_economy_private` schema and `20261002003928_operations_personnel_historical_rate_admin.sql` (actual future interval guard).
6. `scripts/project-economy/operations-catering-postgres-test.sql` (isolated transaction, rolled back).

No migration or fixture execution against hosted production is part of this delivery.
