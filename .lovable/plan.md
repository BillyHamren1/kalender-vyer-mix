
## Rotorsak: Race condition skapar dubbletter i warehouse_calendar_events

### Vad som händer

Det finns **två separata kodvägar** som båda skapar warehouse-kalender-events för samma bokning:

1. **Edge Function `import-bookings`** anropar `syncWarehouseEventsForBooking()` — skapar 6 warehouse-events direkt i databasen
2. **Frontend-tjänsten `bookingCalendarService.ts`** — `syncSingleBookingToCalendar()` anropar i sin tur `syncBookingToWarehouseCalendar()` från `warehouseCalendarService.ts` och skapar samma 6 events en gång till

Båda körs var för sig med ett delete-then-insert-mönster. Men eftersom de inte är synkroniserade kan de interferera med varandra och skapa dubbletter.

Dessutom finns det ett **datumsformat-fel** i warehouse-queryn i `useDashboardEvents.ts` (rad 126) som gör att queryn hämtar mer data än avsett.

### Lösning: Ta bort dubbelskapningen + städa upp befintliga dubbletter

**Del 1 — Ta bort duplicate-källan i `bookingCalendarService.ts`**

`syncSingleBookingToCalendar` anropar `syncBookingToWarehouseCalendar(booking)` på rad 275. Det ska **tas bort** — warehouse-sync i frontend-tjänsten är redundant eftersom Edge Function redan hanterar detta vid import. Frontend-tjänsten ska bara hantera `calendar_events` (personal-planering), inte warehouse-events.

**Del 2 — Fixa datumsformat i `useDashboardEvents.ts`**

Rad 126 använder `startStr` (utan tid) medan alla andra queries korrekt använder `${startStr}T00:00:00`. Konsistens bör upprätthållas.

**Del 3 — Städa upp befintliga dubbletter i databasen**

Nuvarande dubbletter i `warehouse_calendar_events` måste rensas. En SQL-query körs som behåller den nyaste raden per `(booking_id, event_type)` och tar bort de äldre.

### Tekniska ändringar

**Fil 1: `src/services/bookingCalendarService.ts`**

Ta bort anropet till `syncBookingToWarehouseCalendar` från `syncSingleBookingToCalendar` (rad 273-280). Warehouse-synkronisering sker uteslutande via Edge Function `import-bookings`. Frontend-tjänsten ska **inte** skriva warehouse-events.

Före:
```typescript
// Sync to warehouse calendar
try {
  await syncBookingToWarehouseCalendar(booking);
  ...
} catch (warehouseError) {
  ...
}
```

Efter: hela det blocket raderas.

**Fil 2: `src/hooks/useDashboardEvents.ts`**

Rad 126 — fixa datumfilter för warehouse-queryn:
```typescript
// Före:
.gte('start_time', startStr)

// Efter:
.gte('start_time', `${startStr}T00:00:00`)
```

**Databasrensning (SQL att köra)**

```sql
-- Ta bort dubbletter, behåll senaste per booking_id + event_type
DELETE FROM warehouse_calendar_events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY booking_id, event_type 
        ORDER BY created_at DESC NULLS LAST
      ) AS rn
    FROM warehouse_calendar_events
  ) sub
  WHERE rn > 1
);
```

### Filer att ändra

1. `src/services/bookingCalendarService.ts` — ta bort `syncBookingToWarehouseCalendar`-anropet
2. `src/hooks/useDashboardEvents.ts` — fixa datumsformat i warehouse-queryn

### Direkt databasrensning

Jag kör också en rensnings-SQL direkt för att ta bort befintliga dubbletter så att dashboarden ser korrekt ut omedelbart.
