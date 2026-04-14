

# Geofence: Visa projektnamn, inte enskild bokning

## Problem
När en bokning tillhör ett stort projekt triggar geofencen per enskild bokning och visar "Svedea AB" + bokningsnummer. Användaren förväntar sig att se **projektnamnet** och att tidrapporteringen kopplas till projektet, inte en enskild delbokning.

## Plan

### 1. Konsolidera geofence-triggers för stora projekt
**Fil:** `src/hooks/useGeofencing.ts`

Istället för att trigga geofence per bokning:
- Om bokningen har `large_project_id`, använd projektets koordinater (som nu sätts från `large_projects`-tabellen via API:t)
- Deduplicera så att samma projekt bara triggar **en** geofence-event, inte en per delbokning
- Sätt `locationType: 'project'` och inkludera `large_project_id` + `large_project_name` i eventet

### 2. Utöka GeofenceEvent-typen
**Fil:** `src/hooks/useGeofencing.ts`

Lägg till `locationType: 'project'` och fält:
```
largeProjectId?: string
largeProjectName?: string
```

### 3. Uppdatera GeofencePrompt för projekt
**Fil:** `src/components/mobile-app/GeofencePrompt.tsx`

- Om `locationType === 'project'`: visa projektnamnet (inte klientnamn), projektets adress, och texten "Vill du starta tidregistrering för detta projekt?"
- Dölj bokningsnummer

### 4. Uppdatera handleGeofenceConfirm
**Fil:** `src/pages/mobile/MobileJobs.tsx`

- Om geofence-eventet är av typ `project`: starta timer med `large_project_id` som nyckel och projektnamnet som label
- Tidrapportering kopplas till projektet, inte en enskild bokning

### Filer som ändras
- `src/hooks/useGeofencing.ts` — konsolidera triggers, ny event-typ
- `src/components/mobile-app/GeofencePrompt.tsx` — visa projektnamn
- `src/pages/mobile/MobileJobs.tsx` — hantera projekt-geofence i confirm

