

## Optimistisk auto-checkin för assignade jobb (lika som lager)

### Beslut
Sluta särbehandla lager vs bokning/projekt. Om personen är **tilldelad** uppdraget den dagen → checka in automatiskt vid geofence-träff (precis som lager). Om personen INTE är tilldelad → fråga (nuvarande beteende).

### Ny enhetlig regel

```text
Geofence-träff (≤ 100m, accuracy ≤ 50m, stillastående ≥ 60s)
        │
        ▼
   Är target en fast plats (lager)?
        │── ja → AUTO check-in (oförändrat)
        │
        └── nej (booking/large_project)
                │
                ▼
        Finns BSA-rad för (staff, target, idag)?
                │── ja → AUTO check-in (NYTT)
                └── nej → arrival_prompt_log + push (oförändrat)
```

### Server-fix (huvudgrejen)

**`supabase/functions/mobile-app-api/handleArrivalPing.ts`** (eller motsvarande hanterare i mobile-app-api som tar emot GPS-ping och beslutar arrival):

1. När en ping matchar en booking/large_project geofence:
   - Slå upp `booking_staff_assignments` för `(staff_id, booking_id/large_project_id, today)`.
   - **Om träff** → skapa `location_time_entries`-rad direkt (`source = 'auto_assigned'`, `booking_id`/`large_project_id` satt). Ingen `arrival_prompt_log`.
   - **Om ingen träff** → nuvarande prompt-flöde.
2. Idempotent: om det redan finns en öppen `location_time_entry` för samma target/dag → no-op.
3. Auto-stäng eventuellt öppet lager-pass när auto-checkin sker (samma helper som vi byggde för travel: `closeOpenEntriesForStaff(staffId, before=now)`).

### Klient-fix (bakgrundsmotor)

**`src/hooks/useGeofencing.ts`**:
- Idag matchar bakgrundsgeofencen i praktiken bara fasta `organization_locations`. Utvidga matchningen till att också inkludera dagens **assignade** bookings/large_projects (hämta deras lat/lng + radie 100m vid login + var 30:e min).
- När en match sker mot en assignad booking/projekt → kalla samma serverväg som lager (auto check-in), inte arrival-prompten.
- Behåll arrival-prompten som fallback för o-assignade träffar (t.ex. en kollega som råkar vara där).

### Admin-korrigering ("ångra-knapp")
Eftersom vi nu är optimistiska behöver admin kunna nolla en felaktig auto-incheckning. Det finns redan i `StaffTimeReportDetail` — säkerställ att rader med `source='auto_assigned'` är raderbara/justerbara med samma flöde som manuella.

### Backfill för Jānis just nu
Engångs-insert: skapa en `location_time_entries`-rad för honom på Holmträskvägen från **08:24** (när reseloggen slutade) tills han stoppar manuellt. Då matchar dagens vy verkligheten direkt utan att vänta på fixen.

### Filer som ändras
- `supabase/functions/mobile-app-api/index.ts` (arrival-handlern) — assignment-lookup + auto-create entry.
- `src/hooks/useGeofencing.ts` — utöka matchningen till dagens assignade bookings/projekt.
- `src/services/locationTimeService.ts` — ny helper `autoCheckInToTarget(staffId, target)`.
- `src/components/staff/ArrivalPromptDialog.tsx` — visas inte längre när auto-checkin redan skedde.
- Engångs-SQL för Jānis (insert öppen rad från 08:24 mot booking 74e895a8…).

### Förväntat beteende
- Jānis (assignad till Westmans) → auto-incheckad utan prompt.
- En förbipasserande kollega (inte assignad) → får arrival-prompt som idag.
- Adminkorrigering möjlig om GPS-falskmatchning skulle ske.

