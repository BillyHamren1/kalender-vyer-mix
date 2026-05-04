## Mål

Producera ett enda nedladdningsbart felsökningsdokument (`/mnt/documents/time-tracking-debug-2026-05-04.md`) med **rådata, loggar och kodreferenser** för dagens tidrapporteringsproblem — så att ChatGPT kan korsläsa GPS, geofence, timer, workday, time_reports och UI-state utan att gissa.

Inget produktivt skrivs — endast SELECT mot DB + läsning av edge-loggar + kodgrep.

## Vad som hamnar i bundeln

### Sektion A — Rådata (rå SQL, ej sammanfattat)

Alla queries filtreras på dagens datum i `Europe/Stockholm` och organisationen för aktuella staff. Resultaten klistras in som JSON-arrays.

1. **GPS-pings** — `staff_location_history` (kolumner som finns: `staff_id, lat, lng, accuracy, speed, recorded_at, time_report_id, created_at`). Notering i bundeln: `battery_level`, `provider`, `source`, `synced_at` finns **inte** i tabellen — det är en lucka som ska redovisas, inte hittas på.
2. **Assistant/geofence events** — `assistant_events` (alla kolumner: event_type, target_*, happened_at, detected_at, source, suggested_action, resolution_status, resolved_at, dedupe_key, metadata, linked_workday_id, linked_time_report_id).
3. **Timer-rader** — `location_time_entries` (id, staff_id, location_id, booking_id, large_project_id, task_id, source, entered_at, exited_at, entry_date, total_minutes, client_dedupe_key, created_at). Både öppna och stängda idag. Notering: `start_source/stop_source/stop_reason/status/device_id/metadata` finns inte i schemat — redovisas som lucka.
4. **Workdays** — `workdays` (id, staff_id, started_at, ended_at, started_by, ended_by, notes, organization_id, samt review-status-kolumner om de finns).
5. **time_reports** — alla rader där `report_date = today` ELLER `created_at::date = today`. Inkluderar `source, source_entry_id, is_subdivision, parent_time_report_id, approved`.
6. **workday_flags** för idag (full radutskrift).
7. **Sync-/queue-tabeller** — listar alla `public`-tabeller vars namn matchar `%queue%|%sync%|%pending%` och dumpar dagens rader. Om inga finns: redovisas som "ingen serverside queue — kön ligger i klientens localStorage/IndexedDB".

### Sektion B — Edge function-loggar (idag)

Sista 200 rader från:
- `mobile-app-api` (filtreras på `start_timer|stop_timer|stale|already_running|no_active_timer|sync_failed|discard|upload_location_batch`)
- `workday` (start/end/current)
- `close-stale-workday-entries` (auto-stop watchdog)
- `day-timeline-engine`
- `reverse-geocode-staff`
- `process-sync-jobs`

För varje träff: timestamp, staff-id, action, status.

### Sektion C — Kodanalys: var fattas auto-stop-beslut?

Kort genomgång (filer + radnummer + 5–10 rader citat) för var och en av användarens 8 frågor:

1. **Var stoppas timer automatiskt?**
   - `supabase/functions/close-stale-workday-entries/index.ts` (server-watchdog, planning-aware via `plannedDay.ts`)
   - `src/hooks/useGeofencing.ts` — `decideExitAction` → `auto_stop_day` / `auto_start_travel` / `prompt_destination`
   - `src/lib/workday/plannedDay.ts` — bestämmer `plannedEndOfDay`
2. **Vilka villkor triggar auto-stop?** — exit-event + planerat slut passerat, stale-flagga, geofence-EXIT med decision.
3. **"No recent ping" → lämnat platsen?** — kolla `useTimerReconciliation.ts` (24h stale), watchdog-funktionen, `pingPlaceSegments.ts`.
4. **Stoppar timer på dålig accuracy?** — grep `accuracy` i `useGeofencing.ts` / `locationPingHandler`.
5. **Stale-state stop?** — `useTimerReconciliation` flaggar (men raderar inte), watchdog stänger.
6. **Lokal timer rensas utan server-stop?** — kolla `eventflow-mobile-timers` writes i `useGeofencing`, `useTimerStartFlow`, `useWorkSession`, `GlobalActiveTimerBanner`.
7. **Server-timer aktiv men inte i UI?** — granska `GlobalActiveTimerBanner` synlighetsvillkor + `useTimerReconciliation` (server-open men ingen lokal nyckel = osynlig).
8. **Flera "sources of truth"?** — kartlägg: `location_time_entries` (server) vs `localStorage["eventflow-mobile-timers"]` (klient) vs `workdays` vs `providerActiveTimers` (Geofencing context).

### Sektion D — UI-state-instrumentation (one-shot, ej permanent)

Eftersom "timer igång men inte i UI" bara går att se från klienten lägger jag in en **temporär debug-route** `/m/debug/timer-state` som dumpar:
- `localStorage["eventflow-mobile-timers"]`
- `localStorage["eventflow-workday-*"]`
- `useGeofencing().activeTimers`
- `useWorkDay()` server-state
- Banner-villkor (samma uttryck som `GlobalActiveTimerBanner` använder, sida vid sida med utfall true/false)
- `useTimerReconciliation().staleTimers`

Personen med osynlig timer öppnar `/m/debug/timer-state`, screenshot eller copy-knapp → klistras in i bundeln. Routen tas bort efter felsökning.

### Sektion E — Korsanalys-tabell

Per staff_id som har aktivitet idag, en tabell:

```text
staff | first_ping | last_ping | open_lte | last_lte_close | workday_open | last_time_report | flags | inkonsistens
```

Med kort prosa per rad: "öppen `location_time_entries` finns men ingen lokal nyckel i klient-screenshot → banner-villkor falskt → osynlig".

## Leverans

En fil: `/mnt/documents/time-tracking-debug-2026-05-04.md` + `<lov-artifact>`-tagg så användaren kan ladda ner direkt.

Plus den temporära debug-routen (sektion D) som en separat liten ändring — den måste byggas i default-läge.

## Tekniska noter / luckor som redovisas öppet

- `staff_location_history` saknar `battery_level`, `provider`, `source`, `synced_at` → kan inte särskilja background/foreground/manual-sync utan klientinstrumentering.
- `location_time_entries` saknar `start_source`, `stop_source`, `stop_reason`, `device_id`, `metadata` → vi vet inte vem/vad som stängde en rad utan att korrelera mot edge-loggar + assistant_events.
- Det finns **ingen serverside sync-queue-tabell** — pending sync ligger i klientens localStorage (`pending-location-time-entries`, `pending-time-reports`). Sektion D fångar detta.

Ingen produktionsdata mutateras. Allt är SELECT + log read + en ny read-only debug-route.