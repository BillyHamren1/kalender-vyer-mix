

# Fix: Tidsöversikten visar jobb som inte finns i personalkalendern

## Problem
`fetchOpsTimeline` i `opsControlService.ts` matchar kalenderhändelser enbart på `booking_id` — utan att kontrollera att `resource_id` matchar assignmentens `team_id`. Om en `booking_staff_assignment` pekar på team-X men kalenderhändelsen ligger på team-Y, visas jobbet ändå i tidsöversikten trots att personalkalendern (korrekt) filtrerar bort det.

## Fix

### Ändra `src/services/opsControlService.ts` — `fetchOpsTimeline`

Ändra hur `eventsByBooking` byggs och används. Istället för att indexera enbart på `booking_id`, indexera på `booking_id + resource_id` (composite key):

```text
Före (rad 264-268):
  eventsByBooking nyckel = booking_id
  → alla events för en bokning returneras oavsett team

Efter:
  eventsByBooking nyckel = booking_id + "|" + resource_id
  → vid lookup: calEvents = map.get(a.booking_id + "|" + a.team_id)
  → om inget matchar → assignment visas inte (filtrera bort tomma)
```

Konkret:
1. Lägg till `resource_id` i calendar_events-queryn (redan hämtas men behöver inkluderas i select)
2. Ändra Map-nyckeln till `${e.booking_id}|${e.resource_id}`
3. Vid lookup (rad 277): `eventsByBooking.get(\`${a.booking_id}|${a.team_id}\`)` 
4. Filtrera bort assignments utan matchande kalenderhändelse (inga phantom-jobb)

### Påverkan
- En fil ändras: `opsControlService.ts`
- Tidsöversikten visar bara jobb som faktiskt har kalenderhändelser på rätt team — exakt som personalkalendern

