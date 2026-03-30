

## Plan: Eventdagar — alltid team-11 (Live), 3h, sekventiell stacking

### Vad ändras

Eventdagar ska:
- **Alltid** placeras på team-11 (Live) — detta fungerar redan
- **Alltid vara 3 timmar** (ändras från nuvarande 2.5h)
- **Stackas sekventiellt** samma dag: första 08:00–11:00, andra 11:00–14:00, tredje 14:00–17:00 osv.
- **INTE** följa round-robin-logiken för team 1–5

### Ändringar

**Fil: `supabase/functions/import-bookings/index.ts`**

1. **`getEndTimeForEventType`** (rad 711–712): Ändra `event` duration från `2.5` till `3` timmar.

2. **`getNextTeamAssignment`** (rad 1031–1034): Utöka team-11-grenen så att den:
   - Hämtar befintliga events på team-11 för samma dag
   - Hittar senaste sluttiden
   - Returnerar team-11 **samt justerar starttid** för det nya eventet så att det börjar efter sista befintliga eventet
   - Returnera en struct med `{ teamId, adjustedStart, adjustedEnd }` istället för bara teamId

   Alternativt (enklare): Justera start/sluttider för event-typen **innan** `getNextTeamAssignment` anropas — direkt i reconcile-loopen (rad 793–804) genom att kolla befintliga team-11 events för samma dag och stacka.

3. **Reconcile-loopen** (rad 793–804): För `event`-typen, innan push till `desiredEvents`:
   - Hämta befintliga team-11 events för samma datum (inklusive redan pushade desired events)
   - Räkna ut hur många event som redan finns den dagen
   - Sätt starttid = 08:00 + (antal × 3h), sluttid = starttid + 3h
   - Ignorera bokningens egna event_start_time/event_end_time (alltid 3h-block)

### Teknisk detalj

```text
Team-11 (Live), samma dag:
  Event A: 08:00–11:00
  Event B: 11:00–14:00
  Event C: 14:00–17:00
  ...
```

Två filer berörs:
- `supabase/functions/import-bookings/index.ts` — edge function
- `src/utils/teamAvailability.ts` — klientsidans `findAvailableTeam` (behåll team-11 exkludering, ingen ändring behövs)

