
# Plan: Synkronisera lagerkalender vid import av bokningar

## Problem
Bokningar som importeras via `import-bookings` edge-funktionen skapar endast händelser i personalplaneringen (`calendar_events`-tabellen), men **ingen synkronisering sker till lagerkalendern** (`warehouse_calendar_events`-tabellen). 

Därför syns bokning `2601-2` i personalplaneringen men inte i lagerkalendern.

## Lösning
Lägg till automatisk synkronisering till lagerkalendern i import-funktionen efter att kalenderhändelser skapats för bekräftade bokningar.

---

## Teknisk sammanfattning

När en bokning importeras och är bekräftad:
1. Kalenderhändelser (rig/event/rigdown) skapas i `calendar_events`
2. **NY:** Sex logistikhändelser skapas i `warehouse_calendar_events`:
   - Packning (4 dagar före rig)
   - Utleverans (på rig-dagen)
   - Event
   - Återleverans (på rigdown-dagen)
   - Inventering (dagen efter rigdown)
   - Upppackning (dagen efter rigdown)

---

## Ändringar

### 1. Edge Function: Lägg till lagersynkronisering

I `supabase/functions/import-bookings/index.ts`, efter att kalenderhändelser skapats:

**Fil att ändra:** `supabase/functions/import-bookings/index.ts`

Lägg till en hjälpfunktion och anrop den efter att kalenderhändelser skapats:

```text
// Efter rad 757 (efter "results.calendar_events_created++")
// Synka till lagerkalender för bekräftade bokningar med datum
if (isNowConfirmed && (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate)) {
  await syncWarehouseEventsForBooking(supabase, bookingData);
}
```

Hjälpfunktionen skapar de 6 logistikhändelserna baserat på samma regler som `warehouseCalendarService.ts`:

| Händelsetyp | Baseras på | Offset |
|-------------|------------|--------|
| Packning | rigdaydate | -4 dagar |
| Utleverans | rigdaydate | 0 |
| Event | eventdate | 0 |
| Återleverans | rigdowndate | 0 |
| Inventering | rigdowndate | +1 dag |
| Upppackning | rigdowndate | +1 dag |

### 2. Lägg till UPSERT-logik

Använd `upsert` med `onConflict: 'booking_id,event_type'` för att undvika duplicerade händelser vid återimport.

---

## Tekniska detaljer

### Ny funktion i import-bookings

```text
async function syncWarehouseEventsForBooking(supabase: any, booking: any) {
  console.log(`[Warehouse] Syncing warehouse events for booking ${booking.id}`)
  
  // Ta bort befintliga lagerhändelser för bokningen
  await supabase
    .from('warehouse_calendar_events')
    .delete()
    .eq('booking_id', booking.id)
  
  const events = []
  const clientName = booking.client || 'Okänd kund'
  
  // Skapa 6 händelser baserat på WAREHOUSE_RULES
  if (booking.rigdaydate) {
    // Packning: 4 dagar före
    events.push({
      booking_id: booking.id,
      booking_number: booking.booking_number,
      title: `Packning - ${clientName}`,
      event_type: 'packing',
      // ... beräkna start/end baserat på rigdaydate - 4 dagar
    })
    // Utleverans: samma dag som rig
    events.push({ ... })
  }
  
  // ... skapa övriga händelser
  
  // Infoga alla
  if (events.length > 0) {
    await supabase.from('warehouse_calendar_events').insert(events)
  }
}
```

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Lägg till `syncWarehouseEventsForBooking` funktion och anropa den efter kalenderhändelser skapats |

### Datumberäkningar

```text
Regler för lagerhändelser:
- Packning: rigdaydate - 4 dagar, 08:00-11:00
- Utleverans: rigdaydate, 07:00-09:00
- Event: eventdate, använd event_start_time/event_end_time eller 09:00-17:00
- Återleverans: rigdowndate, 17:00-19:00
- Inventering: rigdowndate + 1 dag, 08:00-10:00
- Upppackning: rigdowndate + 1 dag, 10:00-12:00
```

---

## Förväntade resultat

Efter implementationen:
1. Alla importerade bekräftade bokningar får automatiskt lagerhändelser
2. Bokning `2601-2` kommer synas i lagerkalendern efter nästa import
3. Befintliga bokningar kan synkas via en manuell "Synka alla till lager"-funktion
