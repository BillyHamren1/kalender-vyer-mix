# Planning mobile Operations rollout

Code-only draft. Nothing in this change applies migrations, deploys functions, changes live secrets or sends notifications.

## Dependency order

1. Review and apply `20261012205117_mobile_staff_command.sql` in Planning through the normal approved migration process. It adds a private idempotency ledger and service-role-only RPC. Existing canonical staff assignment/BSA triggers must already be present.
2. Deploy Planning `planning-mobile-read` and `planning-mobile-staff`. Both use `verify_jwt=false` only because every request requires the existing Planning HMAC signature, freshness and replay nonce, followed by tenant membership and role verification. Required owner environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLANNING_BRAIN_READ_SIGNING_SECRET`. Staffing requires admin/projekt; warehouse cannot write.
3. Deploy reviewed WMS quantity-mode fix before relying on fixed-per-booking packing totals.
4. Deploy Brain gateway with its existing JWT validation enabled. Required existing Brain config: `PLANNING_BRAIN_READ_URL` pointing to canonical `/functions/v1/planning-brain-read`, `PLANNING_BRAIN_READ_SIGNING_SECRET`, plus current HUB/WMS adapter configuration. The gateway derives the new receiver paths on the verified Planning origin.
5. Verify signed read-only access with real tenant roles through the normal approved release checks. `PLANNING_MOBILE_STAFF_WRITE` defaults OFF unless exactly `true`. Enable it only after owner migration/receivers and Brain/UI are verified together.

## Semantics and limits

The service-role-only read context RPC and command both resolve calendar dates using source_date first, then start_time in Europe/Stockholm; manually created events need no data migration.

The command writes canonical `staff_assignments`; existing database triggers derive booking staffing. The reviewed team/day applies to all matching bookings, including bookings added later. Large-project date matching follows the existing trigger, including its lack of a team predicate for linked large-project bookings. The transaction checks the reviewed affected ID set at read committed isolation and locks the selected event/existing membership. This is not a serializable freeze of calendar/project source rows; no cross-tenant table locks are introduced.

Same actor/org/idempotency key with identical intent replays the persisted receipt; changed intent conflicts. A lost response or access change after dispatch is an unknown outcome, never a false success. UI must preserve the command key for retry and require a fresh explicit review after a definitive conflict.

## Verification and rollback

Local evidence: 10 signed read handler tests, 6 signed staff handler tests, 7 actual PostgreSQL migration/trigger fixture tests in PGlite. Fixture tests prove isolated SQL semantics and privileges, not live Supabase RLS or production deployment. CI repeats these without live credentials.

To disable writes, set `PLANNING_MOBILE_STAFF_WRITE` absent/false; read views continue. Roll back Brain/UI independently as needed. Retain the additive ledger/RPC and existing receipt rows for safe replay/audit; do not delete business assignments or receipt history as rollback. No production rollback has been performed.
