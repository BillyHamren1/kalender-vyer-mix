# Project-cost mounted state: fixed private contract v2

Proposal only, 2026-10-02. Root owns existing controller/runner/config and any implementation capture. Source analysis uses Operations `d4d51f7a53476703149f6568c0f5910f4fd1e04c`, its exact21 selected schema closure, the genuine mounted bootstrap and the new test-only fifth driver. No existing controller, runner, browser allowance or product source is changed by this document.

Current `drilldown/state` has eight economic counters **plus databaseName**, nine JSON keys. Adding five personnel counters and a purchases fingerprint produces the fifteen-key first proposal. Counts alone cannot detect a modified mutable stream head, lease/receipt or legacy amount. Preserve the existing endpoint and old sixteen mounted cases unchanged. Use a separate private, typed `GET /project-cost/state` for the fifth mode and an eighteen-key v2 response.

## Endpoint, isolation and authority

The sole new endpoint is `http://127.0.0.1:55611/project-cost/state`, GET only, no body, query, fragment, username/password, transfer-encoding or nonzero content-length. It uses the existing private `x-project-evidence-control-token`, exact named database `eventflow_project_evidence_http_runtime`, root-owned namespace/fresh cluster/daemon, bounded child process and existing private diagnostics. No new financial/public RPC, service credential in the browser, caller table/SQL/tenant/actor input, role grant, stored function, provider call or user-data write is created.

The new state guard reuses the exact disposable fixture guard and additionally requires project1017 in org1 with bookingNULL, synthetic purchase1030 belonging to project1017, auth user199 and project member292 with their declared profiles. Profile199 may be org1 or the exact foreign fixture99 while testing the fixed org-change control. Its admin role is deliberately allowed to be absent after the genuine revoke case. Guard checks identity/belonging, **not** expected cost700 or a source head revision: altered money must reach the fingerprint comparison rather than disappearing behind a false fixture-shape success. The browser still asserts actual legacy700 separately.

Auth/profile/user_roles are excluded from financial fingerprints because fixed controller controls intentionally modify those authority rows. Ordinary projects/graph rows are not claimed covered by this v2 financial-state contract; live authorization/target deletion/membership are separate assertions. The forty-seven listed economic/configuration tables are covered in full. No physical PostgreSQL tuple/xmin/audit or external provider absence is inferred from a row-content hash. Evidence is unchanged economic state over the exact captured tables plus actual read-only source boundaries and strict absence of admitted browser writes.

## Exact response/schema

The current fifteen-key driver's validator and `/drilldown/state` call remain frozen pending a separately reviewed narrow fifth-driver update. It must reject the new response until that update lands; no permissive optional key or legacy fallback.

```ts
interface ProjectCostMountedStateV2 {
  schema: 'operations-project-cost-mounted-state.v2';
  databaseName: 'eventflow_project_evidence_http_runtime';
  cateringPublications: number;
  cateringObservations: number;
  cateringOutbox: number;
  invoiceSnapshots: number;
  baselines: number;
  bindings: number;
  sourcePolicies: number;
  compositions: number;
  personnelPublications: number;
  personnelStreams: number;
  personnelOutbox: number;
  personnelReviews: number;
  reviewGrants: number;
  legacyPurchasesFingerprint: string;
  tableFingerprints: Record<ExactlyThe47ListedTableNames, string>;
  stateFingerprint: string;
}
```

Exactly eighteen keys. All thirteen counts are safe nonnegative integers and bounded by the accepted fixture-table cap; they are row counts, not zero-cost/budget substitutions. Every fingerprint is exactly lowercase64-hex. `tableFingerprints` has exactly the literal47 keys below, no omitted/optional/new names. `legacyPurchasesFingerprint` equals the `project_purchases` table fingerprint. `stateFingerprint` binds schema, databaseName, all thirteen named counts and all47 fingerprints. The response excludes generatedAt/asOf so two unchanged captures compare exactly. Browser code compares the validated complete object before and after each neutral interval; malformed/missing/hash-mismatched state is failure, never an empty-state default.

## Source-backed table inventory and counts

These are actual tables of old21 plus the isolated mounted UI bootstrap. Whole-reader52436 is absent from old21 and is not invented here. Fourth mode must receive a separately reviewed state/closure version including its new gate/entry dependencies; its blocked skeleton cannot inherit this fifth proof.

