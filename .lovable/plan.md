

## Exakta geofencer — rita polygon på karta

### Problem
Idag är ett geofence en cirkel `(lat, lng, radius_meters)`. Stora radier ger falska "ankomst" 250 m bort (t.ex. på vägen, hos grannen, på natten när GPS driftar). En cirkel går inte att forma efter en faktisk fastighet/lagergård.

### Lösning
Lägg till **polygon-stöd** ovanpå nuvarande cirkelmodell. Användaren ritar geofencet direkt på en Mapbox-karta i Ops Control Center → Fasta platser. Polygonen är auktoritativ när den finns; cirkeln blir fallback för platser utan ritad polygon (bakåtkompatibelt).

### Datamodell (migration)

Lägg till på `organization_locations`:
- `geofence_polygon jsonb` — GeoJSON `Polygon` i WGS84 (`{"type":"Polygon","coordinates":[[[lng,lat],...]]}`). NULL = använd cirkel.
- `geofence_mode text` default `'circle'` — `'circle'` | `'polygon'`. Vid `polygon` ignoreras `radius_meters` i evaluering.
- (cirkel-fälten behålls som fallback och för migration-paths)

RLS: oförändrad — samma policies som dagens `organization_locations`.

### UI: ny GeofenceMapEditor

Ny komponent `src/components/ops-control/GeofenceMapEditor.tsx`:
- Mapbox GL-karta + `@mapbox/mapbox-gl-draw` (redan installerat).
- Verktygsfält: **Rita polygon**, **Rita cirkel**, **Redigera hörn**, **Ångra**, **Rensa**, **Centrera på adress**.
- Cirkelläge: drag radien visuellt (1–500 m), sparas som `geofence_mode='circle'` + `radius_meters`.
- Polygonläge: klicka för att lägga hörn, dubbelklick för att stänga, dra hörn för att finjustera. Sparas som `geofence_mode='polygon'` + `geofence_polygon`.
- Live-area visas (m²) + visuell varning om polygonen är "för stor" (>10 000 m²) eller "för liten" (<25 m²).
- Bakgrundskarta: satellit-toggle (zoom in på taket).
- "Min position"-knapp som zoomar till användarens GPS för att rita från fält.

### Integration i OrganizationLocationsManager

Ersätt nuvarande "Latitud/Longitud/Radie"-fälten i dialogen med:
- Adressfält + sök (oförändrat → centrerar kartan).
- `<GeofenceMapEditor>` (ca 360 px hög).
- Visar nuvarande geometri vid redigering (cirkel ELLER polygon).
- Spara skickar antingen `{geofence_mode:'circle', latitude, longitude, radius_meters, geofence_polygon: null}` eller `{geofence_mode:'polygon', geofence_polygon: {...}, latitude, longitude}` (lat/lng = polygonens centroid för listvisning/avstånd).

### Backend-evaluering (point-in-polygon)

Uppdatera **alla tre** ställen som idag använder `dist <= radius_meters`:

1. `supabase/functions/mobile-app-api/index.ts` (location_id-geofence-checken vid GPS-ping, rad ~4248).
2. `src/hooks/useGeofencing.ts` (klient-prompts för "You are on site").
3. `src/components/ops-control/OpsLiveMap.tsx` (visuell rendering).

Ny gemensam helper `src/lib/geofenceEval.ts`:
```ts
isInsideGeofence(lat, lng, location): boolean
// polygon → ray-casting point-in-polygon
// circle  → haversine ≤ radius
distanceToGeofenceEdge(lat, lng, location): number
// polygon → min distans till kant; negativt om innanför
// circle  → radius - haversine
```

Edge function använder samma logik (kopia av helpern i `supabase/functions/_shared/geofenceEval.ts`).

### Anti-flapping (löser "loggas in på natten")

För att GPS-drift inte ska trigga falska entries läggs två skydd in:
- **Hysteres**: ENTER kräver `isInside === true` AND avstånd-till-kant ≥ 5 m inåt. EXIT kräver avstånd-till-kant ≥ 15 m utåt. Ersätter dagens `radius + 50` magic number.
- **GPS-noggrannhetsfilter**: pings med `accuracy > 50 m` ignoreras för geofence-evaluering (men sparas i historik). Konfigurerbar per location senare om behov.

### OpsLiveMap-rendering

`OpsLiveMap.tsx` ritar idag en cirkelpolygon från `radius_meters`. Uppdatera så den ritar `geofence_polygon` direkt om mode = polygon, annars befintlig cirkelapproximation. Samma popup, samma färg (#7c3aed).

### Validering

- A: Rita polygon runt enbart lagerhuset → personal som åker förbi 100 m bort triggar inte ENTER.
- B: Befintliga locations utan polygon fungerar oförändrat (cirkel-fallback).
- C: Spara polygon → öppna igen → polygonen renderas korrekt och kan justeras.
- D: GPS-ping med `accuracy=120 m` triggar varken enter/exit.
- E: Person står 3 m utanför polygonen med drift → inga falska enter (hysteres 5 m).
- F: Person inne, går ut 10 m → exit triggas inte (under 15 m hysteres). Går ut 20 m → exit.
- G: OpsLiveMap visar polygon-formen exakt, inte en cirkel.
- H: Multi-tenant: org A:s polygon syns aldrig för org B (befintlig RLS täcker).

### Filer som skapas / ändras

**Nya:**
- `supabase/migrations/<ts>_geofence_polygon.sql`
- `src/components/ops-control/GeofenceMapEditor.tsx`
- `src/lib/geofenceEval.ts`
- `supabase/functions/_shared/geofenceEval.ts`

**Ändras:**
- `src/services/organizationLocationService.ts` (typer + fält)
- `src/components/ops-control/OrganizationLocationsManager.tsx` (dialog UI)
- `src/components/ops-control/OpsLiveMap.tsx` (polygon-rendering)
- `src/hooks/useGeofencing.ts` (eval via helper + hysteres + accuracy-gate)
- `supabase/functions/mobile-app-api/index.ts` (geofence-check via shared helper)

