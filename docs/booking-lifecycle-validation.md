# Booking lifecycle safety: validation and rollout

No production migrations, deployments, or GitHub pushes have been performed. GitHub publication was rejected by automatic approval review and requires explicit user approval. Do not work around that rejection.

## Contract tests

From the repository root with dependencies installed from the lockfile:

```sh
npm ci
npx vitest run src/test/cancellationNotice.contract.test.ts src/test/cancellationAtomic.contract.test.ts src/test/cancellationRevisionKind.contract.test.ts src/test/cancellationMutationContract.test.ts src/test/revisionContractEndToEnd.contract.test.ts src/test/canonicalRevisionGuard.contract.test.ts src/test/revisionGuardStaleContract.test.ts src/test/packingReviewSource.contract.test.ts
```

Observed result: **151 tests passed in 8 files**. During development, dependencies were reused from an existing local checkout through an ignored `node_modules` symlink; a clean staging checkout should install its own locked dependencies.

## Real PostgreSQL 17 regression tests

Run only against the disposable container below. No production credentials are needed. These commands create a new container and database; use a different container name if that name already exists.

```sh
docker run --name operations-lifecycle-pg17 -e POSTGRES_PASSWORD=local-test-only -d postgres:17.6
docker exec operations-lifecycle-pg17 pg_isready -U postgres
```

Wait until `pg_isready` reports accepting connections, then run:

```sh
docker exec operations-lifecycle-pg17 psql -U postgres -v ON_ERROR_STOP=1 -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;'
docker exec operations-lifecycle-pg17 createdb -U postgres operations_lifecycle_test
cat supabase/tests/lifecycle-preservation.setup.sql supabase/migrations/20261013134026_preserve_booking_cancellation_work.sql supabase/tests/lifecycle-preservation.assert.sql | docker exec -i operations-lifecycle-pg17 psql -U postgres -d operations_lifecycle_test -v ON_ERROR_STOP=1
```

The assertion script raises on failure and prints a `PASS` notice on success. Observed result: passed on PostgreSQL 17. The fixture installs the current cancellation function and representative table definitions, then runs the actual new migration. It tests:

- Complete commercial deletion while preserving progressed packing IDs, quantities, labels and allocations.
- Duplicate deletion and safe deletion of the final unstarted row.
- Outstanding returns preventing review dismissal or project deletion; resolved returns permitting approval.
- Rejection of target changes and packing/allocation changes on retired rows.
- Correct cancellation preservation receipts.
- Automatic cancellation preserving products/calendar records while making cancellation visible and retaining completed jobs.
- Idempotent and stale notices, including a cancellation tombstone before first local import.

This fixture is not a full production-schema replay. It does not establish deployment readiness or replace staging tests of the three applications.

After inspecting results, this removes only the explicitly created disposable test container:

```sh
docker rm -f operations-lifecycle-pg17
```

## Full application typecheck

```sh
npx tsc --noEmit -p tsconfig.app.json
```

The full typecheck currently reports unrelated existing errors:

- `JobsListPanel.tsx`, `LargeProjectsListPanel.tsx`, `MediumProjectsListPanel.tsx`, `UnifiedProjectList.tsx`, and `ProjectManagement.tsx`: mutation functions accepting an optional `performedBy` string conflict with the mutation library's context argument (`TS2322`).
- `CustomCalendarPage.tsx`: both `components/calendar/NewBookingsPopup.tsx` and `components/Calendar/NewBookingsPopup.tsx` are included with different casing (`TS1261`).

No reported error was in the lifecycle files changed here. A clean build remains a staging/release prerequisite; these failures must not be represented as a passing full typecheck.

## Staging and release prerequisites

1. Inspect the actual deployed definition of `public.apply_booking_cancellation_atomic(uuid,text,text,timestamptz,bigint,text,uuid)`, its permissions, and the relevant packing, allocation, calendar, booking-source-state and job/project columns. The migration deliberately aborts if expected cancellation-function body fragments have changed. Do not remove that shape check merely to get a deployment through.
2. Replay the real schema and this migration on an isolated staging database. Verify triggers, constraints, RLS, service-role permissions, and existing manual cancellation integrations. Preserve existing revision and lease guards.
3. Apply the schema migration before deploying `import-bookings`, its shared notice/receipt helpers, and the UI. This is a dependency order, not deployment authorization.
4. Coordinate with the Booking durable-delivery and Bundle atomic-reservation changes. Operations must receive the canonical commercial cancellation even if Bundle reports a warehouse lifecycle conflict. Timestamp fields must match the shared producer/export contract; a WMS timestamp must not be parsed as a numeric Operations source version.
5. Exercise confirmed → packed → cancelled, cancellation before first import, duplicate and reversed delivery, last-row deletion, quantity/identity changes after packing, and return resolution through the actual UI. Verify retired obligations remain visible and cannot be dismissed while unresolved. Confirm completed operational history remains intact and calendar cancellation labels are visible.
6. Verify the safe same-revision empty-projection repair still works. `force_revision` must never reset source watermarks. Source absence alone must never become cancellation.
7. Inspect new queue failures and action-required cases before any production approval. Do not enable destructive automatic cleanup as part of this change.

Local commits and passing fixture tests are review material only. Production deployment and GitHub publication are separate pending actions.
