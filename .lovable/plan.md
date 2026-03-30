

## Plan: Ny teamfördelningslogik (round-robin med sekventiell placering)

### Nuvarande beteende
`getNextTeamAssignment` i `supabase/functions/import-bookings/index.ts` väljer team baserat på minst antal överlappningar. Ingen round-robin-ordning.

### Nytt beteende
1. **Round-robin**: Jobb fördelas i ordning Team 1 → Team 2 → ... → Team 5, sedan börjar om.
2. **Sekventiell starttid**: När ett team redan har ett jobb, placeras nästa jobb på samma team med starttid EFTER det befintliga jobbets sluttid (om jobbet inte har bestämd tid).
3. **Bestämd starttid**: Om ett jobb har en explicit starttid (`isExplicit = true`), välj det team som har en ledig lucka vid den tiden. Om inget team har öppning, placera på Team 1 (eller nästa i round-robin) och låt dem överlappa.

### Ändringar

**Fil: `supabase/functions/import-bookings/index.ts`**

Ersätt `getNextTeamAssignment`-funktionen med ny logik:

- Hämta alla befintliga events för datumet på team-1 till team-5
- Bygg en map per team med slutdatum för sista jobbet
- **Om jobbet har EXPLICIT starttid**: gå igenom team 1–5 i ordning, hitta första team utan överlappning vid den tiden. Om inget hittas → team-1 (överlapp tillåtet).
- **Om jobbet har DEFAULT-tider (ingen bestämd starttid)**: Round-robin baserat på antal jobb per team. Teamet med minst antal jobb (lägst nummer vid lika) väljs. Jobbets starttid sätts till efter sista jobbets sluttid på det teamet.

Uppdatera `desiredEvents`-strukturen att inkludera `isExplicit`-flagga (start/end) så att `getNextTeamAssignment` vet om tiden är bestämd.

Funktionssignaturen utökas med en `isExplicitStart: boolean`-parameter.

Där anropet sker (rad ~868) skickas `isExplicit`-flaggan med från `buildDateTimeFromPartsEx`.

**Fil: `src/utils/teamAvailability.ts`**

Uppdatera `findAvailableTeam` med samma logik för klientsidan (manuellt tillagda events).

### Tekniska detaljer

```text
Jobb utan bestämd tid:
  Round-robin: Team 1 → 2 → 3 → 4 → 5 → 1 → ...
  Team 1: [Job A 08-12] [Job F 12-16]  ← Job F startar efter Job A
  Team 2: [Job B 08-12]
  Team 3: [Job C 08-12]
  ...

Jobb med bestämd tid (t.ex. 10:00-14:00):
  Sök team utan krock kl 10-14
  → Team 2 ledig? → Placera där
  → Alla upptagna? → Team 1 (överlapp ok)
```

