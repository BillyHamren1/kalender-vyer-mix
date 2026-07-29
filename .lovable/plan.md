
## Mål

Fixa de kvarvarande felen i sync-cursor för `booking_import` utan att röra kalender, produktsync eller UI. Servern äger cursorn. Cursor flyttas endast när HELA batchen är klar utan fel. Single-booking-syncar rör aldrig batch-cursor/status. Frontend skriver aldrig cursorn.

## Databasmigration

**A. Bättre deduplicering per (org, sync_type)** (idempotent, ersätter den tidigare deduplicerings-migrationen — vi lämnar den gamla orörd men lägger en ny som återstädar rader som skulle sparats "fel" enligt ny prioritet):

Prioritet vid dedup:
1. `last_sync_status = 'success'` med störst `last_sync_timestamp`.
2. Annars störst `last_sync_timestamp` oavsett status.
3. Annars `updated_at` DESC.

Använder `DISTINCT ON` + partiell `DELETE`. UNIQUE-constrainten `(organization_id, sync_type)` finns redan från förra migrationen.

**B. `booking_sync_jobs.batch_id`** (uuid, nullable, indexerad). Bakåtkompatibel — gamla rader har `NULL`.

**C. Ny tabell `sync_batches`** med:
- `id uuid pk`, `organization_id uuid not null`, `sync_type text not null`
- `planned_cursor timestamptz not null` (satts vid start = `importStartedAt`)
- `total_jobs int`, `succeeded_jobs int`, `failed_jobs int`
- `status text` (`pending` | `success` | `partial` | `failed`)
- `started_at`, `completed_at`, standardstämplar
- GRANTs enligt regel (endast `service_role` behöver skriva — edge functions kör med den; ingen `anon` eller `authenticated` access)
- RLS enabled, en policy för `service_role` (via `has_role` behövs inte — service_role bypass:ar RLS ändå men vi ENABLAR RLS + tom policy för hygien).

## Edge Functions

### `supabase/functions/import-bookings/index.ts`

1. **Single-booking-refresh rör aldrig sync_state**: hoppa över `in_progress`-upserten på rad 2114 och final-upserten om `isSingleBookingRefresh`.
2. **Batch-läge (incremental/full/historical, ej single)**:
   - Skapa en `sync_batches`-rad före kön: `planned_cursor = importStartedAt`, `status='pending'`.
   - Uppdatera `sync_state` till `in_progress` (metadata: `batch_id`, `planned_cursor`). **Rör INTE `last_sync_timestamp`.**
   - `enqueueIncrementalSyncJobs` tar emot `batchId` och sätter `batch_id` på både nyinsertade och existerande pending/processing-jobb (`UPDATE ... SET batch_id = coalesce(batch_id, $1)`). Så coalesced jobb tillhör alltid nuvarande batch.
   - Sätt `sync_batches.total_jobs = queued + alreadyQueued`. Om `total_jobs = 0` → markera batchen `success` direkt och flytta cursor.
   - Ta bort rad 2333–2354 som idag skriver `last_sync_timestamp` vid kö.
3. **Rensa den historiska "inline batch-completion"** vid rad 4090–4122 — vi kör inte längre batch inline i den vägen (kön äger den). Behåll för säkerhets skull men kringgärda med `!isSingleBookingRefresh && !enqueuedForWorker`. I praktiken alltid `enqueuedForWorker=true` på batch nu, så koden träffas inte längre.
4. **Response-kontrakt** vid kö: `{ success: true, queued: true, completed: false, batch_id, results: { total, queued_jobs } }`. Vid single: som förut plus `queued: false, completed: true`.

### `supabase/functions/process-sync-jobs/index.ts`

