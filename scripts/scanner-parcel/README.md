# Parcel database regression

Run only against a clean disposable PostgreSQL database as its owner:

```sh
psql "$SCANNER_TEST_DATABASE_URL" --set ON_ERROR_STOP=1 \
  --file scripts/scanner-parcel/fixture.sql \
  --file supabase/migrations/20260914170000_scanner_parcel_command_v1.sql \
  --file scripts/scanner-parcel/assertions.sql
```

The fixture refuses a database containing packing projects and rolls back its
transaction after testing the actual migration. It checks RPC ACLs, real denied
browser execution, service-only commands, replay/conflict, allocation limits,
seal/reopen boundaries and the remaining/empty legacy parcel pointer.

The same SQL is executable in isolated PGlite without adding a frontend npm
dependency. These are single-session regression checks; they do not establish
multi-session concurrency or production rollout readiness.