| Fixed table | Actual introducing source |
| --- | --- |
| `operations_catering_cost_outbox` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_cost_publications` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_cost_streams` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_project_mappings` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_publish_gates` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_source_bindings` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_catering_source_observations` | `20261001235558_operations_catering_project_evidence.sql` |
| `operations_finance_credit_v2_enrollments` | `20261002024700_operations_finance_credit_v2_receiver.sql` |
| `operations_finance_credit_v2_project_scopes` | `20261002024700_operations_finance_credit_v2_receiver.sql` |
| `operations_finance_credit_v2_receipts` | `20261002024700_operations_finance_credit_v2_receiver.sql` |
| `operations_finance_credit_v2_snapshots` | `20261002024700_operations_finance_credit_v2_receiver.sql` |
| `operations_finance_credit_v2_streams` | `20261002024700_operations_finance_credit_v2_receiver.sql` |
| `operations_finance_invoice_enrollments` | `20261001233744_operations_finance_project_invoice_destination.sql` |
| `operations_finance_invoice_project_scopes` | `20261001233744_operations_finance_project_invoice_destination.sql` |
| `operations_finance_invoice_receipts` | `20261001233744_operations_finance_project_invoice_destination.sql` |
| `operations_finance_invoice_snapshots` | `20261001233744_operations_finance_project_invoice_destination.sql` |
| `operations_finance_invoice_streams` | `20261001233744_operations_finance_project_invoice_destination.sql` |
| `operations_invoice_obligation_kernel_read_gates` | `20261002044751_operations_invoice_obligation_kernel_read.sql` |
| `operations_obligation_source_policies` | `20261002025617_operations_obligation_source_policy.sql` |
| `operations_obligation_source_policy_heads` | `20261002025617_operations_obligation_source_policy.sql` |
| `operations_personnel_cost_outbox` | `20261001225724_operations_personnel_cost_outbox.sql` |
| `operations_personnel_cost_publications` | `20261001220652_operations_personnel_cost_evidence.sql` |
| `operations_personnel_cost_streams` | `20261001220652_operations_personnel_cost_evidence.sql` |
| `operations_personnel_rate_history` | `20261001220652_operations_personnel_cost_evidence.sql` |
| `operations_personnel_source_bindings` | `20261001225724_operations_personnel_cost_outbox.sql` |
| `operations_personnel_target_bindings` | `20261001225724_operations_personnel_cost_outbox.sql` |
| `operations_personnel_transport_routes` | `20261001225724_operations_personnel_cost_outbox.sql` |
| `operations_project_obligation_baselines` | `20261002023731_operations_project_obligation_authority.sql` |
| `operations_project_obligation_heads` | `20261002023731_operations_project_obligation_authority.sql` |
| `operations_project_obligation_invoice_bindings` | `20261002023731_operations_project_obligation_authority.sql` |
| `operations_project_obligation_source_ownership` | `20261002023731_operations_project_obligation_authority.sql` |
| `operations_project_personnel_review_grants` | `20261001232438_operations_personnel_project_reviews.sql` |
| `operations_project_personnel_reviews` | `20261001232438_operations_personnel_project_reviews.sql` |
| `operations_project_scope_heads` | `20261002014937_operations_project_scope_enrollment.sql` |
| `operations_project_scope_member_ownership` | `20261002014937_operations_project_scope_enrollment.sql` |
| `operations_project_scope_packing_policies` | `20261002014937_operations_project_scope_enrollment.sql` |
| `operations_project_scope_snapshots` | `20261002014937_operations_project_scope_enrollment.sql` |
| `operations_scope_obligation_baseline_captures` | `20261002030747_operations_scope_obligation_composition.sql` |
| `operations_scope_obligation_composition_heads` | `20261002030747_operations_scope_obligation_composition.sql` |
| `operations_scope_obligation_compositions` | `20261002030747_operations_scope_obligation_composition.sql` |
| `operations_scope_obligation_ownership` | `20261002030747_operations_scope_obligation_composition.sql` |
| `product_cost_overrides` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |
| `project_billing` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |
| `project_budget` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |
| `project_labor_costs` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |
| `project_purchases` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |
| `project_staff_time_cost_lines` | `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql` |

