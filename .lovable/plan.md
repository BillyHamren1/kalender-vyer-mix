

## Fix: Stora projekt syns inte korrekt i packningskalendern

### Problem
1. DB-triggern `sync_packing_on_booking_change` skriver ÖVER `start_date`/`end_date` på den samlade packlistan med EN boknings datum varje gång den bokningen uppdateras. Detta krymper datumspannet och kan göra att projektet hamnar utanför vyn.
2. Etiketten i kalendern visar första bokningens kundnamn/nummer istället för projektnamnet.

### Plan

**1. Databasmigration — Skydda samlade packlistor i triggern**

Uppdatera `sync_packing_on_booking_change()` så att den INTE skriver över `start_date`/`end_date` (eller namn) på packlistor med `large_project_id IS NOT NULL`. Istället beräknar den det fulla datumspannet från alla kopplade bokningar.

```sql
-- Om packlistan är en samlad (large_project_id IS NOT NULL):
-- Beräkna min(rigdaydate), max(rigdowndate) från ALLA kopplade bokningar
-- via packing_project_bookings istället för att använda enskild boknings datum
```

**2. PackingCalendarView — Bättre etikett för stora projekt**

Ändra label-logiken: om `p.large_project_id` finns, visa projektnamnet (`p.name`) med en "Projekt"-markering istället för bokningsnummer + kundnamn.

**3. Säkerställ aktuella datum (ny migration)**

Kör samma UPDATE som förra gången för att garantera att datumen inte redan skrivits över av triggern sedan senast.

### Filer som ändras
- Ny migration: uppdatera `sync_packing_on_booking_change()` + re-populera datum
- `src/components/packing/PackingCalendarView.tsx` — label-logik för stora projekt
