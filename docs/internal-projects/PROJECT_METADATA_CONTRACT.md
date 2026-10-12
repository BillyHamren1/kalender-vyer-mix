# Operations internal-project metadata producer v1

Status: implemented locally in additive migration `20261012150947_internal_project_metadata_outbox.sql`; not applied or transported. This closes the missing prospective metadata producer implementation only. Finance enrollment, frozen-budget snapshots, source-cost acceptance, transport and release remain open.

## Source and envelope

The source is the existing `public.projects` row. The AFTER trigger writes one immutable outbox receipt in the same transaction as its source mutation. A failed task in `create_internal_project_atomic` or a failed receipt insert rolls the entire source change back. No new project registry, money ledger, commercial booking or Finance fact is created.

Each row binds `source_project_id`, `source_organization_id`, monotonic safe-integer `revision`, `schema_version = operations-project-metadata.v1`, `operation = upsert|delete`, `metadata`, SHA256 `fingerprint` and database `captured_at`.

`metadata` contains the effective `project_kind`, exact nullable `declared_project_kind`, `legacy_is_internal`, existing nullable `booking_id`, nullable integer `budget_cost_minor` and nullable `budget_currency`. Unknown budget is NULL; explicit zero is retained. Metadata uses the existing validated source fields. It contains no rates, personnel costs, invoice facts or calculations.

The fingerprint is SHA256 of UTF-8 PostgreSQL `jsonb::text` for `{schema, source_project_id, source_organization_id, revision, operation, metadata}`. `captured_at` is audit context, not semantic input. A future signed transport must preserve this envelope and use its own exact raw-body digest; ordinary JavaScript JSON serialization is not the PostgreSQL fingerprint encoding.

## Compatibility and ordering

- Ordinary customer and legacy-null customer mutations produce no outbox receipt and retain their existing behavior.
- Legacy Lager stays nullable-classification legacy Lager. Its effective `internal_activity` is an observation derived from existing `is_internal`; it is **not explicit Finance enrollment authority**. A receiver must check `declared_project_kind` and the approved source mapping.
- Repeated unchanged metadata and unrelated name/follow-up edits emit no new revision. A budget correction emits a new revision and keeps every previous receipt.
- Changes between explicit internal subtypes are recorded as source observations if the existing source rules permit them. This does not authorize Finance classification conversion; Finance must reject/quarantine incompatible classification after enrollment.
- Source identity/tenant changes are rejected for internal tracked projects. Delete emits a tombstone. Reinsert under the same UUID preserves sequence and tenant; resurrection as a customer or another tenant is rejected.
- Source UUID uses the existing atomic-creation advisory lock domain (seed 173). Native overlapping-session lock/deadlock acceptance remains open; the local embedded database serializes requests.
- No backfill runs. Existing projects acquire prospective provenance on their next successful mutation, never invented historical budget provenance. No population-completeness claim follows from a nonempty outbox.

## Privileges and activation

Outbox enables RLS. Only `service_role` may SELECT; app/anonymous roles cannot read and no application role may append, mutate or truncate it. A revoked SECURITY DEFINER trigger captures changes after the original source statement has passed its existing RLS/permissions. The caller cannot submit a receipt, actor, tenant, revision or hash. Direct trigger-function calls are revoked. Owner-level UPDATE/DELETE/TRUNCATE also have append-only guards. Source TRUNCATE is denied when it would bypass internal deletion receipts; ordinary scoped DELETE remains available under existing source policy.

There is no dispatcher, subscription, Edge handler or Finance writer. Accepted Finance mapping must bind exact source tenant/project to an enrolled Finance tenant/project, reject stale/conflicting replay and commercial lineage, and freeze the accepted budget revision on financial close. Budget metadata must never lift the separate missing-cost/source-coverage close guards. Only the existing Finance canonical writer may mutate financial facts.

Parent-controlled activation requires current-head CI and independent review, full hosted schema/RLS and overlapping transaction tests, reviewed transport and enrollment, and authenticated UI acceptance. Migration rollback should disable the three source-capture objects (row trigger, source truncate trigger, capture functions) only through a reviewed release; retain append-only receipts. A capture outage creates a provenance gap requiring explicit reconciliation before restart, not silent reuse as complete history.

## Local evidence

`PGLITE_MODULE=/tmp/internal-project-db/node_modules/@electric-sql/pglite/dist/index.js node scripts/internal-projects/project-metadata-outbox.test.mjs` runs the actual classification, atomic-create and metadata migrations against a synthetic role/RLS fixture. Twelve scenarios cover atomic creation/retry, failed-task rollback, no-op dedupe, changed/unknown budgets, forced outbox failure, tenant/role denial, service read-only, privileged immutability, tombstone/reinsert, resurrection denial, legacy/customer compatibility and standalone old-internal/new-customer identity bypass. This is synthetic PostgreSQL-WASM evidence, not hosted, concurrent or signed-in runtime proof.
