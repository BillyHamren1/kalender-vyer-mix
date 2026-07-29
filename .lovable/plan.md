
# Fix batch- & cursor-hantering i booking-importen

Isolerad, kirurgisk uppdatering av batch/cursor-lagret. Ingen bokningsmappning, kalenderreconcile, produktimport eller cancellation-logik ändras.

## 1. Databasmigration (idempotent)

**Nya objekt:**
- `sync_batch_jobs (batch_id uuid, job_id uuid, created_at timestamptz, PRIMARY KEY(batch_id, job_id))`, FK till `sync_batches(id)` och `booking_sync_jobs(id)`, index på `job_id`. `GRANT ALL` till `service_role`, RLS on + service-role-only-policy (samma som `sync_batches`).
- Partial UNIQUE index på `booking_sync_jobs(organization_id, booking_id) WHERE status IN ('pending','processing')` — förhindrar race där två samtidiga imports skapar dubblettjobb.
- Datamigrering: `INSERT INTO sync_batch_jobs SELECT batch_id, id FROM booking_sync_jobs WHERE batch_id IS NOT NULL ON CONFLICT DO NOTHING;` — bevarar befintliga kopplingar.
- `booking_sync_jobs.batch_id` behålls i schemat men blir bakåtkompatibel/no-op (finaliseringen läser ENDAST från `sync_batch_jobs`).

**Ny RPC `public.finalize_sync_batch(_batch_id uuid)` (SECURITY DEFINER, plpgsql):**
Kör atomiskt i EN transaktion:
1. `SELECT ... FROM sync_batches WHERE id=_batch_id FOR UPDATE` — låser batchraden.
2. Om `status <> 'pending'` → returnera `{finalized:false, status, cursor_advanced_to:null}`.
3. Läs alla jobb via join `sync_batch_jobs → booking_sync_jobs`. Räkna pending/processing/completed/failed (samt `permanently_failed = failed AND attempts >= max_attempts`).
4. Om `pending+processing > 0` → returnera `{finalized:false, status:'pending', remaining}`.
5. Om `permanently_failed > 0` → sätt batch `status='partial'`, `succeeded/failed_jobs`, `completed_at=now()`. Uppdatera `sync_state` (per (org, sync_type)) med `last_sync_status='partial'` + metadata — men rör INTE `last_sync_timestamp`.
6. Om alla `completed` → sätt `status='success'`. Monoton cursor-uppdatering:
   ```sql
   UPDATE sync_state
      SET last_sync_timestamp = _planned_cursor,
          last_sync_status = 'success',
          last_sync_mode = 'incremental',
          metadata = jsonb_set(...),
          updated_at = now()
    WHERE organization_id = _org AND sync_type = _sync_type
      AND (last_sync_timestamp IS NULL OR last_sync_timestamp < _planned_cursor);
   ```
   Om `ROW_COUNT=0` (befintlig cursor är nyare) → logga via `RAISE NOTICE`, returnera `cursor_advanced_to=null, monotonic_skip=true`.
7. Om jobb finns i `failed` men fortfarande har `attempts < max_attempts` OCH `next_attempt_at` i framtiden → batch räknas som `pending` (retrying) — inte finaliseras än.
8. Returnera `TABLE(finalized boolean, status text, succeeded int, failed int, remaining int, cursor_advanced_to timestamptz, monotonic_skip boolean)`.

RPC `GRANT EXECUTE ... TO service_role`.

Retry-fält: `booking_sync_jobs` har redan `attempts, max_attempts`. Lägg till `next_attempt_at timestamptz` om det saknas. `claim_sync_jobs` filtrerar redan `status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())` — verifieras; annars justeras.

## 2. `supabase/functions/_shared/syncBatch.ts`

- `createBatch` oförändrad.
- **`attachJobsToBatch` (omskriven):** för varje kandidat-`booking_id`:
  1. Försök `INSERT INTO booking_sync_jobs (booking_id, organization_id, event_type, status='pending', batch_id) ON CONFLICT (organization_id, booking_id) WHERE status IN ('pending','processing') DO NOTHING RETURNING id`.
  2. Om raden inte skapades (någon annan hade redan ett aktivt jobb) → `SELECT id FROM booking_sync_jobs WHERE organization_id=$1 AND booking_id=$2 AND status IN ('pending','processing') LIMIT 1`.
  3. `INSERT INTO sync_batch_jobs (batch_id, job_id) VALUES (...) ON CONFLICT DO NOTHING` — idempotent koppling. Samma jobb kan tillhöra flera aktiva batcher.
  4. Uppdatera `sync_batches.total_jobs` från `COUNT(*) FROM sync_batch_jobs WHERE batch_id=$1`.
- **`finalizeBatchIfDone` (omskriven):** anropar endast `supabase.rpc('finalize_sync_batch', { _batch_id })` och returnerar resultatet. All logik ligger nu i DB — hindrar race mellan workers, ger atomisk cursor+status-skrivning, garanterar monotonicitet.

## 3. `supabase/functions/import-bookings/index.ts`

