## Problem

Personalkalendern tillåter inte att samma person sitter i flera team samma dag — fast databasen redan har stöd för det (unique constraint = `staff_id, team_id, assignment_date`). Begränsningen sitter i klient + edge-funktion som behandlar varje person som "ett team per dag" och flyttar/tar bort vid ny tilldelning istället för att lägga till.

## Vad som behöver fixas

### 1. Edge-funktion `staff-management`
- `assign_staff_to_team`: redan upsert med rätt onConflict — OK.
- `remove_staff_assignment`: tar idag bort ALLA team-rader för dagen. Lägg till valfri `team_id`-parameter; när satt ⇒ ta bara bort den raden. (Standard-beteendet behålls för bakåtkompatibilitet om `team_id` inte skickas, men vi börjar alltid skicka det från UI:t.)
- `get_available_staff`: filtrerar idag bort all assignad personal. Tas bort/luckras upp så att personal alltid returneras med info om vilka team de redan sitter i (`assignedTeamIds: string[]`). Inte längre exclude.

### 2. Service-lagret
- `unifiedStaffService.removeStaffAssignment(staffId, date, teamId?)` — lägg till `teamId`-parameter och vidarebefordra till edge.
- `staffService.removeStaffAssignment` har redan stöd för valfri `teamId` — OK.

### 3. Reliable / Local staff state
- `useReliableStaffOperations.handleStaffDrop`: när man "tar bort" från ett specifikt team ska den ta bort just den raden (skicka `teamId`), inte alla. Lägg till parameter `fromTeamId?` på handlern.
- `useReliableStaffOperations.getAvailableStaff`: returnera ALL personal (inte bara icke-assignad) — markera istället vilka team var och en redan sitter i.
- `useReliableStaffOperations.assignments`/`compatibleAssignments` är redan en array per (staff,team) — fungerar redan med multi-team.

### 4. `useAvailableStaffWeek`
- Tas inte bort — istället returnerar `getAvailableStaffForDay` ALL aktiv personal med array `assignedTeamIds: string[]` istället för enskilt `assignedTeamId`. Filterlogiken som idag begränsar till "lediga" släpps.

### 5. `StaffSelectionDialog`
- `assignedStaffMap` ändras från `Map<staffId, teamId>` till `Map<staffId, Set<teamId>>`.
- `isAssignedToCurrentTeam` = setet innehåller `resourceId`. Då döljs/disable:as add-knappen för det teamet.
- `isAssignedToOtherTeam` ⇒ visas som "Also on Team X" (INTE "will be moved"). Add-knappen är aktiv och lägger till — den flyttar inte.
- Sortering: ej assignad till detta team först, redan assignad till detta team sist (greyed out).

### 6. `StaffSelectionDialog` rad-borttag (om du tar bort från listan inne i ett team)
- Anrop använder `removeStaffAssignment(staffId, date, resourceId)` — bara den teamraden tas bort, övriga team kvar.

### 7. `useStaffOperations.handleStaffDrop` & `StaffAssignmentRow.handleStaffDrop`
- Lägg till `fromTeamId?: string`. Om `resourceId === null` och `fromTeamId` finns ⇒ skicka `teamId` så bara det teamet rensas. Om båda saknas (full unassign från sökruta etc.) ⇒ rensa allt (gammalt beteende).

### 8. UI: `TimeGrid` / `AvailableStaffDisplay` / `SimpleStaffCurtain`
- Visa personal som "alltid synlig" i tillgänglighetslistan, men chip eller liten badge `T1, T3` om de redan är i några team.
- Drag/drop-pek på ett team ⇒ ny rad (lägg till), ersätter inte.
- "Ta bort"-knappen vid en chip i ett team-fält ⇒ använder den nya `fromTeamId`-vägen.

### 9. Tester
- Lägg till test för `removeStaffAssignment` med `teamId` (en rad), utan `teamId` (alla).
- Lägg till test för `StaffSelectionDialog`-status med två teams samma dag.

## Ej i scope
- Personalkalenderns visuella layout/team-rader (de finns redan per team, så multi-team renderas automatiskt när raderna i DB finns).
- Booking-staff-assignments (`booking_staff_assignments`) — autoassign till bokningar fortsätter som idag per team.

## Vill du att jag…
1. ändrar "remove utan teamId" så det BARA tar bort en team-rad (kräver att alla call-sites pekar ut teamId — säkrare), eller
2. behåller dagens "remove utan teamId = ta bort allt" som fallback och lägger till valfri teamId (mindre risk för regression)?

Default i planen: **alternativ 2** (fallback bevaras, all UI uppdateras till att alltid skicka teamId).