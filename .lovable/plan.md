
## Problem

På `/staff-management/gps-satellite-map` visas `Boende - Vällsta` som en stor 200 m-cirkel runt en centrumpunkt (bild 2), trots att platsen i `organization_locations` har en exakt polygon (bild 1).

## Rotorsak

`organization_locations` har två ömsesidigt uteslutande geofence-format styrda av kolumnen `geofence_mode`:
- `'circle'` → använd `latitude/longitude` + `radius_meters`
- `'polygon'` → använd `geofence_polygon` (GeoJSON Polygon)

Det är ett av/eller — användarens senaste val gäller. Aldrig båda samtidigt.

`useOrganizationLocations` selectar bara cirkel-fälten. `geofencesToFeatures` ritar därför alltid en cirkel — även för polygon-platser. Boende-Vällsta får 200 m-defaulten.

Bookings/projects/large_projects har ingen polygon-kolumn → de är alltid cirkel.

## Regel som ska gälla efter fix

För varje target/location finns **exakt en** geofence-form:
- `geofence_mode === 'polygon'` med giltig `geofence_polygon` → rita ENDAST polygonen. Ignorera lat/lng/radius helt för visualisering.
- Annars → rita ENDAST cirkeln (lat/lng + radius).

Ingen plats får visas både som polygon och cirkel.

## Åtgärd (endast UI/läsning — ingen DB-ändring)

### 1. `src/hooks/useOrganizationLocations.ts`
- Selecta `geofence_mode, geofence_polygon`.
- Utöka `KnownLocation` med `polygon?: GeoJSON.Polygon`.
- Mappning: om `geofence_mode === 'polygon'` OCH `geofence_polygon` är en giltig Polygon → sätt `polygon`. Annars `polygon = undefined`.

### 2. `src/hooks/useDayKnownSites.ts`
- Skicka vidare `polygon` på org-platser till `KnownSite`. Bookings/projekt/LP oförändrade.

### 3. `src/lib/staff/geofencesToFeatures.ts`
- Lägg till `polygon?: GeoJSON.Polygon` på `GeofenceSite`.
- I `geofencesToFeatures()`:
  - **Om `polygon` finns** → använd den geometrin för både fill och outline. Skapa INGEN cirkel.
  - **Annars** → bygg cirkel via `circleToPolygon(lat,lng,radius)` (som idag).
- Etikett:
  - Polygon: label-point i polygonens bbox-centroid; bara namnet (utan "· N m").
  - Cirkel: lat/lng + "· N m" (som idag).

### 4. `src/components/staff/StaffGpsSatelliteMap.tsx`
- Mappa med `polygon` från `knownSites` till `GeofenceSite`.

### 5. `src/components/staff/RawGpsSatelliteMap.tsx`
- Ingen logikändring — fill/outline-layers tar polygon-geometri direkt.

### 6. Tester (`src/lib/staff/__tests__/geofencesToFeatures.test.ts`)
- Polygon-site → fill/outline använder polygonens exakta koordinater, INGEN circle-approx.
- Cirkel-site (utan polygon) → cirkel som idag.
- `geofence_mode='polygon'` men polygon saknas/ogiltig → faller tillbaka på cirkel (defensivt).
- Aldrig båda geometrierna i samma feature collection för samma id.

## Filer som ändras
- `src/hooks/useOrganizationLocations.ts`
- `src/hooks/useDayKnownSites.ts`
- `src/lib/staff/geofencesToFeatures.ts`
- `src/components/staff/StaffGpsSatelliteMap.tsx`
- `src/lib/staff/__tests__/geofencesToFeatures.test.ts`

## Vad som INTE ändras
- Inga DB-migrations.
- GPS-pings, vistelser och övriga layers oförändrade.
- Bookings/projects/large_projects förblir cirklar (har ingen polygon-kolumn).
- Time engine / matchningslogik oförändrad — `polygon` läggs bara till på UI-objektet.
