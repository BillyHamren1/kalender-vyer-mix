
## Problem

I `getNextTeamAssignment` (supabase/functions/import-bookings/index.ts) staplas inte event utan explicit starttid. Alla default-rig (08:00–12:00) hamnar på sin valda team men **behåller 08:00–12:00**, vilket gör att t.ex. team-1 får jobb 1 OCH jobb 6 ovanpå varandra på 08:00 så snart vi har fler jobb än team.

Värre: när ett event HAR explicit tid (jobb 3, 06:00–09:00) tas hänsyn bara till det eventet i overlap-kollen — övriga default-event staplas inte runt det.

Förväntat beteende (ditt exempel: 4 team aktiva, 7 jobb, jobb #3 = 06–09):

| Jobb | Tid | Team |
|------|-----|------|
| 1    | 08–12 default | team-1 |
| 2    | 08–12 default | team-2 |
| 3    | **06–09 explicit** | team-3 (eller första lediga) |
| 4    | 08–12 default | team-4 |
| 5    | stack: 12–16 | team-1 |
| 6    | stack: 12–16 | team-2 |
| 7    | stack: 09–13 (efter explicit) eller 12–16 | team-3 / team-4 |

Inga events ligger ovanpå varandra — de "rinner" sekventiellt nedåt per team.

## Lösning

### 1. Ändra `reconcileCalendarEvents` så att teamtilldelning OCH staggad starttid bestäms tillsammans

Idag är flödet:
```
desired.start_time = 08:00 (default)
   ↓
getNextTeamAssignment(...) → team-1
   ↓
INSERT row med start_time = 08:00
```

Nytt flöde:
```
desired.start_time = 08:00 (preferred default)
   ↓
assignTeamAndTime(...) → { team: 'team-1', start: '08:00', end: '12:00' }
                     eller { team: 'team-1', start: '12:00', end: '16:00' } om team-1 är ledig först kl 12
   ↓
INSERT row med tilldelad start/end
```

### 2. Ny funktion `assignTeamAndTime` ersätter `getNextTeamAssignment`

Algoritm:
- **Om eventet har explicit start** → behåll tiden, sök första team som inte har overlap (oförändrad logik).
- **Om eventet är default** (08:00 + duration t.ex. 4h):
  1. Hämta alla befintliga events för dagen på team-1..team-5.
  2. För varje team, beräkna "nästa lediga slot" från preferred start (08:00) genom att hoppa förbi befintliga events.
     - Ex: team-1 har 06–09 (explicit). Preferred 08:00 krockar → flytta till 09:00 → 09–13.
     - Ex: team-1 har 08–12. Preferred 08:00 krockar → flytta till 12:00 → 12–16.
     - Ex: team-1 är tom → 08:00 → 08–12.
  3. Välj det team där "nytt event-fönster" får tidigast starttid.
  4. Tie-break: lägsta team-nummer.
- Använd inte längre "round-robin by event count" — sekventiell stapling per team ger automatiskt bra fördelning (alla team får sin första 08–12 innan någon får sin andra 12–16).

### 3. Ordning på desiredEvents-loopen

För att stapling ska bli stabil måste vi processa events i en deterministisk ordning **inom samma reconciler-pass**. Idag körs events per booking, men flera bookings reconcileras seriellt och ser varandras inserts.

Inget extra behövs där — varje booking-reconcile fetchar `existingEvents` igen i `assignTeamAndTime`, så varje jobb ser tidigare jobbs placeringar.

**MEN**: inom EN booking med flera dagar (Tiomila har 4 rig-dagar × 1 sub-booking) räknas varje dag separat och påverkar inte varandra (olika datum), så ordningsproblem uppstår inte.

### 4. Updates av befintliga events

Idag: om `existing.start_time !== desired.start_time` → UPDATE.

Med staggning blir `desired.start_time` _dynamiskt_, vilket riskerar att flytta runt befintliga events varje pass. Lösning:

- För **redan placerade events** (existing finns på samma `event_type|date`): behåll existerande start/end och resource_id om det inte är explicit. Bara explicita ändringar (booking har fått `rig_start_time` satt) ska forcera UPDATE.
- För **nya events**: kör `assignTeamAndTime` med medvetenhet om alla redan placerade.

Konkret:
```ts
if (existing) {
  // Behåll existing.start_time/end_time/resource_id om eventet är default
  // Uppdatera bara om explicit-tid har ändrats eller titel/adress/booking_number
  const explicitTimeChanged = desired.isExplicitStart && 
    (existing.start_time !== desired.start_time || existing.end_time !== desired.end_time);
  const metaChanged = existing.title !== desired.title || ...;
  if (explicitTimeChanged || metaChanged) UPDATE...;
} else {
  const placement = await assignTeamAndTime(...);
  INSERT med placement.start, placement.end, placement.team
}
```

Detta gör placeringen **stabil**: när ett event väl hamnat på team-2 @ 12:00 ligger det kvar där tills bokningen explicit ändrar tiden eller raderas.

### 5. Backfill (engångsåtgärd)

Befintliga events där flera jobb staplats på 08:00 på samma team behöver INTE auto-omfördelas — det skulle skapa kaos i en levande planering. Vi kör inget backfill-skript. Användaren får antingen leva med befintliga klumpar eller dra dem manuellt. Endast NYA events får den staggade logiken.

(Vill du att jag staggar om befintliga events i databasen också, säg till — då lägger jag till ett separat backfill-steg.)

## Filer att ändra

- `supabase/functions/import-bookings/index.ts`
  - Ersätt `getNextTeamAssignment` → `assignTeamAndTime` (returnerar `{team, start_time, end_time}`)
  - Uppdatera anropet i `reconcileCalendarEvents` så det använder returnerade tider för INSERT
  - Uppdatera `needsUpdate`-logiken så stabila placeringar inte rörs vid varje pass

Inga DB-migrationer. Inga andra filer behöver röras.

## Risker

- **Risk för flytt av redan-placerade events** om jag inte är försiktig i punkt 4 → täcks av "behåll existing om default".
- **Race condition** om import-bookings körs parallellt för flera bookings samma sekund — andra bookingens `existingEvents`-fetch kan missa första bookingens nyss-insertade row. Sannolikheten är låg (importer körs seriellt i practice) och konsekvensen är att två events råkar hamna på 08:00 på samma team. Hanteras av nästa reconcile-pass om vi skulle göra placering stabil; eller accepteras som edge case.

## Bekräftelse

Efter implementering testar jag mot din kalender (4 aktiva team + 7 default-jobb + 1 explicit) genom att:
1. Köra reconciler för relevanta bookings.
2. Querya `calendar_events` och visa start_time + resource_id-fördelningen.
3. Säkerställa att inga två events överlappar på samma team samma dag.
