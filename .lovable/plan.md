
## Roten till problemet: Warehouse events skapas om utan datumkontroll

### Vad som händer

Varje gång synken körs och en bokning har `needsProductUpdate = true` (t.ex. produkter har ändrats), passerar koden förbi alla `continue`-satser och når den avslutande sektionen (~rad 2518-2522):

```typescript
// Sync warehouse calendar events for confirmed bookings with dates
if (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate) {
  const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
  results.warehouse_events_created += warehouseEventsCreated;
}
```

Och `syncWarehouseEventsForBooking` gör alltid:
1. **DELETE** alla warehouse events för bokningen
2. **INSERT** 6 nya events

Eftersom synken kördes 2 gånger på ~1 minut (syns i nätverksloggarna) och produkterna ändrades, skapades events om — men databasen visar `count:2` per event_type, vilket tyder på att DELETE faktiskt inte hann (eller misslyckades) och dubbletterna bliyr kvar.

Nätverksloggarna visar `warehouse_events_created: 24` per synk (4 bokningar × 6 events = 24), men databasen visar att varje event finns 2 gånger för bokning 2602-2. Det bekräftar att DELETE+INSERT-cykeln körde men tidigare events inte raderades korrekt.

### Egentliga bugg: Saknad guard för "dates unchanged"

Koden på rad 1412-1433 kontrollerar om warehouse events behöver återhämtas (utdaterade datum). Om datumen INTE ändrats sätts `needsWarehouseRecovery = false`. Men när koden sedan når rad 2518 anropas warehouse sync **ändå** utan att kontrollera `needsWarehouseRecovery`.

Flödet ser ut så här:
```text
hasChanged=false, needsProductUpdate=true
  → skippas INTE (continue på rad 1527 triggas ej)
  → skippas INTE (continue på rad 1558-1572 kräver att !needsProductUpdate)
  → kod körs vidare till rad 2518
  → syncWarehouseEventsForBooking() anropas ALLTID
```

### Lösning

Lägg till en guard vid rad ~2518 som **bara** anropar `syncWarehouseEventsForBooking` när:
- Booking är ny (`!existingBooking`), ELLER
- Datumen faktiskt förändrats (`needsWarehouseRecovery = true`), ELLER
- Bokningens status precis blivit CONFIRMED (`!wasConfirmed && isNowConfirmed`)

```typescript
// BEFORE (buggy):
if (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate) {
  const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
  results.warehouse_events_created += warehouseEventsCreated;
}

// AFTER (fixed):
const isNewBooking = !existingBooking;
const justConfirmed = !wasConfirmed && isNowConfirmed;
if ((isNewBooking || needsWarehouseRecovery || justConfirmed) &&
    (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate)) {
  const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
  results.warehouse_events_created += warehouseEventsCreated;
}
```

### Sekundär fix: Städa upp befintliga dubbletter

Det finns redan 2 kopior av varje event i databasen. RPC-funktionen `cleanup_duplicate_calendar_events` anropas redan av frontend, men hanterar troligen bara `calendar_events`, inte `warehouse_calendar_events`. Vi lägger till en SQL-rensning direkt i edge-funktionen vid start (eller skapar en ny SQL-funktion).

Alternativt rensa de befintliga dubbletterna nu via SQL:
```sql
DELETE FROM warehouse_calendar_events a
USING warehouse_calendar_events b
WHERE a.booking_id = b.booking_id
  AND a.event_type = b.event_type
  AND a.start_time = b.start_time
  AND a.id > b.id;
```

### Tekniska ändringar

**Fil att ändra:** `supabase/functions/import-bookings/index.ts`

**Rad ~2518-2522**: Lägg till guard med `isNewBooking || needsWarehouseRecovery || justConfirmed`:

```typescript
const isNewBooking = !existingBooking;
const justConfirmed = !wasConfirmed && isNowConfirmed;

if ((isNewBooking || needsWarehouseRecovery || justConfirmed) &&
    (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate)) {
  const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
  results.warehouse_events_created += warehouseEventsCreated;
}
```

**Notera:** `wasConfirmed` och `isNowConfirmed` deklareras på rad 1775-1776, men bara inuti `if (existingBooking)` blocket. Vi behöver flytta deklareringen eller använda `existingBooking` för att bestämma `isNewBooking`.

### Städa upp nuvarande dubbletter

Som en del av implementationen körs en SQL-rensning för att ta bort befintliga dubbletter från databasen via Supabase.

### Sammanfattning

| Åtgärd | Fil |
|--------|-----|
| Guard: anropa warehouse sync bara vid nya/ändrade datum | `supabase/functions/import-bookings/index.ts` rad ~2518 |
| Rensa befintliga dubbletter | SQL direkt mot databasen |
| Ny deploy av edge-funktionen | Automatiskt |
