

# AI-driven Staff Route Planning med Mapbox

## Bakgrund

Projektet använder redan **Mapbox** genomgående:
- `MAPBOX_PUBLIC_TOKEN` finns som secret
- Mapbox Directions API används i `LogisticsMapWidget.tsx` för ruttvisning
- OpsLiveMap använder Mapbox GL JS med globe-projektion
- Den befintliga `optimize-logistics-route` edge function använder Google Routes API — men för den nya staff-rutten ska vi använda **Mapbox Optimization API** istället

## Plan

### 1. Ny Edge Function: `supabase/functions/optimize-staff-route/index.ts`

**Input:** `{ staff_id, date, start_lat?, start_lng? }`

**Logik:**
1. Hämta `booking_staff_assignments` för given personal + datum
2. Joina med `bookings` för koordinater och `calendar_events` för tider
3. Anropa **Mapbox Optimization API v1** (`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/{coordinates}`) — detta optimerar waypoint-ordning och returnerar polyline + distans/tid
4. Fallback: nearest-neighbor (redan beprövad pattern i kodbasen)
5. Anropa **Lovable AI Gateway (Gemini)** för naturliga ruttförslag ("undvik E4 under rusningstid", "stopp 2 och 3 ligger nära — gruppera")
6. Returnera: `{ optimized_order, stops[], total_distance_km, total_duration_min, polyline (GeoJSON), ai_suggestions }`

**Secrets som behövs:** `MAPBOX_PUBLIC_TOKEN` (finns), `LOVABLE_API_KEY` (finns)

### 2. Ny Service: `src/services/staffRouteService.ts`

- `optimizeStaffRoute(staffId, date)` — anropar edge function
- Returnerar optimerad stoppordning, polyline-geometri, AI-tips

### 3. UI: "Optimera rutt"-knapp i OpsStaffTimeline

- Visas på personalrader med 2+ uppdrag som har koordinater
- Klick → anropar `optimizeStaffRoute`, visar toast med avstånd/tid
- Ritar rutt-polyline på OpsLiveMap

### 4. UI: Ny sidopanel `OpsStaffRoute.tsx`

- Öppnas via befintligt `sidePanel`-mönster i `OpsControlCenter`
- Visar: ordnad stopplista, avstånd, tid, AI-förslag från Gemini
- "Visa på karta"-knapp fokuserar kartan och ritar polyline

### 5. OpsLiveMap: Stöd för rutt-polyline

- Ny prop `routePolyline` (GeoJSON LineString)
- Renderas som färgad linje (samma pattern som `LogisticsMapWidget` highlight-route)

## Filer att skapa

| Fil | Syfte |
|-----|-------|
| `supabase/functions/optimize-staff-route/index.ts` | Mapbox Optimization API + Gemini AI |
| `src/services/staffRouteService.ts` | Klient-service för ruttoptimering |
| `src/components/ops-control/OpsStaffRoute.tsx` | Sidopanel med ruttdetaljer + AI-tips |

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/ops-control/OpsStaffTimeline.tsx` | Lägg till "Optimera rutt"-knapp per personalrad |
| `src/components/ops-control/OpsLiveMap.tsx` | Stöd för att rita en staff-route polyline |
| `src/pages/OpsControlCenter.tsx` | Ny `staff-route` sidopaneltyp |
| `supabase/config.toml` | Registrera nya edge function |

## Mapbox Optimization API

Används istället för Google Routes API. Endpoint:
```
GET https://api.mapbox.com/optimized-trips/v1/mapbox/driving/{coords}
  ?access_token={MAPBOX_PUBLIC_TOKEN}
  &geometries=geojson
  &overview=full
  &roundtrip=false
  &source=first
```

Returnerar optimerad waypoint-ordning + full GeoJSON-geometri — perfekt för att rita på kartan direkt.

## Testplan

1. Personal med 2+ uppdrag → "Optimera rutt" visas
2. Klick → edge function returnerar ordnade stopp + polyline
3. Rutt-polyline renderas på OpsLiveMap
4. Sidopanel visar stopplista + AI-förslag
5. Personal med 0–1 uppdrag → ingen knapp
6. Fallback fungerar om Mapbox API inte svarar

