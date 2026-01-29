
# Plan: Hantera statusändringar från externa systemet i import-bookings

## Problemanalys

Jag har hittat problemet! I `import-bookings` edge function:

1. **Statusändringar detekteras korrekt** (rad 405, 413-415)
2. **MEN** - när en bokning går från `CONFIRMED` till annat (t.ex. `CANCELLED`) tas **inte** kalenderhändelserna bort

Detta betyder att om det externa systemet skickar en statusändring (t.ex. bokning avbokad), uppdateras bokningen i databasen men kalenderhändelserna finns kvar!

## Lösning

Lägga till logik i `import-bookings` som:
1. Kontrollerar om status ändrats från `CONFIRMED` → annan status
2. Tar bort alla kalenderhändelser (`calendar_events` och `warehouse_calendar_events`) för den bokningen
3. Om status ändras till `CONFIRMED`, skapa nya kalenderhändelser (redan implementerat)

## Tekniska ändringar

### Fil: supabase/functions/import-bookings/index.ts

Lägg till efter statusändringsdetektionen (efter rad 415):

```typescript
// CRITICAL: Handle status changes that affect calendar
if (statusChanged) {
  const wasConfirmed = existingBooking.status === 'CONFIRMED';
  const isNowConfirmed = bookingData.status === 'CONFIRMED';
  
  // If booking was confirmed but now isn't - REMOVE all calendar events
  if (wasConfirmed && !isNowConfirmed) {
    console.log(`Booking ${bookingData.id} is no longer CONFIRMED - removing calendar events`);
    
    // Remove from calendar_events
    const { error: deleteCalError } = await supabase
      .from('calendar_events')
      .delete()
      .eq('booking_id', existingBooking.id);
    
    if (deleteCalError) {
      console.error(`Error removing calendar events:`, deleteCalError);
    } else {
      console.log(`Removed calendar events for booking ${existingBooking.id}`);
    }
    
    // Remove from warehouse_calendar_events
    const { error: deleteWhError } = await supabase
      .from('warehouse_calendar_events')
      .delete()
      .eq('booking_id', existingBooking.id);
    
    if (deleteWhError) {
      console.error(`Error removing warehouse events:`, deleteWhError);
    } else {
      console.log(`Removed warehouse events for booking ${existingBooking.id}`);
    }
  }
  
  // If booking is now confirmed but wasn't before - calendar events will be created below (line 539)
  if (!wasConfirmed && isNowConfirmed) {
    console.log(`Booking ${bookingData.id} is now CONFIRMED - calendar events will be created`);
  }
}
```

## Förväntade resultat

Efter implementationen:
- När externa systemet skickar en bokning med status ändrad från CONFIRMED → CANCELLED/OFFER:
  - Bokningen uppdateras i `bookings`-tabellen
  - Alla relaterade `calendar_events` tas bort
  - Alla relaterade `warehouse_calendar_events` tas bort
  - Loggar visar vad som hände

- När externa systemet skickar en bokning med status ändrad till CONFIRMED:
  - Bokningen uppdateras i `bookings`-tabellen
  - Nya kalenderhändelser skapas automatiskt (befintlig logik på rad 539+)

## Testning

Efter deploy:
1. Skicka en testbokning från externa systemet med status `CONFIRMED`
2. Verifiera att kalenderhändelser skapas
3. Skicka samma bokning med status `CANCELLED`
4. Verifiera att kalenderhändelser tas bort
5. Kontrollera edge function-loggar för bekräftelse
