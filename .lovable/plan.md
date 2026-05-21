## Problem

På `/staff-management/gps-satellite-map` visas just nu ALLA aktiva projekts geofences varje dag, oavsett när projektet är aktivt. Det betyder att gamla/framtida projekt syns på dagens karta (t.ex. Wenngarn 6 juni 2026 syns även den 21 maj).

Regeln ska vara: ett projekts geofence visas bara på datum **inom** projektets aktiva fönster:
- **Start** = tidigaste rigg-dag (`rigdaydate`, annars `eventdate`)
- **Slut** = sista nedriggdag (`rigdowndate`, annars `eventdate`)
- Inkluderande i båda ändar.

För **stora projekt** används `start_date` → `end_date` (fallback `event_date`).

## Ändringar

### 1. `useAllActiveProjectGeofences.ts`
- Lägg till parameter `dateStr: string` (yyyy-MM-dd).
- Inkludera `rigdaydate, rigdowndate, eventdate` i `projects`-selecten och `start_date, end_date, event_date` i `large_projects`-selecten.
- Skicka `dateStr` vidare till `filterProjectGeofences`.
- Query-key blir `['all-active-project-geofences', dateStr]`.

### 2. `filterProjectGeofences.ts`
- Ny signatur: `filterProjectGeofences(projects, largeProjects, dateStr)`.
- Ny helper `isDateInWindow(dateStr, startCandidates[], endCandidates[])` som:
  - Tar första icke-tomma `start` (rigdaydate ?? eventdate / start_date ?? event_date).
  - Tar sista icke-tomma `end` (rigdowndate ?? eventdate / end_date ?? event_date).
  - Returnerar `true` om `start <= dateStr <= end`. Saknas både start och end → `false` (visa inte ett projekt utan datum, annars är vi tillbaka i samma problem).
- Lägg in checken direkt efter `isCancelled`-filtret för både projekt och stora projekt.

### 3. `StaffGpsSatelliteMap.tsx`
- Skicka in `dateStr` till hooken: `useAllActiveProjectGeofences(dateStr, true)`.

### 4. Tester (`src/test/filterProjectGeofences.test.ts`)
Lägg till:
- Projekt med `rigdaydate=2026-06-05`, `rigdowndate=2026-06-07` → visas 5/6, 6/6, 7/6 men inte 4/6 eller 8/6.
- Stort projekt med `start_date=2026-06-01`, `end_date=2026-06-10` → visas 2026-06-05, inte 2026-05-31.
- Projekt utan datum alls → filtreras bort.
- Projekt med endast `eventdate` (ingen rigg/nedrigg) → visas endast på eventdate.

Kör testsviten efter ändring.

## Filer som rörs

- `src/hooks/useAllActiveProjectGeofences.ts`
- `src/lib/staff/filterProjectGeofences.ts`
- `src/components/staff/StaffGpsSatelliteMap.tsx`
- `src/test/filterProjectGeofences.test.ts`

Inga andra konsumenter av `useAllActiveProjectGeofences` / `filterProjectGeofences` existerar (ny hook från förra loopen), så signaturändringen är säker.
