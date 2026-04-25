
# Calendar Sync Stabilization + Activity Auto-Sync

## Diagnos (verifierad mot DB)

**Booking 2604-127** (id `a970e0e5...`):
- Bokningen har 3 datum: rigday 2026-07-20, event 2026-07-22, rigdown 2026-07-27.
- I `calendar_events` finns just nu **6 rigg/nedrigg-events**: rig 07-20, 07-21, 07-22 + rigDown 07-27, 07-28, 07-29.
- `sync_audit_log` visar att import-bookings växlar mellan `events_created=4` och `events_created=0` på olika körningar samtidigt som `expected=6` och `actual=7` är konstant. Mellan körningar **raderas och återskapas dagar** → flimmer.

**Rotorsaker (3 oberoende fel):**

1. **Inget unique-constraint** på `(booking_id, event_type, source_date, organization_id)`. PK är bara `id`. Race conditions vid parallella import-körningar = duplicates → reconciler raderar "extra" → flimmer. (Constraint utlovades i `.lovable/calendar-sync-architecture.md` men finns inte.)

2. **Booking-API:et levererar inkonsistenta datumlistor**. Ibland skickar det bara `rig_up_dates: ["2026-07-20"]`, ibland hela intervallet `["2026-07-20","2026-07-21","2026-07-22"]`. Reconcilern litar blint på senaste payload → events poppar in/ut. Lösning: behandla rig/rigdown som **enskilda ankardatum** (ta bara första/sista), inte expandera intervall.

3. **Aktiviteter felklassas som mismatch**. `mismatch_details: extra: activity|2026-07-20` — audit-jämförelsen filtrerar inte bort `event_type='activity'` när den jämför mot bokningens "expected"-set. Skapar evig "has_mismatch=true" och triggar onödiga UPDATE-passes.

**Aktivitets-syncen (separat problem):**
- 201 `establishment_tasks` har ingen `calendar_event_id` → syns aldrig i personalkalendern.
- Sync är manuell (kallas bara från `EstablishmentTaskDetailSheet` + `ActivityPlannerSheet`). Bulkimporterade tasks blir aldrig synkade.
- Användaren har valt: **route activities → `transport`-kolumnen**.

---

## Leveransplan

### Fas A — Database hardening (migration)

**A1. Cleanup duplicates (defensivt — vi vet att inga finns idag, men gör det säkert):**
```sql
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY booking_id, event_type, source_date, organization_id
           ORDER BY created_at ASC
         ) AS rn
  FROM calendar_events
  WHERE booking_id IS NOT NULL
    AND source_date IS NOT NULL
    AND event_type != 'activity'
)
DELETE FROM calendar_events WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
```

**A2. Lägg till unique-constraint** (matchar arkitekturdokumentet):
```sql
ALTER TABLE calendar_events
  ADD CONSTRAINT uq_calendar_event_identity
  UNIQUE (booking_id, event_type, source_date, organization_id);
```

**A3. Skydda `event_type='activity'` från reconciler-radering** med BEFORE DELETE-trigger som lyfter exception om sessions-flaggan `app.allow_activity_delete` inte är satt. Activity-syncen sätter flaggan när den raderar.

**A4. AFTER INSERT/UPDATE/DELETE-trigger på `establishment_tasks`** som upserts/raderar matching `calendar_events`-rad. Kallar en SECURITY DEFINER-funktion som bygger samma payload som `activityCalendarSyncService.ts`.

**A5. Backfill** för de 201 osynkade activities — kör triggerfunktionen för varje rad i en SQL-loop.

### Fas B — Edge function: import-bookings

**B1. Bevara enbart "ankardatum"** för rig/rigDown:
- `rigDates = [allRigDates[0]]` (bara första rig-dagen)
- `rigdownDates = [allRigdownDates[allRigdownDates.length-1]]` (bara sista rigdown-dagen)
- Stoppar Booking-API:ets fluktuationer mellan single-date och range från att flimra.
- (Eller: håll alla, men dedupera mot bara `rigdaydate`/`rigdowndate` om arrays inte är konsekvent skickade. Beslut tas vid implementation efter att ha läst Booking-payload-loggar för flera bokningar.)

**B2. Byt insert/update → upsert** med `onConflict: 'booking_id,event_type,source_date,organization_id'`. Gör reconcilern idempotent även vid race.

**B3. Audit-filter:** filtrera bort `event_type='activity'` ur både `actual_events` och `mismatch_details`. Reconcilern äger inte activities.

**B4. Aldrig DELETE när expected är tom + actual > 0** + booking är `CONFIRMED`. Logga warning istället. (Skydd mot Booking-API som kortvarigt returnerar tom payload.)

### Fas C — Frontend

**C1. `activityCalendarSyncService.ts`:** byt `DEFAULT_RESOURCE_ID = 'team-tasks'` → `'transport'`. Då hamnar activities i Transport-kolumnen i personalkalendern (per användarval).

**C2. `useTaskCalendarEvents.ts`:** kan tas bort eller behållas som no-op — eftersom DB-triggern nu skapar riktiga calendar_events behövs ingen overlay-fetch. Behåller den som tom array tills vidare för att inte bryta importer.

### Fas D — Verifiering

1. Kör import-bookings för 2604-127 → bekräfta exakt 2 events kvar (rig 07-20 + rigDown 07-27) eller motsvarande beslutad ankarmodell.
2. Vänta 2 cron-cykler → bekräfta `events_created=0, events_updated=0, events_deleted=0` (helt stabilt, ingen mismatch).
3. Kontrollera att 201 backfilled activities visas i Transport-kolumnen.
4. Skapa ny test-task → bekräfta att den dyker upp i kalendern utan manuell sync.

---

## Ordning vid implementation
1. Migration (A1–A5)
2. activityCalendarSyncService.ts (C1)
3. import-bookings (B1–B4) → deploy
4. Verifiera 2604-127 + några till
5. Memory-uppdatering: ny rule i `mem://architecture/calendar-sync-consistency` om unique-constraint, anchor-dates och activity-protection.

## Risk
- B1 anchor-modellen kan **dölja** flerdagars rigg om Booking faktiskt har sådana. Mitigation: behåll `allRigDates` som källa men dedupera till första + verifiera mot ett par flerdagsbokningar i DB innan deploy.
- Activity-trigger kan ge load vid bulk-update av tasks. Mitigation: triggerfunktionen är SECURITY DEFINER och stannar vid `WHEN (NEW.start_date IS NOT NULL)`.
