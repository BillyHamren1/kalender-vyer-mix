

## Diagnos

Dialogen "Dagöversikt" visar **"Inga geopositioner rapporterade"** trots att GPS faktiskt loggas (206 rader idag i `staff_location_history`).

**Roten till problemet:** `DailyOverviewDialog` hämtar **inte** GPS-historik alls. Den visar bara koordinater som finns i `travel_time_logs` (start/slut-adresser för resor). Eftersom användaren idag bara har lager-pass (inga resor) finns 0 rader i `travel_time_logs` → tom karta + "Okänd startplats".

GPS-datan finns redan på rätt ställe — `staff_location_history` får 206 rader/dag — men dialogen läser fel källa. Admin-vyn "Rörelse"-knappen (StaffMovementMap) använder rätt källa (`get_movement_for_day`) och fungerar.

## Lösning

Koppla in `staff_location_history` som primär källa i `DailyOverviewDialog`:

1. **Hämta GPS-trail** — Anropa `mobileApi.getMovementForDay(staffId, date)` när dialogen öppnas (samma endpoint som StaffMovementMap använder).
2. **Rita polylinje på kartan** — Lägg till en GeoJSON `LineString` med GPS-punkterna ovanpå befintliga travel/work-markers. Ger en kontinuerlig rörelsespår över dagen.
3. **Härled "Startplats"** — När `from_address` saknas i travel_time_logs, använd första GPS-punktens koordinater + reverse-geocoding via Mapbox (eller bara visa "📍 lat, lng" som fallback).
4. **Visa kartan även utan resor** — Ändra villkoret så kartan visas så fort `gpsPoints.length > 0` ELLER `mapPoints.length > 0` (idag krävs det senare).
5. **Uppdatera tom-state-text** — Om varken GPS eller travel finns: behåll "Inga geopositioner rapporterade".

## Tekniska detaljer

- **Fil:** `src/components/staff/DailyOverviewDialog.tsx`
- Ny `useEffect` som anropar `mobileApi.getMovementForDay(staffId, date)` när `open` blir `true`.
- Ny state `gpsPoints: { lat, lng, recorded_at }[]`.
- I map-init: addera `gps-trail` source/layer (line, accent-färg, opacity 0.7) före befintliga route-lines.
- Bounds-fit utökas med GPS-punkterna.
- Behörighet: `getMovementForDay` kräver admin-roll för att läsa annans data — admins som öppnar dialogen från `StaffTimeReportDetail` har redan det.

Inga DB-ändringar behövs — datan finns redan.

