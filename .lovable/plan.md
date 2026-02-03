
# Plan: Synkronisera lagerkalender vid import av bokningar

## Status: ✅ IMPLEMENTERAT

## Problem
Bokningar som importerades via `import-bookings` edge-funktionen skapade endast händelser i personalplaneringen (`calendar_events`-tabellen), men **ingen synkronisering skedde till lagerkalendern** (`warehouse_calendar_events`-tabellen).

## Lösning (Implementerad)
Lagt till automatisk synkronisering till lagerkalendern i import-funktionen efter att kalenderhändelser skapats för bekräftade bokningar.

---

## Teknisk implementering

### Ändringar i `supabase/functions/import-bookings/index.ts`:

1. **Ny hjälpfunktion `addDays`**: Beräknar datum med offset för lagerhändelser.

2. **Ny funktion `syncWarehouseEventsForBooking`**: Skapar 6 logistikhändelser per bokning:
   - **Packning**: `rigdaydate - 4 dagar`, 08:00-11:00
   - **Utleverans**: `rigdaydate`, 07:00-09:00
   - **Event**: `eventdate`, 09:00-17:00
   - **Återleverans**: `rigdowndate`, 17:00-19:00
   - **Inventering**: `rigdowndate + 1 dag`, 08:00-10:00
   - **Upppackning**: `rigdowndate + 1 dag`, 10:00-12:00

3. **Automatisk recovery**: Bokningar som saknar warehouse-händelser eller har föråldrade datum synkas automatiskt vid import.

4. **Spårning**: Nya fältet `warehouse_events_created` i resultat-objektet.

---

## Resultat

- ✅ Alla importerade bekräftade bokningar får automatiskt lagerhändelser
- ✅ Befintliga bokningar med saknade/föråldrade warehouse-händelser synkas automatiskt
- ✅ Duplicerade händelser rensas automatiskt
