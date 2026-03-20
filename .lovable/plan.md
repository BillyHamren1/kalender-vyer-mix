

## Alltid rapportera GPS-position — oavsett skiftstatus

### Problem
GPS-position rapporteras bara via `useGeofencing`-hooken, som körs per sida (MobileJobs, MobileJobDetail) och kräver att GPS-inställningar är aktiverade. Det finns ingen permanent bakgrundsrapportering på layout-nivå, så om personalen inte har appen öppen på rätt sida syns ingen position.

### Lösning

**1. Skapa en ny hook `useBackgroundLocationReporter`** (`src/hooks/useBackgroundLocationReporter.ts`)
- Tar `staffId` som parameter
- Startar `navigator.geolocation.watchPosition` oberoende av aktiva timers eller bokningar
- Upsertar till `staff_locations` var 30:e sekund (samma throttle som befintlig logik)
- Körs alltid när appen är öppen och staffId finns — ingen koppling till GPS-inställningar för geofencing

**2. Integrera i `TimeAppLayout`**
- Hämta `staff` från `useMobileAuth()`
- Kör `useBackgroundLocationReporter(staff?.id)` i layouten
- Eftersom TimeAppLayout wrappas av MobileProtectedRoute som wrappas av MobileAuthProvider, finns staffId alltid tillgängligt

**3. Befintlig `useGeofencing` orörd**
- Geofencing-logiken (enter/exit-triggers, timers) ändras inte
- Den nya hooken hanterar enbart positionsrapportering till databasen
- Dubbel-upsert undviks genom att den nya hooken skriver till samma `staff_locations`-rad (upsert on conflict `staff_id`)

### Tekniska detaljer
- Hook: enkel `watchPosition` → throttled upsert, ca 30 rader kod
- Ingen ny tabell behövs — använder befintliga `staff_locations`
- Körs i TimeAppLayout (alla autentiserade sidor i mobilappen)
- Kan även läggas till i ScannerAppLayout om scanner-personal ska synas

