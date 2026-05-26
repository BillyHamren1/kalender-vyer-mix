## Vad jag hittade

Bokning **2605-76** (Tavet AB) är i ett inkonsekvent tillstånd:

- `assigned_project_id` = NULL → "Placera"-dialogen visar den som **oplacerad**
- `large_project_id` = NULL → ingen LP-koppling
- **MEN det finns 4 calendar_events** med `booking_id` = bokningens id:

| id | start | typ | team |
|----|-------|-----|------|
| 2172b2d9… | 2026-06-01 08:00 | rig | team-4 |
| 14962fd4… | 2026-07-04 08:00 | rig | team-4 |
| b76d7026… | 2026-06-09 08:00 | rigDown | team-4 |
| 38dc447a… | 2026-06-10 08:00 | rigDown | team-4 |

Det är därför kortet "Tavet AB #2605-76 Hällekis" syns i kalendern samtidigt som dialogen säger att bokningen behöver placeras. Kalenderhändelserna är "föräldralösa" — ingen projektrad refererar längre till dem.

Troligen ett residual från en tidigare placering där projektraden togs bort (eller där `assigned_project_id` rensades) utan att kalenderhändelserna städades.

## Förslag (välj ett)

**A. Rensa kalenderhändelserna** så bokningen blir helt oplacerad och kan placeras på nytt från dialogen.
```sql
DELETE FROM public.calendar_events
WHERE id IN (
  '2172b2d9-3492-4ad4-91fe-17a054265931',
  '14962fd4-3e94-4d11-a2f2-1cde2422d522',
  'b76d7026-5db9-4201-b172-eb96ac02cafe',
  '38dc447a-0c39-4c3a-a337-98c7d7f215f3'
);
```
Resultat: korten försvinner från kalendern, dialogen står kvar med tomma kolumner att placera i.

**B. Återskapa projektkopplingen** (om dagarna i kalendern är rätt och du bara vill stänga "oplacerad"-flaggan). Skapar ett nytt projekt och pekar `assigned_project_id` på det + döper events.

Jag rekommenderar **A** eftersom du just bad om en clean placering. Säg vilken så kör jag.

## Vidare uppföljning (frivillig)

Efter att vi sett detta två gånger på en kvart (2605-22 + 2605-76) ser det ut att finnas en flow där projektraden eller `assigned_project_id` försvinner utan att `calendar_events` städas. Om du vill kan jag som nästa steg:
- Lägga till en sanity-check i admin UI som flaggar bokningar med `calendar_events` men utan projekt/LP.
- Eller en DB-trigger som rensar/markerar dessa events automatiskt vid frikoppling.

Men det är ett separat jobb — inget jag gör nu utan att du säger till.