- `enqueueIncrementalSyncJobs`: skapa inte längre jobb via `insert` direkt; anropa `attachJobsToBatch` som gör upsert + koppling. Detta löser many-to-many när samma bokning redan är köad från tidigare batch. Fältet `batch_id` sätts på nya jobb för bakåtkompatibilitet men är inte längre auktoritativ.
- Steg 4 (den inline `sync_state` upsert som skriver `last_sync_status='in_progress'` efter enqueue) BEHÅLLS men markeras "status only, cursor rörs aldrig". Ingen förändring av `last_sync_timestamp` — bekräftas.
- Efter `attachJobsToBatch`: om `totalJobs === 0` anropa RPC:n för tom-batch-finalisering direkt (RPC:n hanterar även monoton cursor).
- Inledande in_progress-upsert (raderna ~2122–2138) BEHÅLLS men verifieras att den inte skriver `last_sync_timestamp`.
- Single-booking-refresh: `isSingleBookingRefresh` → rör aldrig `sync_state` (redan så, verifieras).

## 4. `supabase/functions/process-sync-jobs/index.ts`

- Uppdatera claim-loopen: när jobb blir `completed`/`failed` (permanent) → hitta alla batch-id via `sync_batch_jobs` för jobbet (inte bara `job.batch_id`) och trigga RPC-finalisering för varje. Ett jobb som tillhör flera batcher finaliserar då flera batcher korrekt.
- Retry-hantering: vid retriable fel → sätt `status='pending', attempts=attempts+1, next_attempt_at=now()+INTERVAL '30s'*attempts`. Vid `attempts >= max_attempts` eller permanent fel → `status='failed'`. Nu släpper claim jobbet tillbaka och RPC:n behåller batchen som `pending` medan retries återstår.

## 5. Frontend

**`src/services/syncStateService.ts`:**
- `updateSyncState` skalas ner till ENDAST `metadata` (för lokal UI-metadata om det ens behövs). Ta bort `last_sync_status` och `last_sync_mode` från update-ytan.
- Alternativt: exportera `readSyncState` (=`getSyncState`) och ta bort `updateSyncState/initializeSyncState` helt. Behåll endast läsning.

**`src/services/importService.ts`:**
- Ta bort ALLA `updateSyncState`-anrop (raderna 183, 268, 291, 323, 400). Ersätt med lokal `console.log` + toast.
- `getSyncStatus` läser fortfarande från `sync_state` via `getSyncState` — det är läsning, tillåtet.
- Behåll `queued`/`completed`/`batch_id` i returkontraktet.

**`src/services/__tests__/`** + `src/test/`: uppdatera befintliga tester som antog att `updateSyncState` fanns.

## 6. `reconcile-booking-status/index.ts`

Rader 184–186 skriver `sync_state` direkt. Behålls (den funktionen kör sin egen reconcile och äger sin egen sync_type — inte `booking_import`), men verifieras att den använder en egen `sync_type` (t.ex. `'reconcile_booking_status'`) så den inte krockar med batch-cursorn. Om samma sync_type används → byt namn. **Ingen annan förändring av reconcile-logik.**

## 7. Tester (`src/test/` + `supabase/functions/_shared/`)

Nya kontraktstester:
- `batchManyToManyCoalescing.contract.test.ts` — TEST 1–4: två batcher delar samma jobb, båda får relation, båda finaliseras korrekt vid success, ingen får flytta cursor vid failure.
- `batchCursorMonotonic.contract.test.ts` — TEST 5: äldre batch slutförs senare, cursor rör sig inte bakåt.
- `batchFinalizeAtomic.contract.test.ts` — TEST 6: två workers finaliserar samma batch, endast en effekt (mockar RPC-idempotens).
- `batchRetrySameBatch.contract.test.ts` — TEST 7 & 8: retriable→success, permanent failed→held cursor.
- `frontendCannotWriteSyncState.contract.test.ts` — TEST 9: `syncStateService.updateSyncState` finns inte / rör inte kanoniska fält.
- `batchOrgIsolation.contract.test.ts` — TEST 10: org A ↛ org B.
- `batchMigrationBackfill.contract.test.ts` — TEST 11: befintliga `batch_id`-kopplingar bevaras i `sync_batch_jobs`.

RPC-logik (DB-sidan) täcks via mockad supabase-klient som simulerar `rpc('finalize_sync_batch',...)`. Renodlade SQL-tester är inte praktiska i vitest-miljön; RPC-koden verifieras genom att tester kontrollerar att `finalizeBatchIfDone` anropar `.rpc(...)` med rätt args och propagerar returvärdet, samt att `attachJobsToBatch` alltid gör `INSERT ... ON CONFLICT DO NOTHING` mot `sync_batch_jobs`.

## 8. Verifiering

- `tsgo` typecheck.
- `bunx vitest run src/test/ src/services/__tests__/ supabase/functions/_shared/` (batch- och sync-relaterade).
- `supabase/functions/import-bookings/statusDemoteProductGuard.contract.test.ts` fortfarande grön.

## Kvarvarande risker

- Nya partial unique index på `booking_sync_jobs` kan konflikta med befintlig data om det redan finns dubbletter. Migrationen deduperar först (behåller senaste) och skapar sedan indexet.
- Reconcile-funktionens sync_type-namn kontrolleras men logiken rörs inte i övrigt.
- Retry-schemat använder enkel exponential backoff (30s * attempts) — kan justeras senare.