Ny post-processing i `runOne`:
1. Efter att jobbraderna markerats `completed`/`failed`, hämta `batch_id` för de uppdaterade raderna (behåll listan i minnet — vi vet redan `group.batchId`? — vi läser `batch_id` från claimed job payload; utöka `ClaimedJob`).
2. Anropa ny helper `finalizeBatchIfDone(supabase, batchId)`:
   - `SELECT count(*) filter (where status='pending' or status='processing') AS remaining,
              count(*) filter (where status='completed') AS ok,
              count(*) filter (where status='failed') AS bad FROM booking_sync_jobs WHERE batch_id=$1`.
   - Om `remaining=0`: uppdatera `sync_batches` (`completed_at`, `succeeded_jobs`, `failed_jobs`, `status`) OCH om `bad=0`, upsertsätt `sync_state.last_sync_timestamp = planned_cursor`, `last_sync_status='success'`. Om `bad>0`, sätt `sync_state.last_sync_status='partial'` och flytta **inte** cursor.
3. Utökade strukturerade loggar med `batch_id`, `remaining`, `ok`, `bad`.

Uppdatera SQL-funktionen `claim_sync_jobs` (ny migration eller returnera `batch_id` via `SELECT *`) — den returnerar redan `SETOF booking_sync_jobs`, så när kolumnen finns kommer den med gratis. Bara type-uppdateringen på klienten (`ClaimedJob.batch_id`).

### `_shared` helper

Ny fil `supabase/functions/_shared/syncBatch.ts` med `createBatch`, `attachJobsToBatch`, `finalizeBatchIfDone` — så både `import-bookings` och `process-sync-jobs` delar logiken.

## Frontend

### `src/services/syncStateService.ts`
- Ta bort `last_sync_timestamp` ur `updateSyncState`-signaturen (typenivå + runtime strip). Alla frontend-anrop kan bara skriva `last_sync_status`/`last_sync_mode`/`metadata`.
- Runtime-guard: om caller ändå skickar `last_sync_timestamp`, logga varning och droppa fältet.

### `src/services/importService.ts`
- Ta bort blocket vid rad 313–323 som skriver `last_sync_timestamp` — frontend rör aldrig cursorn.
- Uppdatera post-response-hanteringen så att `queued: true` inte visar "sync completed" — ska visa "sync started" (finns delvis redan).
- Behåll `updateSyncState(..., { last_sync_status: 'failed', metadata })` vid rena frontend-fel (server nåddes aldrig) — men helst logga bara. Vi behåller `failed` för att UI ska kunna visa senaste körning; det överskrivs sen av servern.
- Returnera `completed: false` i `ImportResults` när servern svarar `queued: true`, `completed: true` annars.

### Tester
Nya/uppdaterade Vitest-filer:
- `src/test/syncCursorServerAuthority.contract.test.ts` — verifierar att `importService` **aldrig** skickar `last_sync_timestamp` till `updateSyncState`.
- `src/test/syncStateOrgIsolation.contract.test.ts` — utöka: `updateSyncState` accepterar inte `last_sync_timestamp` (runtime droppas).
- `supabase/functions/import-bookings/singleBookingCursorGuard.contract.test.ts` — enhetstest som mockar supabase och kör vägen `syncMode='single'`; asserta att `sync_state` INTE upsertas.
- `supabase/functions/_shared/syncBatch.contract.test.ts` — `finalizeBatchIfDone` avancerar cursor endast när `remaining=0 && bad=0`.

## Filer som ändras

**Skapas:**
- `supabase/migrations/<ts>_sync_batches_and_dedup.sql`
- `supabase/functions/_shared/syncBatch.ts`
- `supabase/functions/_shared/syncBatch.contract.test.ts`
- `supabase/functions/import-bookings/singleBookingCursorGuard.contract.test.ts`
- `src/test/syncCursorServerAuthority.contract.test.ts`

**Ändras:**
- `supabase/functions/import-bookings/index.ts` (single-guard, batch skapas, cursor-writes bort)
- `supabase/functions/process-sync-jobs/index.ts` (batch-finalisering, `batch_id` i claim)
- `src/services/syncStateService.ts` (ta bort `last_sync_timestamp` från update-yta)
- `src/services/importService.ts` (ta bort client cursor-write)
- `src/test/syncStateOrgIsolation.contract.test.ts` (utöka)

## Vad som INTE ändras

Kalender, bokningsstatus, produktsync, webhookkö-schema (utom kolumn `batch_id`), UI, RLS för `sync_state`/`booking_sync_jobs`.

Vill du att jag går vidare och implementerar hela paketet?