| Counter | Exact table |
| --- | --- |
| `cateringPublications` | `public.operations_catering_cost_publications` |
| `cateringObservations` | `public.operations_catering_source_observations` |
| `cateringOutbox` | `public.operations_catering_cost_outbox` |
| `invoiceSnapshots` | `public.operations_finance_invoice_snapshots` |
| `baselines` | `public.operations_project_obligation_baselines` |
| `bindings` | `public.operations_project_obligation_invoice_bindings` |
| `sourcePolicies` | `public.operations_obligation_source_policies` |
| `compositions` | `public.operations_scope_obligation_compositions` |
| `personnelPublications` | `public.operations_personnel_cost_publications` |
| `personnelStreams` | `public.operations_personnel_cost_streams` |
| `personnelOutbox` | `public.operations_personnel_cost_outbox` |
| `personnelReviews` | `public.operations_project_personnel_reviews` |
| `reviewGrants` | `public.operations_project_personnel_review_grants` |

## Whole-row hashing, coherent read and limits

One SQL statement captures counts and hashes under one MVCC snapshot. Do not run count/head/source/legacy SELECTs in separate statements inside a volatile controller read and claim they are one coherent view. Set local timezoneUTC, ISO DateStyle and extra_float_digits3 for reproducible full-row text; these are connection settings, not source changes. `to_jsonb(row)::text` preserves every user column including full saved payloads, rate/money, current_revision, status, exact raw-body strings, nulls, timestamps, captured destinations and outbox lease/receipt fields. No whitespace stripping or selected-column projection repairs source evidence. Only hashes/counts leave private SQL.

Rows are domain-separated by fixed table name, hashed individually, then C-sorted by row SHA; identical duplicate rows remain counted/repeated. Empty table fingerprints are explicit hashed empty sets, never omitted. A table fingerprint includes table name, row count and sorted row hashes. Row/table hashes remain opaque same-server PostgreSQL values. The final state proof is cross-language deterministic: SHA256 of UTF8 `JSON.stringify` for this fixed positional tuple, with no whitespace or trailing newline:

```ts
[
  'operations-mounted-state-proof.v1',
  state.schema,
  state.databaseName,
  [state.cateringPublications, state.cateringObservations, state.cateringOutbox,
   state.invoiceSnapshots, state.baselines, state.bindings, state.sourcePolicies,
   state.compositions, state.personnelPublications, state.personnelStreams,
   state.personnelOutbox, state.personnelReviews, state.reviewGrants],
  Object.keys(state.tableFingerprints).sort().map(name => [name, state.tableFingerprints[name]]),
  state.legacyPurchasesFingerprint
]
```

All tuple strings are fixed validated ASCII schema/database/table names or lowercase64-hex, and all thirteen integers are0..1000. Thus PostgreSQL can construct the same compact bytes using scalar JSON quoting and literal separators; there is no object-key ordering or PostgreSQL jsonb whitespace dependency. SQL explicitly C-sorts the table pairs. Browser first validates exact fields/table keys/count bounds, reconstructs these exact bytes, and recomputes the final SHA before comparing state. Never hash `document::text` on one side and `JSON.stringify(document)` on the other. Only opaque row/table values are server-derived; the final proof preimage is stable and specified, not an external HMAC/source authenticity protocol.

For each table read only LIMIT1001 rows and refuse if observed count exceeds1000; if accepted, all rows of that table were captured. Refuse any row over2MiB or combined serialized row bytes over16MiB. Retain tighter3s statement/1s lock and whole15s controller bounds. Aggregate compact hashes, not huge arrays/raw documents. Failed caps or absent tables return no accepted state. No provider/background dispatcher runs in this isolated job; an unexpected source mutation makes the exact comparison fail.

The following is a **literal SQL implementation proposal**, not a callable SQL API or executed product patch. Names are compiled constants, never obtained from caller JSON/URL or interpolated caller SQL. The root controller may place it in a new pure fixed-SQL module after independent review. `NULL` at the final SELECT is an intentional fail-closed cap result; runSql must reject it before returning any accepted response.

