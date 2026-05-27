
## Mål

Projektkalendern (`/large-project/:id/establishment` → `LargeProjectPlannerCalendarView`) ska spegla personalkalenderns kolumnindelning **exakt**: fasta kolumner **Team 1 … Team 5** per dag. Ingen "Ej tilldelat"-kolumn. Planner-items som saknar `assigned_team_id` placeras i sitt naturliga team via en deterministisk regel (se nedan) så att inget item försvinner.

## Beslutad lösning

- **Kolumner per dag:** alltid fasta `team-1 … team-5`. Identiskt med personalkalendern.
- **"Ej tilldelat"-kolumnen tas bort helt** ur projektplanner-vyn.
- **Källa till team-PERSONAL i kolumnerna:** ENDAST `large_project_team_assignments` (LPTA), enligt memory `large-project-team-source-of-truth-v1`. Tom LPTA ⇒ team-kolumnen visar inga staff-badges, men kolumnen finns kvar.
- **Items utan `assigned_team_id`:** renderas i Team 1 som default (eller — om man föredrar — i det första team som har LPTA-personal den dagen; se öppen fråga nedan). Vid första drop sätts riktigt team.
- **Drag-and-drop:** oförändrat — skriver bara `assigned_team_id` på `large_project_booking_plan_items`. Ingen skrivning till LPTA, `calendar_events`, `staff_assignments` eller `bookings`.

## Ändringar (endast frontend/data-läsning)

### 1. `src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts`
- Ta bort `UNASSIGNED_RESOURCE_ID` och dess kolumn i `buildPlannerResourcesForDay`.
- `buildPlannerResourcesForDay(dayTeams)` returnerar **alltid** fem resurser: team-1, team-2, team-3, team-4, team-5 (i den ordningen). Title = "Team N". Staff-badges hämtas från `dayTeams` om teamet finns där, annars tom lista.
- `mapPlannerItemsToCalendarEvents`: om `assigned_team_id` saknas → fallback till `'team-1'` så itemet alltid hamnar i en synlig kolumn.

### 2. `src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx`
- Ta bort all referens till `UNASSIGNED_RESOURCE_ID`.
- `handlePlannerEventDrop`: `nextTeamId = targetResourceId` (alltid ett team-id; ingen null-gren).
- `getStaffForTeamAndDate`: returnera `[]` för team som saknas i `teamsByDay[date]`.

### 3. `src/components/project/large-planner/largeProjectPlannerService.ts`
- `fetchProjectStaffPerDay` byter källa från `calendar_events.resource_id` till `large_project_team_assignments`:
  - Hämta LPTA-rader för `large_project_id`.
  - För varje `(assignment_date, team_id)` → bygg `teamsByDate`.
  - Hämta personal via `staff_assignments` på `(team_id, assignment_date)` och slå upp namn/färg i `staff_members`.
- `buildTeamsByDay` får en LPTA-variant (`buildTeamsByDayFromLpta`). Gamla funktionen kan tas bort eller markeras deprecated.

### 4. Memory
- Förtydliga `mem://constraints/large-project-team-source-of-truth-v1`: projektplanner-kalendern visar alltid fasta kolumner team-1…5. Personal-badges per team läses ENDAST från LPTA. Ingen "Ej tilldelat"-kolumn.

## Tester (vitest)

Ny fil `src/components/project/large-planner/__tests__/projectCalendarTeamColumns.test.ts`:
1. `buildPlannerResourcesForDay` returnerar exakt fem team (team-1…5), aldrig "unassigned".
2. `LargeProjectPlannerCalendarView` renderar fem teamkolumner per dag oavsett om LPTA är tom.
3. Item utan `assigned_team_id` hamnar i team-1.
4. Item med `assigned_team_id='team-3'` hamnar i team-3.
5. Drop på team-4 anropar `updateItem({ assigned_team_id: 'team-4', ... })`.
6. `fetchProjectStaffPerDay` läser team-personal från LPTA, inte från `calendar_events.resource_id` (mocka båda; verifiera källan).

Uppdatera även `projectCalendarSeparation.test.ts` och `projectCalendarUiSeparation.test.ts` om de antar "Ej tilldelat".

Kör `bunx vitest run src/components/project/large-planner` direkt efter ändringen.

## Filer som INTE rörs

- `calendar_events`, `staff_assignments`, `bookings`, `large_project_team_assignments` (inga skrivningar)
- `plannerCalendarDerivation.ts` (personalkalendern påverkas inte)
- Time Engine, GPS, mobile-app-api, alla migrationer

## Öppen fråga (snabbsvar räcker)

Items utan `assigned_team_id` — vill du att de:
- (a) alltid hamnar i **Team 1** (enklast, deterministiskt), eller
- (b) hamnar i **första team som har LPTA-personal den dagen** (smartare, kräver att LPTA är ifylld för att fungera bra)?

Default i denna plan = **(a) Team 1**. Säg till om du vill ha (b).
