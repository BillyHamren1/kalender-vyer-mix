## Diagnos (bekräftad mot DB)

Två öppna `workdays` från **23 april** ligger kvar med `ended_at = NULL`:

| Staff | started_at | hours_open | review_status |
|---|---|---|---|
| Eduards Gribs | 2026-04-23 06:40 | **51 h** | needs_review |
| Matīss Ulmis | 2026-04-23 08:04 | **49 h** | draft |

Inga öppna `location_time_entries` finns — watchdogen `close-stale-workday-entries` har stängt timers/time_reports korrekt, men rör **aldrig** själva `workdays`-raden (verifierat i `index.ts`: bara `location_time_entries` + `time_reports` uppdateras). Därför rapporterar `StaffTimeReports` 50+ h "pågående arbetsdag" trots att inga timers körs.

## Vad jag gör (i ordning)

### 1. Engångsstädning av spöken (insert-tool)
Stäng de två befintliga workdays från 23 april:
- `ended_at = started_at + (planerad arbetsdagslängd)` eller fallback till sista kända aktivitet
- `ended_by = 'system_watchdog'`, `notes ||= '[auto-closed: stale >18h]'`
- Lägg in matchande `workday_flags`-rad: `kind = 'unclear_day_end'`, `resolution_source = 'system_auto_close'`

### 2. Härda watchdog `close-stale-workday-entries` (edge-function)
Lägg till nytt steg D: **closeStaleWorkdays**
- Hitta alla `workdays` där `ended_at IS NULL` AND `started_at < now() - 18h`
- För varje: respektera `plannedEndOfDay()` (BSA→bookings) om sådan finns och ligger i förflutet, annars använd `started_at + 10h` som fallback-tak
- Skriv `ended_at`, `ended_by='system_watchdog'`, `review_status='needs_review'` om inte redan satt
- Skriv `workday_flags` (`unclear_day_end`, `system_auto_close`)
- Idempotent: hoppa över rader som redan stängts

### 3. UI-skydd i `StaffTimeReports.tsx`
Även om watchdogen brister får vyn aldrig visa 50h-pinnar:
- Filtrera bort `workdays` där `started_at` ligger på tidigare datum än valt rapportdatum (om vyn är dagsbaserad)
- För månads-/personalvyn: visa "Anomali — auto-stängd" badge istället för aktiv timer-pill när `hours_open > 18` ELLER `ended_at IS NULL` AND `started_at < today`
- Inga tysta hopp — alltid synlig markering

### 4. Mount `initLocationPingHandler` + admin-knapp
- Mount `initLocationPingHandler` i `MobileAppLayout` (efter push-init) så pings faktiskt fångas på mobilen
- Lägg "📍 Pinga telefon"-knapp i `StaffTimeReports`-rader som visar "Tappad signal" — anropar `request-location-ping` edge-funktionen med staff_id

### 5. Tester (in i quality gate)
Lägg till och länka in i `scripts/test-time-reporting.sh` + manifest:
- `supabase/functions/close-stale-workday-entries/closeStaleWorkdays.contract.test.ts` — låser fast: workdays >18h stängs, plannedEndOfDay respekteras, idempotent, workday_flag skrivs
- `src/test/staffTimeReports.dayFilter.test.ts` — låser fast: ingen 50h-pill renderas, "auto-stängd"-badge visas

## Vad jag INTE gör (utan ny godkänning)
- Ändrar inte EOD-dialogens regelset
- Ändrar inte `useWorkSession` / timer-arkitekturen
- Ändrar inte cron-schemat (kvar `0 2 * * *`) — men watchdogen får mer att göra

## Risker
- Att aggressivt stänga workdays kan trampa på pågående nattskift. Mitigering: 18h-tröskel + respekt för `plannedEndOfDay()` + `unclear_day_end`-flagga så personen kan korrigera dagen efter.

Säg **kör** så kör jag punkt 1→5 i ordning, med körning av hela quality gate-sviten på slutet.