
# Tidrapport-fix: workday primär, aktivitet sekundär, en ägare för time_reports

## Problem (nuläge, exakt)

1. **`useWorkDayTimer.ts`** härleder fortfarande dagen från `eventflow-workday-start` i localStorage + earliest active timer. Workdays-tabellen finns men frontend ignorerar den. Två parallella sanningar.
2. **DB-trigger `trg_sync_location_entry_to_time_report`** skriver fortfarande `time_reports` (source `location_auto`) varje gång en `location_time_entries`-rad stängs. Samtidigt skapar `useWorkSession.stopSession` egna `time_reports` via `createTimeReport`. Båda kan stämpla samma pass → dubbelrapport-risk + `tr_prevent_time_report_overlap` kan skjuta ner det "äkta" sparet.
3. **`useWorkSession.tsx` rad 349**: `savedReportId = (stopped as any)?.serverEntryId`. `serverEntryId` är `location_time_entries.id`, inte `time_reports.id`. `createEndOfDayAnomaly` länkar därmed `time_report_id` mot fel id-typ.
4. **Stale-flow (`MobileGlobalOverlays.handleStaleSave`)** skapar `time_report` direkt mot `mobileApi.createTimeReport` och anropar separat `stopLocationTimer` — utan att gå genom workday-modellen och utan att rätt id-koppling används.
5. **Startflöde**: `requestStart` → `performStart` → `startSession` → *sen* `syncWorkDayStart` (fire-and-forget). Activity skapas innan workday garanterat finns. "Aktivitet först, dag sen".

## Åtgärder per fil

### A. `useWorkDayTimer.ts` — server-driven, ingen activity-härledning
Skrivs om så att den enda källan är **`useWorkDay` (server)** + en tunn lokal cache (`eventflow-workday-cache`) som *bara* behövs för första render innan nätverket svarat. Ta bort:
- `earliestActiveStart()`
- auto-start från active timers
- 18h day-rollover-skydd (servern äger detta)
- `eventflow-workday-start` som primär (migreras till read-only legacy fallback en release, sen bort)

Ny shape:
```ts
const { current } = useWorkDay();          // server, realtime
const startIso = current?.started_at ?? cache;
const isActive = !!startIso && !current?.ended_at;
```
`endWorkDay()` blir bara ett event som banner redan dispatchar — själva stoppet är server-funktionen `workday.end`.

### B. `useWorkDay.ts` — utöka till riktig kontrollyta
Lägg till:
- `ensureActive(startedAtIso?)` — POST start, no-op om redan öppen (idempotent på server). Returnerar workday.
- `restore()` — explicit alias för `refresh` så call-sites blir läsbara.

API blir: `current`, `isLoading`, `start`, `end`, `ensureActive`, `restore`.

### C. `useTimerStartFlow.ts` — workday-first, await
`performStart` ändras till `async`:
```ts
await ensureWorkDayActive(opts.startedAtIso);  // garanti före aktivitet
const ok = startSession(target, ...);
```
Tar bort `syncWorkDayStart` därifrån (det är nu inbakat i ensureActive). Samma regel gäller alla call-sites eftersom alla går via `requestStart`.

### D. DB-migration — ta bort triggern som skapar `time_reports`
Ny migration:
```sql
DROP TRIGGER IF EXISTS trg_sync_location_entry_to_time_report ON public.location_time_entries;
-- Behåll funktionen ett tag (kan kallas manuellt om backfill behövs), men inaktivera som källa.
COMMENT ON FUNCTION public.sync_location_entry_to_time_report() IS
  'DEPRECATED 2026-04-22: trigger removed. time_reports skapas nu enbart via mobile-app-api.createTimeReport. Funktionen kvar för manuell engångs-backfill.';
```
**Konsekvens:** `location_time_entries` blir ren presence/kontext-data. `time_reports` har en enda ägare: `useWorkSession.stopSession` → `mobileApi.createTimeReport`.
Uppdatera `mobile-app-api/index.ts` kommentaren rad 1215–1219 (Lager-merge) — Lager-presence går nu *via* stopSession som vanligt (med `createsTimeReport: true`-flagga som redan finns för banner-stoppade location-timers).
Uppdatera `StaffTimeReports.tsx` kommentaren rad 90-94 — `source='location_auto'`-rader uppstår inte längre, exclude-filtret kan vara kvar för historiska rader.

### E. `useGeofencing.ts` — tydligt typat returvärde från save-then-stop
Byt `saveAndStopTimer` så det returnerar:
```ts
{ timer: ActiveTimer; serverEntryId: string | null; timeReportId: string | null }
```
Hämta `time_report.id` från `mobileApi.createTimeReport`-svaret (det kommer redan tillbaka som `time_report.id`). Variabelnamn:
- `serverEntryId` = `location_time_entries.id`
- `timeReportId` = `time_reports.id`
- `workdayId` = `workdays.id` (från `useWorkDay`)

