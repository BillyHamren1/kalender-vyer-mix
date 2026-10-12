# Warehouse boundary review and fixes — 2026-10-12

Reviewed integrated commit `0bfaab821` in an isolated worktree. Implementation branch `codex/internal-warehouse-commercial-boundaries`. No remote publication or hosted action.

## Reproduced findings

1. Generic ProjectLayout status dropdown called `updateProjectStatus`, which treated the permanent Lager booking as commercial and invoked `syncBookingsForInvoicing(['lager-booking'])` on completion. An injected transport test reproduced the call; finite internal projects with booking_id=null correctly made no call. The external proxy previously forwarded close/reopen without same-tenant/internal classification checks.
2. Latest `notify_warehouse_on_new_project` inserted an inbox demand for every booking-free internal project. A synthetic PostgreSQL test reproduced that exact old trigger before applying the fix. No stock reservation was observed: existing packing creation already returns without a booking, but irrelevant pack/return plans could be offered.

## Changes

- Generic project completion sync and booking completion analytics run only for customer classification. Finite internal completion still reaches the database operational-completion guard.
- Client close/reopen checks exact available booking classification before external invocation. Closed-project resync excludes legacy internal rows; shared preflight also protects remaining internal rows/other entry points.
- Proxy uses authenticated actor organization and user-scoped booking/project reads. Wrong tenant, unavailable/unknown/internal booking, linked internal project or read failure prevents upstream fetch. Action spelling is normalized before routing and close/reopen require POST. Existing customer owner IDs remain opaque, preserving leading zeros.
- Additive migration replaces only the current warehouse-inbox trigger function: classified internal projects/activities return immediately. Existing customer path is retained. No historical rows are deleted.
- Conversion of stale internal-project inbox rows is rejected before warehouse plan, packing or reservation writes. Dedicated permanent Lager task creation is unchanged.

## Verification

- 34 targeted Vitest 4.1.11 tests across 5 files pass, including actual proxy handler with injected auth/database/fetch, client close/reopen and customer regression, service no-commercial-effect, stale inbox no-write and existing canonical Booking need.
- 10 synthetic PostgreSQL-WASM assertions pass: reproduce old implicit demand; finite project, explicit activity and legacy Lager create no demand; standalone customer and linked customer paths remain unchanged.
- Earlier integrated independent review: 56 relevant existing tests pass and 12 classification database assertions pass before these changes.

## Limits and next checks

No hosted RLS, real authenticated UI, upstream Booking service or physical inventory calls were made. Synthetic schema only tests the trigger function, not the full historical migration catalog. Apply after internal_project_classification. Rollback restores the previous trigger function; no data rewrite to undo. Proxy deployment depends on that additive schema, and failed evidence reads remain blocked rather than bypassed.

Booking/Catering worker independently reviews the commercial close chain. Root integrates reviewed commits and runs combined type/build/behavior gates. Publication remains blocked by the previously reported automatic approval review.


Deployment gate: apply and verify `internal_project_classification` first, then the inbox migration, then deploy the matching proxy/frontend. The proxy's linked-project query requires `project_kind`; deploying it first returns 500 for customer close/reopen. Missing-column errors deliberately fail closed. Rollback must retain additive columns or restore the previous compatible proxy version before changing schema. Actor tenant lookup uses `profiles.user_id = auth.getUser().user.id`, matching the existing authenticated tenant contract; it must never confuse profile row UUID with auth user UUID.


Final local typecheck: PASS (`tsc --noEmit -p tsconfig.app.json`, exact lockfile dependencies, 8 GB heap). Production build passed in 33.88 seconds; final combined integration gate is owned by root. Independent reviewer identified and verified correction of profile PK/user ID confusion; handler tests now require the actual user_id filter and model distinct IDs.
