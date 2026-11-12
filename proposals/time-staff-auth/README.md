# time-staff-auth (time-operations-auth.v1) — NOT LIVE

Server-to-server contract: Operations is the sole source of EventFlow Time personnel accounts.
Kept outside `supabase/functions/` deliberately: anything there auto-deploys from this project,
and this change must stay reviewable. No migration applied, no secret set, nothing published.

## Contract
POST, `Content-Type: application/json`, body <= 4 KB, header `x-time-operations-secret`.
- `{schema:"time-operations-auth.v1", action:"verify_credentials", identifier, password}`
- `{schema:"time-operations-auth.v1", action:"resolve_active", organizationId, staffId}`
Exact key sets; anything else -> 400. Success: `{schema, staff:{staffId, organizationId, displayName, email|null}}`.
401 bad credentials (unknown, wrong password, ambiguous/duplicate, tenant mismatch),
403 inactive (only after correct password; for resolve_active also not-found/cross-tenant/no account),
429 rate limited, 503 secret missing/limiter or DB down (fail closed). No CORS; no session ids.

## Verifier compatibility
Same lookup as `mobile-app-auth/index.ts` handleLogin (lowercased identifier; email -> staff_members
-> staff_accounts, username fallback; `btoa(password) === password_hash`), but: wildcards escaped,
exact-match re-check, every duplicate rejected, constant-time compare, staff/account org must match,
`staff_members.is_active` required. `mobile-app-auth` was NOT edited (editing it or `_shared/` redeploys
live Scanner/mobile functions); the pure logic lives in `core.ts` for later shared extraction.
Note: `organizations` has no active/status column, so no org-active gate exists to enforce.
Note: existing `mobile-app-auth` does not check `is_active` today (out of scope, unchanged).

## Account lifecycle (current Operations code paths)
- Deactivate: `StaffList.handleActiveToggle` -> `updateStaffActiveStatus` / `toggleStaffActive`
  (`src/services/planningDashboardService.ts`) -> `staff_members.is_active=false`. Row and account stay.
- Remove login: `StaffAccountsPanel` / `StaffAccountCard` deleteAccountMutation -> `DELETE staff_accounts WHERE staff_id`.
- Password reset: same components -> `UPDATE staff_accounts.password_hash`.
None of these notify anything; Scanner relies on `active_mobile_session_id` rotation, which this contract never touches.

## Cutting off Time access (incl. already-issued Time sessions)
Best verified mechanism with current schema: Time must call `resolve_active` before issuing/refreshing
its session and on every data request (or with a short cache, recommended <= 60 s). Deactivation or
account deletion then returns 403 on the next check. Password reset does NOT revoke existing Time
sessions today (no credential version column); recommended follow-up: add `staff_accounts.credential_version`
(or reuse `updated_at`) to the resolve response and have Time bind sessions to it.

## Setup blockers (user-only)
1. Generate one strong `TIME_OPERATIONS_AUTH_SHARED_SECRET` (>= 32 chars) and store it in both
   Operations (Supabase pihrhltinhewhoxefjxv) and Time secrets.
2. Review + apply `rate_limit.sql` (limits: 10/identifier, 600 global verify, 120/staff resolve per 15 min).
3. Move folder to `supabase/functions/time-staff-auth/` with `verify_jwt = false`, then deploy.
4. Time side must implement the client and resolve_active checks.
