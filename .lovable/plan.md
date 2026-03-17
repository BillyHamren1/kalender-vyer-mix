

# Problem: Två buggar i OpsLiveMap

## 1. Ikon hoppar vid hover
Markören använder `transform: scale(1.2)` vid mouseenter (rad 211), men `transform-origin` är inte satt. Mapbox-markörens ankarpunkt gör att skalningen "lyfter" ikonen uppåt/åt sidan istället för att expandera på plats. Fix: sätt `transform-origin: center center` på elementet.

## 2. Kartan visar JOBBETS plats, inte personalens GPS-position
**Det här är rotorsaken.** I `fetchStaffLocations` (planningDashboardService.ts, rad 368-369) sätts latitude/longitude till `booking.delivery_latitude / delivery_longitude` — alltså leveransadressen, inte var Billy faktiskt befinner sig.

Mobilappen spårar redan GPS via `useGeofencing` och `useTravelDetection`, men rapporterar aldrig positionen tillbaka till servern. Det finns ingen tabell för realtidspositioner.

## Plan

### Steg 1: Skapa `staff_locations`-tabell i Supabase
```sql
create table staff_locations (
  staff_id uuid primary key references staff_members(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);
alter table staff_locations enable row level security;
```
En rad per personal, uppdateras med upsert. Ingen historik, bara senaste position.

### Steg 2: Mobilappen rapporterar position
I `useGeofencing.ts` — vid varje `watchPosition`-callback, gör en upsert till `staff_locations` med aktuell lat/lng (throttlad till max var 30:e sekund för att spara resurser).

### Steg 3: Uppdatera `fetchStaffLocations`
Joina med `staff_locations` istället för att använda bokningens leveranskoordinater. Om ingen GPS-position finns, falla tillbaka till bokningens position (men markera det visuellt).

### Steg 4: Fixa hover-hopp
Lägg till `transform-origin: center center` på staff-markörens element i OpsLiveMap.tsx.

## Filer som ändras
- **SQL migration**: Ny tabell `staff_locations`
- `src/hooks/useGeofencing.ts`: Lägg till upsert av position
- `src/services/planningDashboardService.ts`: Joina med `staff_locations`
- `src/components/ops-control/OpsLiveMap.tsx`: Fixa transform-origin

