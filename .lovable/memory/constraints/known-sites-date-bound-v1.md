---
name: Known Sites Date Bound
description: Server och klient måste filtrera "kända platser" på dagskoppling (TR/LTE/BSA/calendar_event). Aldrig org-bred projects-scan.
type: constraint
---

# Regel

GPS-snapshots och kartans "kända platser" (`KnownSite[]`) får **endast**
innehålla projekt/large_projects/bookings som personen har en faktisk
dagskoppling till för det valda datumet:

- `time_reports` (`staff_id` + `report_date`)
- `location_time_entries` (`staff_id` + `entry_date`)
- `booking_staff_assignments` (`staff_id` + `assignment_date`)
- `staff_assignments.team_id` × `calendar_events.resource_id` för dagen
  (source_date eller overlap mot dagsintervallet)

`organization_locations` (lager/kontor/boende) är alltid med —
ingen dagsfiltrering.

## Förbjudet

- Att hämta **alla** `projects`/`large_projects`/`bookings` i organisationen
  (med koordinater) och använda som geofences för en dag.
- Att hoppa över status/deleted-filter (`deleted_at IS NULL`,
  status ≠ `cancelled`/`avbokat`).
- Att låta gamla, slutförda eller test-projekt få bli en "visit" i
  veckopanelen eller på kartan idag bara för att de ligger geografiskt
  nära en ping.

## Implementering (locked)

- **Frontend**: `src/hooks/useDayKnownSites.ts`
- **Server**: `supabase/functions/_shared/staff-gps/dayKnownSites.ts`
  (Deno-port av useDayKnownSites; måste vara byte-likvärdig)
- `snapshotCache.ts` får **inte** läsa projects/large_projects/bookings direkt
  utan måste gå via `loadDayKnownSites()`.

## Snapshot-cache

`staff_gps_day_snapshots.input_signature` MÅSTE inkludera en stabil hash av
geofence-id-mängden (`fh:`) — annars kan en gammal cachad snapshot leva
vidare med fel geofences när dagens uppsättning ändras.

## Locked av

- `src/test/knownSitesDateBound.contract.test.ts`
- `mem://constraints/geofence-inside-time-authority-v1` (kompletterande)
