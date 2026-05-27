## Mål

Projektkalendern (stora projekt → "Kalender & planering") ska visa **team som kolumner per dag**, precis som personalkalendern, med teamets bemannade personer som badges under team-headern. Tasks fördelas till team (inte direkt till person) genom drag-and-drop mellan team-kolumner.

Datalager-separationen är ofrånkomlig:
- Läser (read-only) `calendar_events` + `staff_assignments` för att veta **vilka team** projektet äger per dag och **vilka personer** som ingår i varje team den dagen.
- Skriver ENDAST till `large_project_booking_plan_items` (fältet `assigned_team_id`, och valfritt `assigned_staff_id` inom teamet).
- Skriver ALDRIG till `calendar_events`, `staff_assignments`, `booking_staff_assignments`, `large_project_team_assignments` eller `bookings`. Bemanning av team görs fortfarande bara i personalkalendern.

## Vad som ändras

1. **Service-lagret** (`largeProjectPlannerService.ts`)
   - Lägg till `teamsByDay: Record<date, { teamId, teamTitle, staff: { id, name, color }[] }[]>` i `LargeProjectPlannerContext`. Byggs av samma `calendar_events` × `staff_assignments`-data som redan hämtas (ingen extra query). `teamTitle` = teamets ordningsnummer (Team 1..N) baserat på personalkalenderns ordning.
   - `staffByDay` behålls (används av item-formulär för "valfri person inom team").

2. **Hook** (`useLargeProjectPlannerItems.ts`)
   - Exponera `teamsByDay` + ny `isTeamAllowedForDate(teamId, date)`.
   - `itemsWithAssignmentValidity` validerar nu `assigned_team_id` mot dagens team (inte bara staff). En task vars team inte är bemannat den dagen → flaggas `assignmentInvalid` och routas till "Ej tilldelat".

3. **Adapter** (`LargeProjectPlannerCalendarAdapter.ts`)
   - `buildPlannerResourcesForDay(teamsForDay)` → returnerar team-kolumner (`id = teamId`, `title = "Team N"`) + sist en fast `UNASSIGNED_RESOURCE_ID`-kolumn ("Ej tilldelat").
   - `mapPlannerItemsToCalendarEvents`: `resourceId = item.assigned_team_id` om teamet finns på dagen, annars `UNASSIGNED_RESOURCE_ID`. `assignedStaffId` följer med som metadata.

4. **TimeGrid `plannerMode`** (`TimeGrid.tsx`)
   - Återställ rad 3 (assigned-staff-rad) i plannerMode men i **read-only-läge**: visa teamets badges via en ny prop `getStaffForResource(resourceId, date)` levererad från projektplanneraren. Inget `+`, inga remove-knappar, ingen `TeamStaffPickerPopover`. Drag-and-drop på personer är avstängd. Detta gör att UI:t matchar personalkalendern visuellt utan att kunna skriva till `staff_assignments`.

5. **View** (`LargeProjectPlannerCalendarView.tsx`)
   - Använd `teamsByDay[date]` för resurser + en `getStaffForResource`-helper som returnerar teamets personer för dagen.
   - Drop-handler validerar `targetResourceId` mot dagens team (eller UNASSIGNED) och skriver:
     ```
     updateItem(id, {
       plan_date: targetDateStr,
       assigned_team_id: targetResourceId === UNASSIGNED ? null : targetResourceId,
       assigned_staff_id: null,   // töms vid team-byte
       status: targetResourceId === UNASSIGNED ? undefined : 'planned',
     })
     ```
   - Vid drop på obemannat team → toast "Team N är inte bemannat på projektet den här dagen. Lägg till personal via personalkalendern först."

6. **Item-formulär** (`ManualProjectTaskDialog.tsx`, `LargeProjectPlannerQuickEditDialog.tsx`, `SplitBookingIntoTasksDialog.tsx`)
   - Primär tilldelning byts från "Person" → **"Team"** (lista över dagens team).
   - Sekundär (valfri) "Specifik person i teamet" (filtrerad till valt teams medlemmar).
   - Validering: team måste finnas på dagen; person måste tillhöra valt team den dagen.

7. **Sidebar** (`LargeProjectPlannerSidebar.tsx`)
   - "Personal"-sektionen kompletteras/ersätts med "Team i projektet" + medlemmar (read-only).

8. **CSS** (`ProjectCalendarView.css` / `LargeProjectPlannerCalendarView.css`)
   - Återanvänd personalkalenderns team-header-styling (lila pill, kompakta StaffItem-badges). Inga nya färger.

## Strikt separation (kontrakt-test)

Uppdatera `__tests__/projectCalendarSeparation.test.ts` + `projectCalendarUiSeparation.test.ts`:
- Ny test: drop på team-kolumn anropar bara `updateLargeProjectPlannerItem` (assigned_team_id, assigned_staff_id=null) — aldrig `staff_assignments`/`calendar_events`/`large_project_team_assignments`.
- Ny test: drop på UNASSIGNED → `assigned_team_id=null, assigned_staff_id=null`.
- Befintliga "inga imports från useUnifiedStaffOperations / useRealTimeCalendarEvents"-asserts behålls.
- Nytt: `buildStaffByDay` → `buildTeamsByDay` pure-test (idempotent, sorterar team i nummerordning, taggar saknade team korrekt).

## Visuellt slutresultat

- Varje dag har samma headerstruktur som personalkalendern: dagtitel → team-kolumnerna (Team 1, Team 2, …) → bemannade personer som badges under varje team → tids-grid.
- Tasks i kalendern ligger i sin teams kolumn. Tasks utan team eller med obemannat team ligger i "Ej tilldelat".
- Drag mellan team byter `assigned_team_id` på `large_project_booking_plan_items`. Ingenting i `calendar_events`/`staff_assignments` rörs.

## Filer som rörs (estimerat)

- `src/components/project/large-planner/largeProjectPlannerService.ts`
- `src/components/project/large-planner/useLargeProjectPlannerItems.ts`
- `src/components/project/large-planner/largeProjectPlannerTypes.ts`
- `src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts`
- `src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx`
- `src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx` (props-genomdragning)
- `src/components/project/large-planner/ManualProjectTaskDialog.tsx`
- `src/components/project/large-planner/LargeProjectPlannerQuickEditDialog.tsx`
- `src/components/project/large-planner/SplitBookingIntoTasksDialog.tsx`
- `src/components/project/large-planner/LargeProjectPlannerSidebar.tsx`
- `src/components/Calendar/TimeGrid.tsx` (read-only badges-läge i plannerMode)
- `src/components/project/large-planner/__tests__/*` (uppdaterade + ny `teamsByDay`-test)