```sql
begin;
set local statement_timeout='3s';
set local lock_timeout='1s';
set local time zone 'UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
-- Root inserts only the reviewed literal disposable fixture guard here.
with tags(table_name) as (values
 ('operations_catering_cost_outbox'),
 ('operations_catering_cost_publications'),
 ('operations_catering_cost_streams'),
 ('operations_catering_project_mappings'),
 ('operations_catering_publish_gates'),
 ('operations_catering_source_bindings'),
 ('operations_catering_source_observations'),
 ('operations_finance_credit_v2_enrollments'),
 ('operations_finance_credit_v2_project_scopes'),
 ('operations_finance_credit_v2_receipts'),
 ('operations_finance_credit_v2_snapshots'),
 ('operations_finance_credit_v2_streams'),
 ('operations_finance_invoice_enrollments'),
 ('operations_finance_invoice_project_scopes'),
 ('operations_finance_invoice_receipts'),
 ('operations_finance_invoice_snapshots'),
 ('operations_finance_invoice_streams'),
 ('operations_invoice_obligation_kernel_read_gates'),
 ('operations_obligation_source_policies'),
 ('operations_obligation_source_policy_heads'),
 ('operations_personnel_cost_outbox'),
 ('operations_personnel_cost_publications'),
 ('operations_personnel_cost_streams'),
 ('operations_personnel_rate_history'),
 ('operations_personnel_source_bindings'),
 ('operations_personnel_target_bindings'),
 ('operations_personnel_transport_routes'),
 ('operations_project_obligation_baselines'),
 ('operations_project_obligation_heads'),
 ('operations_project_obligation_invoice_bindings'),
 ('operations_project_obligation_source_ownership'),
 ('operations_project_personnel_review_grants'),
 ('operations_project_personnel_reviews'),
 ('operations_project_scope_heads'),
 ('operations_project_scope_member_ownership'),
 ('operations_project_scope_packing_policies'),
 ('operations_project_scope_snapshots'),
 ('operations_scope_obligation_baseline_captures'),
 ('operations_scope_obligation_composition_heads'),
 ('operations_scope_obligation_compositions'),
 ('operations_scope_obligation_ownership'),
 ('product_cost_overrides'),
 ('project_billing'),
 ('project_budget'),
 ('project_labor_costs'),
 ('project_purchases'),
 ('project_staff_time_cost_lines')),
rows as materialized (
 select 'operations_catering_cost_outbox'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_cost_outbox'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_outbox limit 1001)t)j
 union all
 select 'operations_catering_cost_publications'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_cost_publications'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_publications limit 1001)t)j
 union all
 select 'operations_catering_cost_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_cost_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_streams limit 1001)t)j
 union all
 select 'operations_catering_project_mappings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_project_mappings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_project_mappings limit 1001)t)j
 union all
 select 'operations_catering_publish_gates'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_publish_gates'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_publish_gates limit 1001)t)j
 union all
 select 'operations_catering_source_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_source_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_source_bindings limit 1001)t)j
 union all
 select 'operations_catering_source_observations'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_catering_source_observations'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_source_observations limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_enrollments'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_enrollments'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_enrollments limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_project_scopes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_project_scopes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_project_scopes limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_receipts'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_receipts'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_receipts limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_snapshots limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_streams limit 1001)t)j
 union all
 select 'operations_finance_invoice_enrollments'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_invoice_enrollments'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_enrollments limit 1001)t)j
 union all
 select 'operations_finance_invoice_project_scopes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_invoice_project_scopes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_project_scopes limit 1001)t)j
 union all
 select 'operations_finance_invoice_receipts'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_invoice_receipts'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_receipts limit 1001)t)j
 union all
 select 'operations_finance_invoice_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_invoice_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_snapshots limit 1001)t)j
 union all
 select 'operations_finance_invoice_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_finance_invoice_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_streams limit 1001)t)j
 union all
 select 'operations_invoice_obligation_kernel_read_gates'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_invoice_obligation_kernel_read_gates'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_invoice_obligation_kernel_read_gates limit 1001)t)j
 union all
 select 'operations_obligation_source_policies'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_obligation_source_policies'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_obligation_source_policies limit 1001)t)j
 union all
 select 'operations_obligation_source_policy_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_obligation_source_policy_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_obligation_source_policy_heads limit 1001)t)j
 union all
 select 'operations_personnel_cost_outbox'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_cost_outbox'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_outbox limit 1001)t)j
 union all
 select 'operations_personnel_cost_publications'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_cost_publications'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_publications limit 1001)t)j
 union all
 select 'operations_personnel_cost_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_cost_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_streams limit 1001)t)j
 union all
 select 'operations_personnel_rate_history'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_rate_history'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_rate_history limit 1001)t)j
 union all
 select 'operations_personnel_source_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_source_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_source_bindings limit 1001)t)j
 union all
 select 'operations_personnel_target_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_target_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_target_bindings limit 1001)t)j
 union all
 select 'operations_personnel_transport_routes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_personnel_transport_routes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_transport_routes limit 1001)t)j
 union all
 select 'operations_project_obligation_baselines'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_obligation_baselines'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_baselines limit 1001)t)j
 union all
 select 'operations_project_obligation_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_obligation_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_heads limit 1001)t)j
 union all
 select 'operations_project_obligation_invoice_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_obligation_invoice_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_invoice_bindings limit 1001)t)j
 union all
 select 'operations_project_obligation_source_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_obligation_source_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_source_ownership limit 1001)t)j
 union all
 select 'operations_project_personnel_review_grants'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_personnel_review_grants'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_personnel_review_grants limit 1001)t)j
 union all
 select 'operations_project_personnel_reviews'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_personnel_reviews'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_personnel_reviews limit 1001)t)j
 union all
 select 'operations_project_scope_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_scope_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_heads limit 1001)t)j
 union all
 select 'operations_project_scope_member_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_scope_member_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_member_ownership limit 1001)t)j
 union all
 select 'operations_project_scope_packing_policies'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_scope_packing_policies'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_packing_policies limit 1001)t)j
 union all
 select 'operations_project_scope_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_project_scope_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_snapshots limit 1001)t)j
 union all
 select 'operations_scope_obligation_baseline_captures'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_scope_obligation_baseline_captures'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_baseline_captures limit 1001)t)j
 union all
 select 'operations_scope_obligation_composition_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_scope_obligation_composition_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_composition_heads limit 1001)t)j
 union all
 select 'operations_scope_obligation_compositions'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_scope_obligation_compositions'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_compositions limit 1001)t)j
 union all
 select 'operations_scope_obligation_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'operations_scope_obligation_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_ownership limit 1001)t)j
 union all
 select 'product_cost_overrides'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'product_cost_overrides'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.product_cost_overrides limit 1001)t)j
 union all
 select 'project_billing'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'project_billing'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_billing limit 1001)t)j
 union all
 select 'project_budget'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'project_budget'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_budget limit 1001)t)j
 union all
 select 'project_labor_costs'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'project_labor_costs'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_labor_costs limit 1001)t)j
 union all
 select 'project_purchases'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'project_purchases'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_purchases limit 1001)t)j
 union all
 select 'project_staff_time_cost_lines'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-mounted-row.v1'||E'\n'||'project_staff_time_cost_lines'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_staff_time_cost_lines limit 1001)t)j
), summary as materialized (
 select tags.table_name, count(rows.row_sha)::bigint n,
 coalesce(sum(rows.row_bytes),0)::bigint serialized_bytes,
 coalesce(max(rows.row_bytes),0)::bigint largest_row,
 encode(sha256(convert_to('operations-mounted-table.v1'||E'\n'||tags.table_name||E'\n'||count(rows.row_sha)::text||E'\n'||
 coalesce(string_agg(rows.row_sha,E'\n' order by rows.row_sha collate "C"),''),'UTF8')),'hex') fp
 from tags left join rows using(table_name) group by tags.table_name
), limits as (
 select bool_and(n<=1000 and largest_row<=2097152) and sum(serialized_bytes)<=16777216 allowed from summary
), fingerprints as (
 select jsonb_object_agg(table_name,fp order by table_name collate "C") value from summary
), pairs as (
 select '['||string_agg('['||to_json(table_name)::text||','||to_json(fp)::text||']',',' order by table_name collate "C")||']' bytes from summary
), state as (
 select jsonb_build_object(
 'schema','operations-project-cost-mounted-state.v2',
 'databaseName',current_database(),
 'cateringPublications',(select n from summary where table_name='operations_catering_cost_publications'),
 'cateringObservations',(select n from summary where table_name='operations_catering_source_observations'),
 'cateringOutbox',(select n from summary where table_name='operations_catering_cost_outbox'),
 'invoiceSnapshots',(select n from summary where table_name='operations_finance_invoice_snapshots'),
 'baselines',(select n from summary where table_name='operations_project_obligation_baselines'),
 'bindings',(select n from summary where table_name='operations_project_obligation_invoice_bindings'),
 'sourcePolicies',(select n from summary where table_name='operations_obligation_source_policies'),
 'compositions',(select n from summary where table_name='operations_scope_obligation_compositions'),
 'personnelPublications',(select n from summary where table_name='operations_personnel_cost_publications'),
 'personnelStreams',(select n from summary where table_name='operations_personnel_cost_streams'),
 'personnelOutbox',(select n from summary where table_name='operations_personnel_cost_outbox'),
 'personnelReviews',(select n from summary where table_name='operations_project_personnel_reviews'),
 'reviewGrants',(select n from summary where table_name='operations_project_personnel_review_grants'),
 'legacyPurchasesFingerprint',(select fp from summary where table_name='project_purchases'),
 'tableFingerprints',(select value from fingerprints)) document
), proof as (
 select document,
 '['||to_json('operations-mounted-state-proof.v1'::text)::text||','||
 to_json(document->>'schema')::text||','||to_json(document->>'databaseName')::text||',['||
 concat_ws(',',document->>'cateringPublications',document->>'cateringObservations',document->>'cateringOutbox',
 document->>'invoiceSnapshots',document->>'baselines',document->>'bindings',document->>'sourcePolicies',
 document->>'compositions',document->>'personnelPublications',document->>'personnelStreams',
 document->>'personnelOutbox',document->>'personnelReviews',document->>'reviewGrants')||'],'||
 (select bytes from pairs)||','||to_json(document->>'legacyPurchasesFingerprint')::text||']' preimage
 from state
)
select case when (select allowed from limits) then
 (document||jsonb_build_object('stateFingerprint',encode(sha256(convert_to(preimage,'UTF8')),'hex')))::text
 else null end from proof;
commit;
```

