## Mål
Stoppa parallella timers (t.ex. Westers 09:29 + FA Lager 12:28) historiskt och förhindra att det uppstår igen.

## 1. Backfill — städa redan öppna entries
Lägg till `mode: 'backfill'` i edge function `close-stale-workday-entries`:
- Scannar alla `location_time_entries` där `exited_at IS NULL` och `entered_at < now() - 30 min`.
- För varje öppen rad: hämta GPS-pings för den staffen efter `entered_at`. Hitta första ping som ligger >150m från target i ≥30 min sammanhängande "ute".
- Stäng raden vid den tidpunkten (`exited_at`, `total_minutes`, `stop_source='backfill'`, `stop_reason='stale_no_return_30m'`, `stop_metadata={mode:'backfill'}`).
- Om inga pings finns → stäng vid `entered_at + planned_end_of_day` eller fallback `entered_at + 8h`, `stop_reason='stale_no_pings'`.
- Idempotent (skippa om redan stängd). Per-org filter, dry-run-flagga.
- Ny admin-knapp i `AdminTimeReview` "Städa öppna timers" som anropar action.

## 2. Concurrency-regel: location stoppar booking/project
I `src/lib/timerConcurrency.ts` är reglerna redan korrekta (location vs project = switch, `one_active_timer_at_a_time`). Problemet är att switchen kräver UI-bekräftelse — för **geofence-arrival på lager** vill vi auto-switch tyst.

Komplettering i `useGeofencing.ts` `tryAutoSwitchFromArrival`:
- När arrival sker på en `location` (lager) och det finns aktiv `booking`/`project`-timer på annan plats → stoppa den gamla via `saveAndStopTimer` med `stop_reason='switched_to_location'` innan ny location-timer startas. Logga som `auto_switch`.
- Sätt `workday_flag='auto_closed_on_location_arrival'` på den gamla så admin ser det.

## 3. UI-varning: stale ongoing rows
I `src/components/staff/ProjectVisitBlock.tsx` + `ActualDayPanel.tsx`:
- Om `timerActive=true` och senaste GPS-ping för staffen är >30 min gammalt OCH staff är inte på samma plats längre → visa badge "Misstänkt glömd timer" (gul varning) och CTA "Stäng vid sista ping".
- Härleds rent i frontend från `actualVisits` + `timerIntervals` + `lastPingAt`.

## 4. Tester
- `supabase/functions/close-stale-workday-entries/backfill_test.ts` — täcker pings utanför, inga pings, redan stängd, dry-run.
- `src/test/timerConcurrency.autoSwitchOnLocationArrival.test.ts` — verifierar tyst stop av project när location-arrival.
- Uppdatera `src/test/timeReporting.manifest.ts` med båda.

## Tekniska detaljer
- Edge function action-payload: `{ action: 'backfill', dry_run?: boolean, before_iso?: string, organization_id }`.
- Använder service role internt; admin-knapp authas via `verify_jwt + has_role('admin')`.
- Memory-uppdatering: nytt entry `mem://features/field-staff/stale-timer-backfill-v1.md` + Core-rad om auto-switch på location-arrival.

## Filer som ändras/skapas
- `supabase/functions/close-stale-workday-entries/index.ts` (utöka)
- `supabase/functions/close-stale-workday-entries/backfill_test.ts` (ny)
- `src/hooks/useGeofencing.ts` (auto-switch silent stop)
- `src/components/staff/ProjectVisitBlock.tsx` (stale badge data)
- `src/components/staff/ActualDayPanel.tsx` (stale badge UI)
- `src/pages/AdminTimeReview.tsx` (knapp "Städa öppna timers")
- `src/test/timerConcurrency.autoSwitchOnLocationArrival.test.ts` (ny)
- `src/test/timeReporting.manifest.ts` (uppdatera)
- `.lovable/memory/features/field-staff/stale-timer-backfill-v1.md` (ny) + index