### F. `useWorkSession.tsx` — använd rätt id för anomalies
- Byt `savedReportId = (stopped as any)?.serverEntryId` → `savedReportId = stopped.timeReportId`.
- Båda `createEndOfDayAnomaly`-anropen (break-anomaly + post-exit) får rätt `time_report_id`.
- Inget annat ändras i stop-pipelinen — den var redan korrekt arkitektoniskt.
- `endDay()` (om/när det införs som separat verb) anropar `workdayApi.end` direkt utan att stoppa aktivitetstimers. (Aktiviteter stoppas separat via samma EOD-kö i banner.)

### G. `MobileGlobalOverlays.handleStaleSave` — gå genom samma motor
Skriv om så stale-save anropar `stopSession(target, { stopAtIso: cappedStop, breakChoice: { kind:'no_break' } })` istället för rå `mobileApi.createTimeReport`. Då får anomaly-länkningen rätt `time_report_id` automatiskt och `report_date`/midnatt-cap hanteras på samma ställe som vanlig stopp. Tappar inte `location_id` eftersom `timerToTarget` redan plockar upp den.

### H. Borttagning / rensning
- `eventflow-workday-start` localStorage-nyckeln läses inte längre som primär; behåll `clearWorkdayEnded`/`markWorkdayEnded` som UI-hint men koppla även dem till server-state.
- Reconcile-funktionen i `useWorkDayTimer` försvinner i samband med A.
- Kommentarer i `mobile-app-api` och `StaffTimeReports` om `location_auto` uppdateras.

## Migration-krav (måste köras före frontend-deploy)

Ja — **steg D måste köras innan frontend-ändringen i E/F/G deployas**, annars får man en period med både trigger-skapade och hook-skapade rapporter samtidigt → overlap-trigger blockerar sparet.

## Flöden efter ändring

**Start arbetsdag (explicit eller implicit)**
`requestStart(target)` → `ensureWorkDayActive()` (POST `/workday start`, idempotent) → `startSession(target)` → server-anchored entry i `location_time_entries`.

**Start aktivitet med aktiv dag**
`ensureWorkDayActive` returnerar existerande workday omedelbart (en server-tur, idempotent) → activity startar normalt. Dagen rörs inte.

**Stoppa aktivitet ("Avsluta aktivitet")**
`stopSession(target)` → break-dialog vid behov → `createTimeReport` (enda ägaren) → `stopLocationTimer` → ev. `createEndOfDayAnomaly` med korrekt `timeReportId`. Workday lever vidare.

**Avsluta arbetsdag ("Avsluta dagen")**
Banner dispatchar `request-end-day` → kör `stopSession` per aktiv timer sekventiellt → väntar på local-drain → `syncWorkDayEnd()` (POST `/workday end`) → `markWorkdayEnded()` + `workday-ended` event. Header-pillen släcks via realtime från `useWorkDay` (eller event som fallback).

**Stale / recovery**
`StaleTimerDialog` → `handleStaleSave` → `stopSession` med cappad `stopAtIso` → samma motor, samma id-typer, ingen extra trigger inblandad. Workday återställs vid app-mount via `useWorkDay.refresh()` mot servern, inte från activity-timers.

## Filer som ändras

1. `src/hooks/useWorkDayTimer.ts` — skrivs om (server-first)
2. `src/hooks/useWorkDay.ts` — `ensureActive`, `restore` läggs till
3. `src/hooks/useTimerStartFlow.ts` — workday-first await
4. `src/hooks/useGeofencing.ts` — typat returvärde från `saveAndStopTimer`
5. `src/hooks/useWorkSession.tsx` — använd `timeReportId` (rad 349 + båda anomaly-anrop)
6. `src/components/mobile-app/MobileGlobalOverlays.tsx` — `handleStaleSave` via `stopSession`
7. `src/components/mobile-app/GlobalActiveTimerBanner.tsx` — minimal: läs `useWorkDay` för pill-hint, ingen logik-ändring
8. `supabase/functions/mobile-app-api/index.ts` — uppdatera kommentar (rad 1215–1219)
9. `src/pages/StaffTimeReports.tsx` — uppdatera kommentar (rad 90-94)
10. **Ny migration**: `DROP TRIGGER trg_sync_location_entry_to_time_report` + comment
11. Tester: utöka `src/test/workday/` med `workdayFirstStart.test.ts` (ensureActive körs före startSession), `singleOwnerTimeReport.test.ts` (ingen `source='location_auto'` skapas vid stopp), uppdatera `endDayReconciliation.contract.test.ts`-förväntningar.

## Regressionsskydd
- UI på header-pill, banner och TimerRow oförändrat.
- Servern är idempotent på start/end → en burst skapar ingen skada under refaktorn.
- Triggern droppas, inte funktionen — engångs-backfill möjlig om historik visar luckor.
- Kontraktstest låser att `time_reports` bara skapas via `mobile-app-api.createTimeReport`-vägen.
