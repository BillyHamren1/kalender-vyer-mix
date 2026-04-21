

## Stäng glappet: server-side arrival-detektion från GPS-pings

### Problem
Auto-checkin (och travel-logs) triggas bara när mobilappen är **vaken** och själv kallar `report_arrival` / `useTravelDetection`. När telefonen är låst i fickan får vi råa GPS-pings till `staff_locations` + `staff_location_history`, men ingen logik som översätter pingen till in/ut-händelser. Resultat: Raivis har 1h 14m osynlig tid idag (resa + ankomst).

### Lösning
Flytta arrival-/travel-detektionen från klient till server, triggat av varje GPS-ping som kommer in via `mobile-app-api/update_location` (eller motsvarande endpoint).

### Server-fix i `mobile-app-api/index.ts`

**Ny hjälpfunktion `detectAndApplyMovement(staffId, orgId, ping)`** som körs vid varje inkommande GPS-ping:

1. **Hämta senaste kända state för staff:**
   - Senaste `staff_locations`-rad (för att jämföra avstånd/hastighet sedan förra ping).
   - Öppen `location_time_entries` (om någon).
   - Senaste avslutade `travel_time_logs` (för att inte dubbelstarta).

2. **Geofence-matchning på serversidan (Haversine):**
   - Hämta alla relevanta targets för dagen: `organization_locations` (lager) + dagens BSA-bokningar/projekt med koordinater.
   - För varje target inom 100m + accuracy ≤ 50m + speed ≤ 1.5 m/s → räkna som "inne".
   - Annars "ute".

3. **Tillståndsövergångar:**
   - **Ute → Inne (assigned target)** → auto-checkin (samma logik som `handleReportArrival` redan har, source `auto_assigned_bg`).
   - **Ute → Inne (o-assigned target)** → skapa `arrival_prompt_log` + push.
   - **Inne → Ute** → stäng öppen `location_time_entries` (`exited_at = ping.recorded_at`).
   - **Förflyttning ≥ 500m i ≥ 5 min med medelhastighet ≥ 5 m/s mellan två targets** → skapa `travel_time_logs`-rad (samma model som klienten använder idag).

4. **Idempotens:** all skapning använder befintliga unik-constraints + `client_dedupe_key` så dubbla pings inte ger dubbla rader.

### Klient-fix i `useGeofencing.ts`
- Säkerställ att bakgrunds-GPS faktiskt postar varje ping till `mobile-app-api` (inte bara skriver direkt till `staff_locations` via supabase-client). Idag verkar pingen landa i `staff_locations` utan att gå genom edge-funktionen, vilket är varför server-logiken aldrig kör.
- Behåll klientens egen `useTravelDetection` som fallback när appen är vaken (ingen regression).

### Backfill för Raivis idag
Engångs-SQL:
1. Skapa `travel_time_logs` 07:16 → 08:22 (Kungens kurva → Holmträskvägen 19), klassad `work`, ~65 km, ~1h 6m.
2. Skapa öppen `location_time_entries` på Holmträskvägen-bokningen från 08:22, `source='auto_assigned_backfill'`.

### Admin-debugvy (NYTT, snabb feedback)
Bygg en liten sida `/admin/staff-live` som visar per personal:
- Senaste GPS-ping (när + var + accuracy).
- Öppen `location_time_entries` (om någon).
- Sista `travel_time_logs`.
- Oresolvad `arrival_prompt_log`.
- Beräknat avstånd till närmaste assignade booking idag.
- Röd flagga om: stillastående >15 min på assignad plats utan checkin, ELLER stora GPS-hopp utan travel-log.

Då slipper vi gissa nästa gång det händer.

### Filer som ändras
- `supabase/functions/mobile-app-api/index.ts` — ny `detectAndApplyMovement`, ny endpoint-handler `update_location` som anropar den.
- `src/hooks/useGeofencing.ts` — ruta alla bakgrundspings genom edge-funktionen istället för direkt insert.
- `src/pages/admin/StaffLiveDebug.tsx` (ny) — adminvyn.
- Engångs-SQL för Raivis backfill.

### Förväntat resultat
- Raivis får retroaktivt en resa 07:16→08:22 och en pågående checkin på Holmträskvägen från 08:22.
- Framöver: även när telefonen ligger låst i fickan upptäcker servern in/ut-händelser inom 30s.
- Glapp som detta blir omöjliga utan att admin ser röd flagga i `/admin/staff-live`.

