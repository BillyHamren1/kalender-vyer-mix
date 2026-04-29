---
name: Multi-team Staff Assignment
description: Same staff member can be assigned to several teams the same day in personalkalendern; UI never excludes already-assigned staff from the available list, dialog shows "Also on T1, T3" instead of "Move", and removal can be scoped to one team-row
type: feature
---

DB constraint: `staff_assignments_staff_team_date_key` på `(staff_id, team_id, assignment_date)` — gammalt `staff_id+date`-unique är borttaget (migration 20260427021051). Personal kan ligga i hur många team som helst per dag.

UI/logik:
- `useUnifiedStaffOperations.availableStaff` returnerar ALLA aktiva staff (filtrerar inte bort de som redan har en tilldelning).
- `useReliableStaffOperations.getAvailableStaff` likadant — returnerar `assignedTeamIds: string[]` decoration.
- `getStaffForPlanningDate` (SimpleStaffCurtain-källan) räknar status mot ALLA tilldelningar; "assigned_other_team" = personalen är i något annat team än det aktuella, multipla teams listas i `assignedTeamName`.
- `StaffSelectionDialog` använder `assignedTeamIds: string[]`; visar "Also on Team 1, Team 3"; knappen heter "Add" (inte "Move") och disable:as bara om personalen redan finns i exakt det här teamet.
- `SimpleStaffCurtain` knappen heter "Add" oavsett om personen redan är i andra team.
- `TimeGrid.getUnassignedAvailableStaff` filtrerar INTE bort assignade — visar alla.

Drop/remove:
- `handleStaffDrop(staffId, resourceId, targetDate?, fromTeamId?)` — `resourceId` set ⇒ upsert (lägg till); `null` + `fromTeamId` ⇒ ta bort just den team-raden; `null` utan `fromTeamId` ⇒ ta bort ALLA team-rader för dagen (legacy "fully unassign").
- Edge `staff-management.remove_staff_assignment` accepterar valfri `team_id`. `staff-management.get_available_staff` returnerar alla med `assignedTeamIds`.
- `unifiedStaffService.removeStaffAssignment(staffId, date, teamId?)` propagerar.

Optimistic state i `useUnifiedStaffOperations.handleStaffDrop` lägger till/tar bort exakt en (staff,team,date)-rad — den filtrerar inte längre bort hela dagen vid assign.
