# GPS Satellitkarta — separat rådata-vy

## Mål
En helt isolerad adminvy som ritar **alla** GPS-pings från `staff_location_history` för en vald person + dag på en Mapbox-satellitkarta. Ingen tolkning, ingen filtrering, inget Time Engine.

## Route
- `GET /staff-management/gps-satellite-map?staffId=...&date=YYYY-MM-DD`
- Registreras i `src/App.tsx` bredvid övriga `/staff-management/*` routes (lazy import).

## Datakälla
Direkt query mot `staff_location_history` via Supabase-klienten (RLS sköter org-isolering — samma mönster som befintliga `useDayPings`):

```ts
supabase.from('staff_location_history')
  .select('id, recorded_at, lat, lng, accuracy, speed, source, battery_percent, is_charging, app_version, app_build, platform, os_version, device_model, app_id')
  .eq('staff_id', staffId)
  .gte('recorded_at', `${date}T00:00:00.000Z`)
  .lte('recorded_at', `${date}T23:59:59.999Z`)
  .order('recorded_at', { ascending: true })
  .limit(50000);
```

Ingen edge function behövs (RLS + direct select räcker, hindrar att vyn smyger sig in i Time Engine-stacken). Lägger jag till en edge function tar jag den i en uppföljning om RLS visar sig blockera.

## Filer

**Nya**
- `src/hooks/staff/useStaffGpsPingsForDay.ts` — React Query-hook (key `['staff-gps-raw', staffId, date]`, staleTime 30s). Returnerar rådata 1:1 utan transformation utöver `Number()` på lat/lng/accuracy/speed/battery.
- `src/components/staff/RawGpsSatelliteMap.tsx` — Mapbox-karta via befintlig `MapboxMap` (style=`satellite`). Ritar:
  - GeoJSON-linje mellan alla pings i tidsordning (tunn neon-linje).
  - Circle-layer för varje ping (liten prick, färgad efter tid via interpolate — bara visuellt, ingen klassning).
  - Två markers: första (grön) + sista (röd) ping.
  - Klick på ping öppnar Mapbox `Popup` med alla fält (tid, lat, lng, accuracy, speed, source, battery, charging, app_version, app_build, platform, os_version, device_model, app_id). Saknat fält → `—`.
  - `fitBounds` på alla pings vid load.
- `src/components/staff/StaffGpsSatelliteMap.tsx` — composer: topbar (rubrik, personväljare, datumväljare, summary chips: count / första / sista / senaste build+device), karta i övre delen, tabell under.
- `src/pages/StaffGpsSatelliteMap.tsx` — page wrapper, läser `staffId`/`date` ur query params, default = idag + första personen i listan.

**Justerade**
- `src/App.tsx` — registrera ny route.
- `src/pages/StaffTimeReports.tsx` (och `StaffTimeReportDay.tsx`) — liten knapp "Öppna GPS-karta" som länkar med `staffId` + aktuellt datum.

**Inget** rörs i: `src/lib/time-engine/*`, `src/lib/staff/*`, `supabase/functions/_shared/time-engine/*`, `report_candidate_blocks`, `display_blocks`, `staff_day_report_cache`, `staff_day_submissions`, `workdays`, `time_reports`, `assistant_events`. Vyn importerar inget från dessa moduler.

## UI

**Topbar**
- Rubrik "GPS satellitkarta"
- Personväljare (återanvänd `StaffSelect`/listan från `StaffTimeReports`)
- Datumväljare (shadcn DatePicker, `pointer-events-auto`)
- Chips: `N pings`, `Första HH:MM:SS`, `Sista HH:MM:SS`, `Senaste build: X (device)`

**Karta**
- `MapboxMap style="satellite"` (style-URL `mapbox://styles/mapbox/satellite-streets-v12` finns redan i `STYLE_URL.satellite`).
- Alla pings ritas — ingen decimering, ingen min-distans, ingen tidsfilter.

**Tabell**
- Under kartan, scrollbar. Kolumner: Tid, Lat, Lng, Accuracy, Speed, Source, Battery, Build, Device. Samma `data.length` som markers på kartan.

**Tomt läge**
- "Inga GPS-pings hittades för vald person och dag."

## Tester
- `src/test/staffGpsSatelliteMap.contract.test.ts` — kontraktstest:
  1. `useStaffGpsPingsForDay` returnerar exakt det `supabase.from(...).select(...)` returnerar (ingen filtrering/dedup/klustring).
  2. Hooken importerar **inte** från `@/lib/time-engine`, `@/lib/staff/dayEventTimeline`, `@/lib/staff/displayTimelineV2`, `time-engine/*`, `reportCandidate*`, `workday*` (grep i kompilerad källa).
  3. `RawGpsSatelliteMap` ritar `data.length` features.
- Manuell QA: Billy 2026-05-20 — count i summary = count i tabell = antal circles.

## Rapport efter implementation
- Route: `/staff-management/gps-satellite-map`
- Datakälla: `staff_location_history` direkt via supabase-js
- Satellitvy: `mapbox/satellite-streets-v12`
- Ingen filtrering/klustring/tolkning (verifierat via import-grep-test)
- Alla pings i karta + tabell (samma `data.length`)

## Tekniska detaljer
- Mapbox-token via befintlig `useMapboxToken` / `MapboxMap`.
- Layer-ids prefixas `gps-raw-*` så de inte krockar med ev. annan karta.
- Re-render vid byte av staff/date → ta bort gamla source/layer innan ny läggs till.
- `recorded_at` formateras i lokal tid (Europe/Stockholm) i tabell/popup, men sorteras på ISO-värdet från DB.
