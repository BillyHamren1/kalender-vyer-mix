# Accepted-rate provenance seam — local review candidate

Base: real Operations PR48 `5f0c934ab99795f1185cfa165f1f21131d81cd61`.
No deployment, migration application to hosted data, backfill, or accepted publisher activation is authorized by this patch.

## Contract

`enroll_operations_personnel_accepted_rate_v1` accepts the existing rate command plus `cost_basis` (`approved_loaded_hourly_cost` or `approved_supplier_hourly_cost`) under schema `operations-personnel-accepted-rate-admin.v1`. The existing server-side authenticated same-organization admin authorization and explicit worker enrollment run at issuance. The existing immutable rate and audit event are inserted atomically. An explicit source reference and reason remain required; the operator must supply the actual approved cost policy and effective interval. This does not infer employer cost or recover historical rates from current settings.

A default-empty private immutable issuance-reference table stores only the existing event ID, with no monetary fields or backfill. Only the new authenticated command inserts that reference in the same transaction. The service-only accepted view requires that prospective reference and exact rate/event/command equality and the approved command version/basis. Legacy v1 events and rate rows without accepted audit events remain unverified. The resolver reads this view; canonical ingress independently validates it before accepting or replaying complete-cost lines. Missing accepted rates retain the existing missing-rate path, never zero-cost coverage. No new ledger is introduced.

Authority is evaluated at issuance: later admin-role revocation prevents new issuance but does not invalidate immutable earlier accepted economics. Old shadow receipt replay requires accepted provenance and is rejected if absent. Existing legacy functions are retained for compatibility, not promoted to accepted evidence.

The migration explicitly strips all service-role audit-event privileges before restoring SELECT, including inherited INSERT/UPDATE grants. The test pre-seeds an exact accepted-shaped forged event using inherited service INSERT before this migration and proves it remains excluded; replay of that old command cannot add an issuance reference. Issuance functions remain the only non-owner writer. Existing append-only triggers protect UPDATE/DELETE/TRUNCATE. Database owners remain trusted administrators.

## Exact dependency closure

Apply only after these existing PR48 migrations, in order:

1. `20261001220652_operations_personnel_cost_evidence.sql`
2. `20261001225724_operations_personnel_cost_outbox.sql`
3. `20261001232438_operations_personnel_project_reviews.sql`
4. `20261001234356_operations_personnel_project_review_publications.sql`
5. `20261001235803_operations_personnel_canonical_ingress.sql`
6. `20261002003928_operations_personnel_historical_rate_admin.sql`

The one-line resolver change depends on the existing PR48 `project-personnel-ingestion-store.ts`; its caller/engine/source proof/publisher closure is listed in `COST_CHAIN_NEXT.md` in the integration review branch. This patch is not independently cherry-pickable into a branch without that closure. Do not merge the whole PR48 merely to obtain it.

## Validation and remaining gates

The focused runtime executes the actual migrations, actual rate resolver and pure cost engine against an isolated PostgreSQL-compatible fixture. It exercises inherited service ACL removal with BYPASSRLS, real authenticated admin issuance, wrong role/tenant/basis, legacy exclusion, forged event fields, missing/wrong rate/currency/interval, canonical SQL ingress, replay guard, and immutable issuance after role revocation. It is not hosted authentication or a production source acceptance test.

Run `node scripts/internal-projects/accepted-rate-provenance.test.mjs` with `@electric-sql/pglite` and TypeScript installed in NODE_PATH. Native PostgreSQL helper/CI is supplied by independent reviewer in a separate patch. Current local result: 21 checks PASS.

Still required: independent review, native PostgreSQL run, bounded closure integration, canonical Time scoped read deployment/enrollment, real operator approved basis/source/interval decisions, signed cost transport accepted destination integration, hosted concurrency/fault and authenticated end-to-end proof. Existing downstream publication statuses are shadow until these gates are closed; this patch alone establishes no accepted Finance total.