## Proposed narrow root patch sequence

1. Root adds a NEW pure `project-cost-state.ts` with literal guard/query/constants; no arbitrary execution, env, network, caller SQL or product table/function changes. Keep the old state SQL and existing mutation whitelist verbatim.
2. Root extends only fixed controller GET recognition/routing for `project-cost/state`, verifies exact method/body/token/loopback boundary and new typed cap/hash response before returning it. Mutation endpoints/purposes remain unchanged; no automatic endpoint fallback. Canonical source manifest pins this new module explicitly.
3. After root/verifier contract lock, child updates only NEW fifth-driver state endpoint, exact18-key validator/table-key enum and immutable case-boundary comparisons. No old browser allowance or financial RPC changes. Root owns new fifth launcher/proof/config/source routing and private full state assertion.
4. Independent source review and actual native fresh-schema tests precede exact-head browser acceptance. Keep old8 economic counters + databaseName wire/old16 cases intact. New fingerprints are NOT public Finance/Operations user API fields or cost calculations.

## Meaningful acceptance tests before routing

- Exact loopback/private-token GET succeeds; wrong method/body/query/token, old/fake schema, omitted table key, extra key, nonhex fingerprint, unsafe/string count and recomputation mismatch fail before proof.
- Two identical captures equal; SQL row insertion/deletion changes count/hash. A rollback-only genuine mutable personnel head `updated_at` change changes fingerprint despite identical counts; outbox state/lease/receipt and legacy purchase amount changes are similarly caught without exposing content. Restore/rollback, never accept altered economics as a new read baseline.
- JSON quote/backslash/Unicode strings and nulls roundtrip through actual whole-row hash; row-order change leaves fingerprint unchanged; duplicate-row multiplicity changes it. No trim/global whitespace normalization of raw signed strings.
- Coherent one-statement snapshot is native-proven against a controlled actual source update; each result is wholly before/after, not a mixed count/head. In this browser job background writers remain disabled.
- 1001-row/over2MiB-row/over16MiB-total fixtures refuse accepted state, within controller bounds; unavailable tables/schema or child cleanup failure cannot output PASS. Native fixtures may use disposable rollback-only data, never hosted datasets.
- Actual fifth App8 cases use true signed actorJWT/production read responses, protect cached money/current role/profile boundaries, retain legacy700 and no forbidden writes/forwarding failures, compare validated full v2 state. Native18/safe whole-reader activation and physical provider/GoTrue/device proof remain separate.
