

## Plan: Automatisk förflyttningsspårning ("Under förflyttning")

### Sammanfattning

Bygga ett system där appen automatiskt detekterar när en anställd är i rörelse (baserat på GPS-hastighet), startar en timer kopplad till ett speciellt "Under förflyttning"-projekt, sparar från- och tilladress, och visar det tydligt i tidrapporter — men dolt från den vanliga jobblistan.

### Problemanalys

Nuvarande system kräver att `time_reports.booking_id` pekar på en booking i `bookings`-tabellen (FK constraint). Förflyttning är inte kopplat till en specifik booking. Vi behöver antingen:
- En ny tabell för restid (renare separation)
- Eller en sentinel-booking per organisation

**Vald approach: Ny tabell `travel_time_logs`** — detta ger ren separation, inga FK-hacks, och gör det enkelt att filtrera bort restid från vanlig tidrapportering och tvärtom.

### Databasändringar

**Ny tabell: `travel_time_logs`**

```text
travel_time_logs
├── id (uuid PK)
├── staff_id (text, FK staff_members)
├── organization_id (uuid, FK organizations)
├── report_date (date)
├── start_time (timestamptz)
├── end_time (timestamptz, nullable)
├── hours_worked (numeric)
├── from_address (text, nullable)
├── from_latitude (float8, nullable)
├── from_longitude (float8, nullable)
├── to_address (text, nullable)
├── to_latitude (float8, nullable)
├── to_longitude (float8, nullable)
├── description (text, nullable)
├── auto_detected (boolean, default true)
├── created_at (timestamptz)
├── updated_at (timestamptz)
```

RLS: Org-filter + staff can only see own rows.

### Edge Function-ändringar

**`mobile-app-api/index.ts`** — nya actions:
- `create_travel_log` — spara en förflyttningsrapport (med from/to-adresser)
- `get_travel_logs` — hämta egna resloggar
- `stop_travel_log` — avsluta pågående resa (sätter end_time, beräknar hours_worked)

Dessa kräver **inte** booking_staff_assignments-validering (alla anställda har detta implicit).

### Frontend-ändringar

#### 1. Ny hook: `useTravelDetection.ts`
- Använder befintlig `navigator.geolocation.watchPosition`
- Beräknar hastighet från `coords.speed` (> 2 m/s ≈ 7 km/h = i rörelse)
- Kräver stabil rörelse i 30-60 sekunder innan start (undviker false positives)
- Vid start: spara aktuell position → reverse geocode till adress
- Vid stopp (hastighet < 1 m/s i 60s): spara slutposition → reverse geocode
- Skickar `create_travel_log` / `stop_travel_log` till backend

#### 2. Reverse geocoding
Använda befintlig `geocode-address` edge function eller Mapbox reverse geocode med befintlig token.

#### 3. UI: Aktiv förflyttningsindikator (global)
- I `MobileJobs.tsx` och övriga mobile-sidor: visa en tydlig "Under förflyttning"-banner med pågående timer
- Liknande befintlig `GeofenceStatusBar` men med bil-ikon och rutt-info

#### 4. UI: Profilsidan (`MobileProfile.tsx`)
- Nytt kort: "Under förflyttning" med historik-lista
- Visa totalt restid denna månad
- Länk till detaljvy med alla resor (från/till-adress, tid)

#### 5. UI: Tidrapporthistorik (`MobileTimeHistory`)
- Visa förflyttningstid som separata poster markerade med 🚗 eller bil-ikon
- Tydlig visuell skillnad från vanliga tidrapporter

#### 6. Admin/planering: Personalens tidrapporter
- `StaffDetail.tsx` tidrapporter-tab: inkludera förflyttningstid som egen sektion
- Aggregera i ekonomirapporter om önskat

### Integritet
- RLS: `staff_id = current_staff_id` — ingen ser andras resor
- Admin kan se via service_role i planerarvyn

### Implementationsordning

1. Skapa `travel_time_logs`-tabell med RLS
2. Lägga till `create_travel_log`, `get_travel_logs`, `stop_travel_log` i mobile-app-api
3. Bygga `useTravelDetection` hook med hastighetsbaserad detektering
4. Lägga till reverse geocoding-anrop
5. Bygga förflyttningsbanner-komponent
6. Uppdatera MobileProfile med reshistorik
7. Uppdatera tidrapporthistorik med förflyttningsposter
8. Uppdatera personaldetaljvyn (admin) med förflyttningsdata

### Tekniska detaljer

**Rörelsedetektering**: `coords.speed` från Geolocation API ger hastighet i m/s. Tröskel ~2 m/s (7.2 km/h) för att särskilja gång/bilkörning. Debounce 30s för att undvika korta rörelser.

**Adressupplösning**: Mapbox reverse geocoding (`https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json`) med befintlig MAPBOX_PUBLIC_TOKEN.

**Risker**: GPS-precision inomhus, batteriförbrukning (hanteras genom att återanvända befintlig `watchPosition` från geofencing istället för ny).

