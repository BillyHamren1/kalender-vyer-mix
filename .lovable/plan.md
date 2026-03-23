

## Problem: Bara första nedriggdagen importeras

### Orsak

Den externa API:n skickar datum som arrayer (`rig_down_dates: ["2026-03-24", "2026-03-25"]`), men import-funktionen tar bara `[0]`:

```typescript
// Rad 1427-1429 i import-bookings/index.ts
const rigdowndate = externalBooking.rig_down_dates[0]  // Dag 2 kastas bort!
```

Dessutom finns en unique constraint `(booking_id, event_type)` på `calendar_events` som **omöjliggör** flera rigDown-events för samma bokning. Det finns en annan constraint `(booking_id, event_type, start_time)` som tillåter det — men den första blockerar.

### Lösning

**1. Databas: Ta bort den begränsande unique constraint**
- Drop `calendar_events_booking_id_event_type_unique` (den som bara har `booking_id, event_type`)
- Behåll `unique_booking_event_time` (`booking_id, event_type, start_time`) — denna tillåter flera dagar av samma typ

**2. Edge function `import-bookings/index.ts`: Skapa events för ALLA datum**

Ändra kalenderhändelse-skapandet (~rad 2460-2510) så det loopar genom hela datum-arrayen:

```text
// Istället för bara rigdowndate (första datumet):
for each date in rig_down_dates array:
  → skapa en rigDown-event med det datumet

// Samma för rig_up_dates och event_dates
for each date in rig_up_dates array:
  → skapa en rig-event

for each date in event_dates array:
  → skapa en event-event
```

- Spara datum-arrayerna som extra data genom att skicka dem genom processflödet
- Ändra upsert conflict target till `booking_id,event_type,start_time`
- Behåll `bookingData.rigdowndate` = första datumet (för bakåtkompatibilitet med bookings-tabellen)

**3. Uppdatera datum-ändringsdetektering**

Vid update av befintlig bokning (~rad 2019): jämför alla datum, inte bara det första, för att avgöra om kalenderhändelser behöver återskapas.

**4. Uppdatera warehouse-events**

Warehouse-funktionen (`generateWarehouseEvents`) behöver också hantera flera rigdown-datum för return/inventory/unpacking-events.

### Filer som ändras
- Migration: drop constraint
- `supabase/functions/import-bookings/index.ts` — multi-date loop för kalender + warehouse

### Teknisk detalj
`bookings`-tabellen behåller sina enkla datumfält (`rigdowndate`, `rigdaydate`, `eventdate`) med första datumet — inga schema-ändringar behövs. Flera dagar hanteras enbart på kalendernivå.

