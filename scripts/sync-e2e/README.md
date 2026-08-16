# STEG 4O – Sync SQL/E2E-gate

Riktig PostgreSQL/Supabase-gate för bokningssyncen. Kör **aldrig** mot production.

## Kör

```bash
export E2E_SAFE_TEST_ENV=true
export E2E_ENVIRONMENT=local              # local | test | staging
export E2E_SUPABASE_URL=http://127.0.0.1:54321
export E2E_SUPABASE_SERVICE_ROLE_KEY=<test-projektets service role key>
export E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export E2E_ALLOW_MIGRATION_RESET=true     # endast local: kör `supabase db reset`

bash scripts/run-sync-e2e.sh
```

Utan dessa variabler skriver gaten `SAFE TEST CONFIGURATION NOT PROVIDED` /
`NO MUTATIONS EXECUTED`, rapporterar allt som `NOT EXECUTED` och avslutar med
exit 10. Inget fejkas någonsin som PASS.

## Säkerhetsspärrar

- `E2E_SAFE_TEST_ENV=true` krävs.
- `E2E_ENVIRONMENT=production|prod|live` → hård block (exit 20).
- URL som matchar känd production project ref eller production-host → block.
- URL som återfinns i projektets `.env` → block.
- Inga credentials ligger i repot.

## Sektioner

| Fil | Täcker |
| --- | --- |
| `01_bsa_tenant.sql` | ORG_A/ORG_B med samma booking/staff/date, `recompute_booking_staff_for_day_v2`, cross-tenant isolering, fail-closed vid fel/saknad org, unique-index-identitet |
| `02_security_definer.sql` | Alla SECURITY DEFINER-funktioner syncen använder + låst `search_path` + legacy BSA-RPC revoked |
| `03_revision_lease.sql` | Lease acquire, blockerad andra worker, expiry/takeover, stale commit nekas, ingen revision committas |
| `04_jobs_batch_cursor.sql` | `claim_sync_jobs`, fel worker_token, `complete_sync_job`, `fail_sync_job`, `finalize_sync_batch`, partial → ingen cursor, success → monoton cursor |
| `05_warehouse_unique.sql` | Cross-tenant warehouse-rader samtidigt + idempotens inom tenant |
| `06_canonical_error.sql` | Constraint failure → failed job → partial batch → ingen revision, ingen cursor |
| `07_cancellation_flag_off.sql` | Destruktiv cancellation är AV under hela körningen (testet slår aldrig på den) |
| `99_cleanup.sql` | Skyddsnät som endast tar bort `E2E-*` / `e2e-*`-data |

Varje sektion körs i en transaktion som alltid `ROLLBACK`:as – testet lämnar
inga rader efter sig ens vid avbrott.

## Canonical identity för booking_staff_assignments

Efter STEG 4Q är det gamla globala legacy-indexet
`(booking_id, staff_id, assignment_date)` **borttaget**. Canonical identity är
numera tenant-scopad:

```
(organization_id, booking_id, staff_id, assignment_date)
```

Gaten verifierar detta i `01_bsa_tenant.sql` via `bsa_cross_tenant_coexistence`
och `bsa_legacy_global_index_removed` – båda ska vara PASS (verifierat i riktig
SQL-körning 2026-08-16).

## Migrationsgate

`run-migrations-compile.sh` kör alla migrationer mot en tom scratch-databas och
**failar direkt på första verkliga felet** (ingen kaskad). Bevis skrivs till
`reports/sync-e2e-migrations.log` och `reports/sync-e2e-migrations.json`
(first_failure, sqlstate, error_message, statement_line).

