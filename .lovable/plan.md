

## Plan: Platser som vanliga projekt i tidappen

### Koncept
En `organization_location` med `show_as_project = true` ska bete sig som ett helt vanligt projekt/bokning i mobilappen — med timer, auto-start via geofence, manuell tidrapportering. Alla aktiva personal ska vara tilldelade. Det ska inte synas i personalkalendern.

### Databasändringar

**1. Ny kolumn på `organization_locations`:**
```sql
ALTER TABLE organization_locations ADD COLUMN show_as_project BOOLEAN NOT NULL DEFAULT false;
```

**2. Ny kolumn `booking_id` på `organization_locations`:**
Varje plats med `show_as_project = true` behöver ett syntetiskt `booking_id` som kan användas i `time_reports` och `booking_staff_assignments`. Enklast: använd platsens ID direkt som `booking_id` med prefix `location-`.

**3. Auto-assign alla aktiva personal:**
En DB-funktion + trigger som, när `show_as_project` sätts till `true`, skapar `booking_staff_assignments` för alla aktiva `staff_members` i organisationen. Samt en trigger på `staff_members` INSERT som lägger till nya medarbetare till alla `show_as_project`-platser.

### Edge Function: `mobile-app-api`

**`handleGetBookings`:** Utöka med en andra query som hämtar `organization_locations WHERE show_as_project = true` och returnerar dem som syntetiska "bookings" med:
- `id` = `location-{location.id}` (matchar befintligt timer-format)
- `client` = platsens namn (t.ex. "Lager")
- Koordinater från platsen
- `is_location_project = true` (markör)
- Inga datum (alltid aktiv)

**`handleCreateTimeReport`:** Utöka validering — om `booking_id` startar med `location-`, verifiera att platsen finns och att `show_as_project = true` istället för att kolla `booking_staff_assignments`. Spara i `time_reports` som vanligt.

### Frontend: Mobilappen

**`MobileTimeReport.tsx`:**
- Dropdownen "Jobb" visar redan bokningar — location-projekt dyker upp automatiskt via det utökade API-svaret
- Timer-logiken i `useGeofencing.ts` hanterar redan location-timers med key `location-{id}` — ändra `onStop`-hanteringen så att location-timers med `show_as_project` skapar `time_reports` (precis som boknings-timers), inte bara `location_time_entries`
- Auto-start via geofence fungerar redan — men behöver kopplas till time report-flödet

**`useGeofencing.ts`:**
- Markera location-timers som har `show_as_project` så att stop-hanteringen i `MobileTimeReport` vet att skapa `time_report` istället för bara `location_time_entry`

### Frontend: Platshantering (admin)

**`OrganizationLocationsManager.tsx`:**
- Lägg till en toggle/switch "Visa som projekt i tidappen" i plats-dialogen
- Vid aktivering: trigger skapar BSA-rader automatiskt

**`UnifiedProjectList.tsx`:**
- Intern-projektet (skapat via migration) visas redan med "Intern"-badge
- Behåll detta — men koppla till `show_as_project` så att alla platser med flaggan syns

### Kalenderexkludering
Inga ändringar behövs — platsprojekt saknar riktiga `booking_id` i `bookings`-tabellen och kommer aldrig att generera kalenderhändelser via `import-bookings`.

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| Migration (ny) | `show_as_project`-kolumn, trigger för auto-BSA |
| `supabase/functions/mobile-app-api/index.ts` | `handleGetBookings` returnerar location-projekt, `handleCreateTimeReport` accepterar `location-*` booking_id |
| `src/pages/mobile/MobileTimeReport.tsx` | Location-timer stop → skapar time_report |
| `src/hooks/useGeofencing.ts` | Markera `showAsProject` på location-timers |
| `src/components/ops-control/OrganizationLocationsManager.tsx` | Toggle "Visa som projekt" |
| `src/services/organizationLocationService.ts` | Inkludera `show_as_project` i interface/anrop |

### Resultat
- Admin skapar plats "Lager" och aktiverar "Visa som projekt"
- Alla personal ser automatiskt "Lager" i sin tidapp-lista
- Timer, auto-start, manuell tidrapportering fungerar exakt som för vanliga jobb
- Lager syns INTE i personalkalendern
- Tid sparas i `time_reports` med `booking_id = 'location-{id}'`

