## Två separata buggar

### 1. "Arbete – okänd plats" trots GPS inne i projekt

Pings från Eduards och Elvijs ligger på 59.64724, 17.71753 — det är projektet **Wenngarns Slott** (delivery_latitude 59.648753, delivery_longitude 17.719797, ca 200 m bort, default-radie 150 m + tolerans 150 m → matchar).

Men `useDayKnownSites` (källan till knownSites för "Faktiska besök & förflyttningar" / DayBlockTimeline) hämtar **bara**:
- `organization_locations` (FA Warehouse mm.)
- `bookings` som finns i dagens `time_reports` eller `location_time_entries`
- `large_projects` som finns i dagens TR/LTE

**Tabellen `projects` är aldrig med.** Står man på ett vanligt lokalt projekt utan att ha startat någon timer än → ingen matchning → segmentet blir `unknown_place` ("Arbete – okänd plats"), oavsett hur mycket pings som ligger inom radien.

### 2. Endast 3–4 ping-prickar syns på kartan trots 336 pings

`StaffMovementMap` ritar varje ping som ETT symbol-lager där pricken (●) och tiden ligger i samma `text-field` med `text-allow-overlap: false` + `text-optional: false`. När personen står stilla hamnar 300+ pings på samma koordinat → labels krockar → Mapbox släcker hela symbolen (prick + tid) på alla utom 3–4. Antalet i chippet ("336 positioner") stämmer; det är bara renderingen som är felaktig.

---

## Plan

### Fix A — `src/hooks/useDayKnownSites.ts`
Lägg till `projects` som källa, parallellt med bookings/large_projects:

- Hämta dagens projekt: alla `projects` där `eventdate=date OR rigdaydate=date OR rigdowndate=date`, plus projekt som personalen är assignad till idag (via `staff_assignments`/BSA – återanvänd samma logik som `mobile-job-visibility-sync` om den finns klientsidig, annars håll det enkelt: dagens projekt + alla `status` aktiva projekt med coords som dyker upp i dagens TR/LTE).
- Filtrera ut `deleted_at not null` och cancelled.
- Push `KnownSite` med `id: 'project:<id>'`, `radiusMeters: address_radius_meters ?? 150`.
- Stöd även `address_geofence_polygon` om `KnownSite`-typen redan har polygonfält (annars: bara cirkel nu, polygon i senare iteration).

Ingen ändring i `pingPlaceSegments.ts` — den matchar redan korrekt så fort sajten kommer in i listan.

### Fix B — `src/components/staff/StaffMovementMap.tsx`
Splitta dot och tid i två lager:

- **`ping-dots` (circle-layer)**: liten cirkel per ping, `circle-allow-overlap: true`, `circle-radius` ~3–4 px, mörk färg + vit halo. Alla 336 pings syns alltid.
- **`ping-times` (symbol-layer)**: bara tid-text, `text-allow-overlap: false`, `text-optional: true` (= dölj label, behåll prick) + `text-padding` så vi tunnar ut till läsbara intervall vid utzoomning.
- Behåll click → popup på dots.

### Fix C — Tester (vitest)
- `src/hooks/__tests__/useDayKnownSites.projects.test.ts`: matchar mock-projekt → KnownSite med rätt id/radius (default 150).
- `src/lib/staff/__tests__/pingPlaceSegments.test.ts` (utöka): pings inom `radius+150` på projekt-KnownSite → visit får `knownPlace.id === 'project:<id>'`, inte unknown.
- Visuell rök-test: efter ändring av kartan, kör en automatkörning på `/staff-management/time-reports` → öppna rörelsekartan för Eduards 2026-05-13 och verifiera att fler än 4 prickar ritas (via DOM/canvas, eller minst kontrollera att circle-source har 99 features).

### Tekniska detaljer

```text
useDayKnownSites
  ├── orgLocations  (befintligt)
  ├── bookings dagens TR/LTE  (befintligt)
  ├── large_projects dagens TR/LTE  (befintligt)
  └── projects  (NYTT)
        - dagens (eventdate/rigdaydate/rigdowndate = date)
        - + projekt referenta i dagens TR/LTE
        - filter: deleted_at IS NULL, planning_status != 'cancelled'
        - radius: address_radius_meters ?? 150
```

```text
StaffMovementMap
  ├── trail-line              (oförändrat)
  ├── ping-dots   (NYTT)      circle, allow-overlap:true
  ├── ping-times  (modifierat) symbol, text-optional:true
  └── start/end markers       (oförändrat)
```

Inga DB-migrationer. Inga edge-function-ändringar. Endast frontend + en hook.

---

## Avgränsningar
- Vi rör inte `resolveWorkTargets` eller backend-time-engine — den känner redan till projekt.
- Vi inför inte polygon-stöd i `useDayKnownSites` i denna PR (om typen `KnownSite` inte redan har polygon — kollas i implement-steget).
- Inget retroaktivt omräknande av historiska "okänd plats"-segment; nästa render plockar upp den nya matchningen automatiskt.