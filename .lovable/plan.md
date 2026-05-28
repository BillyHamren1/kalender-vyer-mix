# Plan: rensa "Nya bokningar"-listan från stora projekt

## Vad jag faktiskt hittade (inte luddigt — fakta)

Jag gick igenom hela kedjan **personalkalender ↔ projektkalender ↔ "Nya bokningar"-listan** och kan bekräfta:

### Personalkalendern är HELT orörd
- `src/services/staffCalendarService.ts`, `src/services/plannerCalendarDerivation.ts` och `src/lib/staffCalendar/deriveStaffEvents.ts` har inga differentiella ändringar.
- Personalkalendern bygger sin synlighet på **`booking_staff_assignments` + `large_project_staff` + projektets datum** — INTE på `calendar_events`-rader, INTE på `planning_status`, INTE på "Nya bokningar"-listan.
- Kontrakts­testet `personalkalenderUntouched.contract.test.ts` skyddar fortfarande detta.

### Varför "Swedish game fair" syns i listan
- `src/hooks/useUnplannedProjects.ts` (rad 40–45) frågar **explicit** `large_projects WHERE planning_status = 'needs_planning'`.
- `createLargeProject` sätter aldrig `planning_status`, så DB-default `needs_planning` gäller → **varje nytt stort projekt hamnar automatiskt i listan**.
- Det är detta som triggar din "Stort"-badge. Listan har alltså blandat ihop två orelaterade saker:
  1. Fristående bokningar som väntar på att placeras i personalkalendern (rätt målgrupp för listan).
  2. Stora projekt som råkar ha en gammal `needs_planning`-flagga (fel målgrupp — stora projekt styrs av sin egen projektkalender).

### Vad händer om man klickar "Placera" på ett stort projekt i listan?
Då — och **endast då** — skriver `BookingPlacementDialog` `calendar_events`-rader. Men eftersom personalkalendern inte läser `calendar_events` för synlighet utan bara för tider/team-enrichment, **påverkar det inte vem som ser vad i personalkalendern**. Det är assignment-styrt.

**Slutsats:** Listan är förvirrande, men personalkalendern är inte och har inte varit påverkad av projektkalendern.

## Vad jag föreslår att vi gör (minimalt)

Ändringen är liten och rör bara frontend-listan:

1. **Ta bort `large_projects`-frågan ur `useUnplannedProjects`.**
   - Listan visar då endast `projects` (medel) med `planning_status='needs_planning'` + fristående bokningar utan projekt.
   - Stora projekt försvinner ur "Nya bokningar" helt — där hör de inte hemma.

2. **`UnplannedProjectsBanner`** (samma datakälla) följer med automatiskt.

3. **Inget DB-arbete behövs.** `planning_status`-kolumnen på `large_projects` lämnas orörd (den läses bara av dessa två frontend-ställen efter ändringen).

4. **Personalkalendern rörs inte.** Kontrakts­testet fortsätter skydda det.

5. **Regressionstest:** uppdatera `useUnplannedProjects.static.test.ts` så det bevisar att `large_projects`-tabellen inte längre frågas — så ingen återinför det av misstag.

## Berörda filer

- `src/hooks/useUnplannedProjects.ts` — ta bort `largeRes`-grenen och `large`-mappningen.
- `src/hooks/__tests__/useUnplannedProjects.static.test.ts` — nytt assert: `.from('large_projects')` får inte finnas.
- (ingenting i personalkalender-koden)

## Resultat

- "Swedish game fair" och alla andra stora projekt försvinner från "Nya bokningar"-listan på `/projects`.
- Personalkalendern fortsätter fungera exakt som tidigare.
- Projektkalendern fortsätter vara fristående.