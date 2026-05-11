## Problem

För Armands 2026-05-09 finns 2161 GPS-pings (00:00–22:42 lokal tid) men `day_timeline_events`-snapshoten innehåller bara 11 events som slutar 11:58. Allt efter 11:58 saknas (Tranås-stopp 13:32–14:14, Stockholm-city 18:50–21:31, Arlanda 21:54+). Adminvyn på `/staff-management/time-reports` visar därför en "Osäker period 08:56→11:31" och sedan ingenting — inte för att GPS:en tystnar utan för att Day Timeline Engine bröt halvvägs.

## Mål

1. Adminvyn visar ALLA segment för hela ping-dygnet (stay/travel/unknown_place/gps_gap) — aldrig en tyst svans efter sista snapshot-eventet.
2. Identifiera och åtgärda varför `day-timeline-engine` slutade efter event #11.
3. Lägg in skydd så det aldrig kan hända i tysthet igen (audit + auto-rebuild om snapshot inte täcker hela ping-spannet).

## Steg

### 1. Diagnostisera bygg-loopen
Läs `supabase/functions/day-timeline-engine/index.ts` och `supabase/functions/_shared/time-engine/buildGpsDayTimeline.ts` (eller motsvarande) och hitta varför loopen stannar. Sannolika misstänkta:
- Hård gräns (`MAX_EVENTS`, `MAX_SEGMENTS`, slice/limit)
- Early-`break` när två `unknown_place` följer på varandra
- Ping-page­ring som hämtar bara första 1000 raderna (Supabase default) — Armands har 2161 pings/dygn
- Tidsfönster (`endOfDay` beräknas på UTC istället för lokal tid)

Loggar via `supabase--edge_function_logs` på `day-timeline-engine` för senaste compute-körningen.

### 2. Fixa rotorsaken
Beroende på fynd: ta bort eller höja gräns, paginera pings i batchar om 1000, eller flytta till lokal-tids-fönster. Spegla samma fix i frontend-byggaren `src/lib/time-engine/buildGpsDayTimeline.ts` så Deno + browser ger identisk output (per memory `gps-day-timeline-v1`).

### 3. Rebuild för verifiering
Trigga `day-timeline-engine` action `compute` (eller `rebuild`) för Armands 9 maj och bekräfta att snapshot nu täcker minst sista pingens timestamp. Verifiera i admin-vyn att Tranås/Stockholm/Arlanda-segmenten dyker upp.

### 4. Skydd mot tyst trunkering
- I edge-funktionen: efter compute, om `max(end_ts) < max(ping.recorded_at) - 30 min` → logga warning + sätt `engine_version` till t.ex. `v2-truncated` så audit-vyn kan flagga.
- I `StaffTimeReportDetail` / `ActualDayPanel`: om snapshot slutar mer än 30 min före sista ping, visa en gul banner "Tidslinjen kan vara ofullständig — pings finns till HH:MM" med knapp **Bygg om dagen** som anropar `day-timeline-engine` med `action:'rebuild'`.

### 5. Bakgrundsjobb (valfritt, separat ticket om tid saknas)
Lägg till nightly cron i `supabase/functions/day-timeline-rebuild-cron` som scannar senaste 7 dygn och rebuildar snapshots där `coverage_gap > 30 min`.

## Tekniska detaljer

- Tabell: `day_timeline_events` (kolumner: ts, end_ts, event_type, matched_site_*, computed_at, engine_version)
- Edge function: `day-timeline-engine` (actions: compute / get / resolve_suggestion)
- Frontend builder: `src/lib/time-engine/buildGpsDayTimeline.ts` (måste matcha Deno-spegling 1:1)
- Filter: alla queries fortsatt scopade till `organization_id` (multi-tenancy core rule)
- Ingen ändring i `time_reports` eller AI-pipeline (motorn = förslag, time_report = sanning per `time-data-authority-v1`)

## Acceptanskriterier

- För Armands 2026-05-09: minst ett stay-segment per stationär period > 15 min efter 11:58 (Tranås, Stockholm, Arlanda).
- För alla staff/dygn: snapshotens sista `end_ts` ≥ sista pingens `recorded_at` − 30 min, annars syns banner i admin.
- Rebuild-knappen i admin triggar `day-timeline-engine` och uppdaterar vyn utan reload (realtime invalidation).
