

# Projekt-tidrapportering: Adress + sparande fungerar inte korrekt

## Problem
Två bekräftade buggar:

1. **Adressen i geofence-prompten** visar den första bokningens `deliveryaddress` ("Venngarn D:38" = en monterplats), inte projektets egen adress. Projektets adress borde visas istället.

2. **Tiden sparas INTE korrekt** — detta är en allvarlig bugg. När timern startas för ett projekt sätts nyckeln till `project-{uuid}`. När den stoppas skickas `booking_id: "project-{uuid}"` till `handleCreateTimeReport` i edge-funktionen. Där faller det igenom till booking assignment-checken som söker efter en bokning med ID `project-{uuid}` — den existerar inte och returnerar 403-fel. **Tiden försvinner.**

## Plan

### 1. Lägg till `large_project_id` i `time_reports`-tabellen
Migration som lägger till en nullable kolumn `large_project_id` (uuid). Detta gör att tidrapporten kan kopplas direkt till det stora projektet.

### 2. Uppdatera edge-funktionen `handleCreateTimeReport`
- Acceptera `large_project_id` som parameter
- Om `booking_id` börjar med `project-`: extrahera `large_project_id`, verifiera att projektet finns, och välj en av projektets bokningar som `booking_id` (för bakåtkompatibilitet med befintliga rapporter/ekonomi)
- Spara `large_project_id` på tidrapporten

### 3. Uppdatera `GeofenceEvent` med projektadress
- Lägg till `largeProjectAddress` i `GeofenceEvent`-typen
- I geofence-logiken: hämta projektets adress från bokningen (som redan har projektets överskrivna `deliveryaddress` via API:t) och sätt den som `largeProjectAddress`
- Uppdatera `GeofencePrompt` att visa `event.largeProjectAddress` istället för `event.booking.deliveryaddress` för projekt

### 4. Uppdatera `startTimer` och timer-stopplogik
- Utöka `ActiveTimer` med `largeProjectId`
- I `MobileTimeReport.tsx`: när en projekt-timer stoppas, skicka `large_project_id` till API:t istället för `project-{uuid}` som `booking_id`

### 5. Uppdatera `mobileApiService`
- Lägg till `large_project_id` som valfri parameter i `createTimeReport`

### Filer som ändras
- **Migration**: ny SQL-fil för `large_project_id`-kolumn
- `supabase/functions/mobile-app-api/index.ts` — hantera `project-` prefix, spara `large_project_id`
- `src/hooks/useGeofencing.ts` — `GeofenceEvent.largeProjectAddress`, `ActiveTimer.largeProjectId`
- `src/components/mobile-app/GeofencePrompt.tsx` — visa projektadress
- `src/pages/mobile/MobileTimeReport.tsx` — skicka `large_project_id` vid timer-stopp
- `src/services/mobileApiService.ts` — utöka `createTimeReport`-typen

