

## Tidrapporter från stora projekt → ska tillhöra projektet, inte "Lager"/"-"

### Problem
När en användare startar en projekt-timer (large project) i mobilappen och sedan stoppar via geofence/EOD så skapas en `location_time_entry` (LTE) med rätt `large_project_id` satt. Men DB-triggern `sync_location_entry_to_time_report` (som skapar motsvarande `time_reports`-rad när timern stängs) **ignorerar både `large_project_id` och `booking_id` på LTE-raden** och tvingar in **Lagerbokningen** som `booking_id`:

```sql
_booking_id := public.ensure_internal_lager_booking(NEW.organization_id);
INSERT INTO time_reports (... booking_id ...) VALUES (..., _booking_id, ...);
```

Resultatet blir att projekttimmar landar antingen som "Lager", som "-" (om Lager-bokningen råkar saknas/joinas inte) eller som "Okänt projekt". `large_project_id` skrivs aldrig på `time_reports`-raden.

`useGeofencing.saveAndStopTimer` + `mobile-app-api.create_time_report` skickar redan `large_project_id` korrekt — det är **enbart auto-sync-triggern** som tappar informationen.

### Lösning
Triggern ska respektera vad LTE-raden faktiskt pekar på, i samma prioritetsordning som UI:t redan använder (`booking_id` > `large_project_id` > `location_id` → Lager-fallback).

### Ändringar

**1. Migration: uppdatera `sync_location_entry_to_time_report`**
- Om `NEW.booking_id` finns → använd den som `booking_id`, sätt `large_project_id = NULL`.
- Annars om `NEW.large_project_id` finns → sätt `large_project_id = NEW.large_project_id`, `booking_id = NULL`. Beskrivning: `Auto: projekt (<source>)`.
- Annars (location-only) → fortsätt som idag (Lager-bokning).
- Backfilla befintliga felaktiga `time_reports` med `source='location_auto'` där LTE-raden har `large_project_id`/`booking_id`: skriv om dem till rätt mål och rensa Lager-pekaren. Endast rader där `approved` är `false` rörs (godkända lämnas — manuell hantering).

**2. Verifiera UI-rendering**
- `StaffTimeReportDetail` joinar redan `bookings(client, booking_number, large_project_id)` och visar large project-namnet om det finns. Den fungerar för `booking_id`-fallet (där bokningen tillhör ett stort projekt).
- För rena projekt-rapporter (endast `large_project_id`, inget `booking_id`) behöver join + label-logiken utökas: hämta `large_projects` separat och visa projektnamnet i `booking_client`-kolumnen samt projektnumret i `booking_number`-kolumnen. Då försvinner "-" helt.
- `StaffTimeReports` (dagsöversikten) hämtar redan `large_project_id` på LTE och resolvar `large_projects.name` → den biten är redan korrekt och påverkas inte.

**3. Inga ändringar krävs i**
- `mobile-app-api` (skickar redan rätt fält)
- `useGeofencing` / `useWorkSession` (stop-flödet är korrekt)
- Kontrakt-tester för time-reporting (täcker redan `large_project_id`-vägen)

### Filer

**Skapas:**
- `supabase/migrations/<timestamp>_fix_lte_to_time_report_project_attribution.sql`

**Ändras:**
- `src/components/staff/StaffTimeReportDetail.tsx` (visa large project-namn även när raden saknar `booking_id` men har `large_project_id`)

