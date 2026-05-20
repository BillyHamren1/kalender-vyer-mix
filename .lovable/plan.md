## Mål
Visa alla `organization_locations` (lager/kontor/boenden) och dagens "targets" (bokningar/projekt/large_projects) som geofence-cirklar ovanpå satellitkartan på `/staff-management/gps-satellite-map`.

## Datakällor (återanvänds, inga nya queries skapas)
- `useOrganizationLocations()` → alla lokationer för organisationen (alltid på kartan).
- `useDayKnownSites(staffId, date)` → leveranskoordinater för dagens TR/LTE-bokningar, dagens lokala projekt och large_projects. Använder samma `staffId` + `date` som pings-hooken redan har. Detta är samma "kända platser" som GPS-tolkningen använder — så kartan visar exakt vad systemet matchar mot.

Resultatet = en `KnownSite[]` med `{id, name, lat, lng, radiusMeters}`.

## UI-tillägg i `RawGpsSatelliteMap.tsx`
Tre nya Mapbox-lager (under befintliga ping-lager):

1. `geofence-fill` — polygonfyllning per cirkel, mycket låg opacity (~0.10).
2. `geofence-outline` — linje längs cirkelranden, 1,5 px.
3. `geofence-label` — symbol med plats-/projektnamn + radie.

Färgkodning per typ (avläst från `id`-prefix):
- `loc:` (organization_locations) → blå
- `booking:` → grön
- `project:` → orange
- `large:` → lila

Cirkel → polygon görs med befintlig `src/lib/maps/circleToPolygon.ts` (64 segment räcker).

Klick på en geofence öppnar popup med `Namn · Radie m · Typ · Lat/Lng`.

## Toggle i topbar (`StaffGpsSatelliteMap.tsx`)
Två kompakta checkboxes till höger om datumväljaren:
- ☑ Visa platser (organization_locations)
- ☑ Visa targets (dagens bokningar/projekt)

Default: båda på. State lyfts från komponenten och skickas som props till `RawGpsSatelliteMap` (`showLocations`, `showTargets`, `knownSites`). Kartan känner inte till var datan kommer från, bara `geofences: KnownSite[]`.

## Pure helpers / tester
Ny pure helper `src/lib/staff/geofencesToFeatures.ts`:
- `geofencesToFeatures(sites: KnownSite[]): { fill: FeatureCollection; outline: FeatureCollection; labels: FeatureCollection }`
- Använder `circleToPolygon` för geometrin och prefix-baserad färg/typ-mappning.

Vitest-test som verifierar:
- Tom input → tre tomma feature collections.
- En cirkel → 65 koordinater (polygon stängd).
- Prefix → korrekt `type`/`color`-property.
- Radie reflekteras i `labels`-feature-properties.

## Vad detta INTE gör
- Inga DB-skrivningar, inga edge functions, inga migrationer.
- Ingen "alla projekt någonsin" — bara dagens targets (annars blir kartan oläslig). Vill du även se historiska/framtida projekt lägger vi en tredje toggle senare.
- Pings-filtreringen (5-min labels, stays, segmentfärger) lämnas orörd.

## Filer som ändras / skapas
- `src/lib/staff/geofencesToFeatures.ts` (ny)
- `src/lib/staff/__tests__/geofencesToFeatures.test.ts` (ny)
- `src/components/staff/RawGpsSatelliteMap.tsx` (lägger till 3 lager + props)
- `src/components/staff/StaffGpsSatelliteMap.tsx` (hämtar `useDayKnownSites` + toggles + skickar `geofences`)
