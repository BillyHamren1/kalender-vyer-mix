# Profile tenant and administrator scope review — 2026-10-27

## Confirmed production catalog findings

Inspected the current `pihrhltinhewhoxefjxv` database through read-only catalog
queries. This is the backend referenced by the current Operations/WMS client.
No production data or schema was changed during the review.

1. `profiles` has a self-update policy checking only `auth.uid() = user_id`.
   `authenticated` has UPDATE privilege on `organization_id`. The only existing
   profile trigger updates `updated_at`. `get_user_organization_id` reads the
   user-editable profile organization without checking membership. Many restrictive
   tenant policies use that function. A caller can therefore move their own
   authorization context to another organization through a direct profile update.
2. `has_role` checks the user's role across every organization, not the active
   organization. The day-attestation admin policies, among other policies, combine
   that global result with the active profile organization. An admin of A who is
   only warehouse staff in B can satisfy the admin predicate in B.
3. `verify-sso-token` uses role upserts without removing previously granted roles.
   This code path does not establish revocation of a removed HUB role. Fixing only
   a client menu, or only the two SQL issues above, does not solve revocation.

The first two flaws were reproduced against synthetic data in an isolated
PostgreSQL/PGlite instance. No attempt was made to exploit real users or tenants.

## Included correction

- An invoker trigger rejects changes to profile `id`, `user_id`, and
  `organization_id` from `anon` and `authenticated`. It uses the database role,
  not user-editable JWT metadata. Display edits and unchanged identity values
  still work. Verified SSO/user-sync service-role writes remain available.
- `has_role` now matches the role to the active profile organization. Its existing
  signature/default and service-side lookups remain compatible.
- A pinned, separately locked PGlite test package reproduces the two baseline
  failures and exercises the correction, normal member edits, another user's
  profile, anonymous access, role self-assignment, and service-role SSO switching.
- A dedicated CI job executes the regression suite on relevant pull requests.

## Validation

`npm ci --ignore-scripts && npm test` in `scripts/authz-regression`: 20 assertions
passed locally (including the two vulnerable baseline assertions).
`git diff --check`: passed. These are executable synthetic PostgreSQL tests, not
proof of a deployed fix or an authenticated browser/PostgREST acceptance run.
The full application build was not run: no application code or dependencies were
changed. PGlite runs a different packaged PostgreSQL version than production;
production-equivalent PostgreSQL 15 and SSO acceptance remain release gates.

## Remaining release and security work

- Verify on isolated PostgreSQL 15, then apply the additive migration and verify
  ordinary-user denials plus legitimate admin and SSO paths against the deployed API.
- Implement atomic, tenant-scoped role replacement/revocation with concurrency
  and stale-message protection. Check both `verify-sso-token` and
  `receive-user-sync`; replacing an upsert with a non-atomic delete/insert is unsafe.
- Verify how existing module sessions lose access after HUB role/module revocation.
- Audit administrative and financial mutations that currently require only org
  membership (including `webhook_subscriptions` and `time_reports`). Tenant
  isolation is not itself admin authorization.
- Complete endpoint, RPC, Storage and browser denial coverage across Sales,
  Brain, Inventory, Catering, Finance and Time. This is not a suite-wide sign-off.

## Other read-only review observations

- HUB routes distinguish member, org admin and superadmin; its live role policies
  restrict writes to same-org administrators or superadmins. This is catalog/code
  evidence, not an end-to-end pass for every route.
- No public base tables with disabled RLS were found in current HUB,
  Operations/WMS, Catering or Finance.
- The separate older `enrhmahpgtfnxmhrgxdv` project has five public tables with RLS
  disabled and anon SELECT/UPDATE grants: `confirmed_bookings`,
  `event_attachments`, `booking_status`, `booking_staff_assignments`,
  `deleted_bookings`. It is not the current Operations client database. Its API
  exposure and remaining integration usage require a separate containment review.
- SQL search results must include `pg_policies.permissive`: restrictive tenant
  policies AND with permissive policies. An `ALL USING (true)` policy alone is
  insufficient evidence of cross-tenant access when a restrictive policy exists.
