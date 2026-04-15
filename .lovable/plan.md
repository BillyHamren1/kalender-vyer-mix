

## Plan: Bakgrunds-geofence med korrekt ankomsttid och prompt vid appöppning

### Problemet nu
- `useBackgroundLocationReporter` skickar GPS var 30:e sekund även i bakgrunden, men gör **ingen geofence-check**
- `useGeofencing` körs bara i förgrunden — `arrivalTimestamp` sätts till `Date.now()` när geofence-checken körs (dvs. när appen öppnas), inte när användaren faktiskt anlände
- Resultat: om appen är stängd i 2 timmar och användaren öppnar den, ser den ut som att ankomsten skedde "just nu"

### Lösning

**1. Bakgrunds-geofence-check i `useBackgroundLocationReporter.ts`**
- Läs geofence-targets (org locations + bokningar med koordinater) från `localStorage` (key: `eventflow-geofence-targets`)
- I varje `handlePosition`-callback: kör Haversine mot alla targets
- Om position är innanför radius och ingen pending arrival finns → spara till `localStorage` key `eventflow-pending-arrivals`:
  ```json
  [{ "key": "location-xxx", "name": "Lager", "type": "fixed", "timestamp": 1713182400000, "locationId": "xxx" }]
  ```
- Ta bort pending arrival om positionen rör sig utanför radius (exit)

**2. Cacha geofence-targets i `useGeofencing.ts`**
- Efter hämtning av `orgLocations` och vid ändring av `bookings`: skriv en kompakt lista med id, lat/lng, radius, namn, typ till `localStorage` key `eventflow-geofence-targets`
- Bakgrundsreportern läser detta cache — inga API-anrop behövs

**3. Läs pending arrivals vid mount i `useGeofencing.ts`**
- Vid start (staffId ändras): läs `eventflow-pending-arrivals` från localStorage
- För varje pending arrival: skapa `GeofenceEvent` med `arrivalTimestamp` satt till den sparade tidsstämpeln (den faktiska ankomsttiden)
- Queue:a dessa till `geofenceEvent` state → prompten visas

**4. Uppdatera GeofencePrompt**
- Prompten visar redan korrekt: "Enligt GPS anlände du kl. XX:XX (Xmin sedan)" + knappen "Starta från XX:XX"
- Ingen ändring behövs i prompten — den använder redan `arrivalTimestamp` korrekt
- Enda ändring: `arrivalTimestamp` kommer nu vara den riktiga bakgrunds-ankomsttiden istället för `Date.now()`

### Filer som ändras
- `src/hooks/useBackgroundLocationReporter.ts` — lägg till geofence-check mot localStorage-targets, spara pending arrivals
- `src/hooks/useGeofencing.ts` — cacha targets till localStorage, läs pending arrivals vid mount

### Begränsning
Bakgrunds-geofence fungerar bara på native (Capacitor) — i webbläsaren körs geofence bara i förgrunden som idag.

