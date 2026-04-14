

## Problem

Platstimers (fasta platser som lager/kontor) och jobbtimers behandlas olika:

- **Jobbtimer**: När den stoppas skapas en `time_report` i databasen (via `mobileApi.createTimeReport`)
- **Platstimer**: När den stoppas skapas bara en `location_time_entry` — ingen `time_report` skapas, **utom** om platsen råkar matcha en `location-`-bokning i `bookings`-arrayen

Detta innebär att arbetstid på fasta platser inte syns i tidrapporter, löneunderlag eller projektöversikter.

## Lösning

Gör att platstimers alltid skapar en `time_report` vid stopp, precis som jobbtimers.

### Ändringar

**1. `src/pages/mobile/MobileTimeReport.tsx`** — Stoppa platstimer → skapa tidrapport

I `onStop`-callbacken (rad 228-256): ta bort if/else-grenen som skiljer på `isLocationProject` vs ej. **Alla** platstimers ska skapa en `time_report` med `booking_id: locKey` (t.ex. `location-{id}`). Samma logik som redan finns för `isLocationProject`-fallet — beräkna tid, rastavdrag, anropa `createTimeReport`.

Samma ändring för "Fasta platser"-knapparna (rad 301-303): när en platstimer stoppas via snabbknappen ska den också skapa en tidrapport istället för att bara visa toast.

**2. `src/pages/mobile/MobileJobs.tsx`** — Geofence-exit för fasta platser

Rad 55-58: istället för att bara anropa `stopTimer(locKey)` och visa toast, navigera till `/m/report` (precis som för vanliga jobb-geofences), så att användaren ser sin aktiva timer i tidrapporten och kan stoppa den korrekt med tidrapport-skapande.

**3. Backend — redan klart**

`handleCreateTimeReport` i `mobile-app-api` hanterar redan `location-`-prefix (rad 1199-1216). Den verifierar att platsen finns, är aktiv, och har `show_as_project: true`. Ingen backend-ändring krävs.

### Vad som bevaras

- `location_time_entries` fortsätter skapas parallellt (via `startLocationTimer`/`stopLocationTimer` i `useGeofencing`) — detta ger GPS-baserad närvarologg
- All befintlig timer-logik, single-active-constraint, rastavdrag
- Backend-validering och overlap-check

### Sammanfattning av filer

| Fil | Ändring |
|-----|---------|
| `MobileTimeReport.tsx` | Alla platstimer-stopp skapar `time_report` |
| `MobileJobs.tsx` | Geofence-exit för platser navigerar till `/m/report` |

