
## Problemet i klartext

Personalkalendern har **5 parallella vägar** för samma operation (tilldela/ta bort personal från team) — och **3 olika hooks** med funktionen `handleStaffDrop`. Olika delar av UI:t använder olika vägar, så de skriver inkonsekvent, har olika optimistic state, olika cache-invalidering, och olika regler för "ta bort hela dagen vs en team-rad". Det är därför jobb "försvinner" eller "flyttas" — beroende på var du klickar går skrivningen via olika logik.

### Dagens röra (mätt nu)

**Hooks som gör samma sak:**
- `useUnifiedStaffOperations.handleStaffDrop` (302 rader, har optimistic state)
- `useReliableStaffOperations.handleStaffDrop` (239 rader)
- `useDateAwareStaffOperations.handleStaffDrop` (47 rader)
- `useStaffOperations.handleStaffDrop`
- `usePlanningDashboard.handleStaffDrop` + `handleStaffDropToBooking`
- `useStaffBookingConnection` (egen variant via unifiedStaffService)

**Services som gör samma sak:**
- `services/staffService.ts` → `assignStaffToTeam` / `removeStaffAssignment` (366 rader)
- `services/unifiedStaffService.ts` → samma funktioner (248 rader)
- `services/enhancedStaffService.ts` → wrappar unifiedStaffService (258 rader)
- `lib/staffCalendar/staffAssignmentService.ts` (531 rader)
- `lib/staffCalendar/unifiedStaffService.ts`
- `lib/staffCalendar/staffService.ts`
- `lib/staffCalendar/enhancedStaffService.ts`

**För stora filer (>200 rader, mot vår regel):**
- `TimeGrid.tsx` — **722 rader**
- `staffAssignmentService.ts` — **531 rader**
- `MoveEventDateDialog.tsx` — 510 rader
- `staffCalendarService.ts` — 490 rader
- `staffService.ts` — 366 rader
- `QuickTimeEditPopover.tsx` — 345 rader
- `IndividualStaffCalendar.tsx` — 328 rader
- `StaffBookingsList.tsx` — 310 rader
- `useUnifiedStaffOperations.tsx` — 302 rader
- `StaffSelectionDialog.tsx` — 301 rader

## Lösning — i tre etapper

### Etapp 1: ETT canonical write-path (fixar "jobb flyttas/försvinner")

Gör `useUnifiedStaffOperations` till **enda** källan för assign/remove och `unifiedStaffService` till **enda** servicelagret. Allt annat blir tunna re-exports som loggar deprecation och delegerar.

```text
UI (TimeGrid, SimpleStaffCurtain, StaffAssignmentRow, dashboards)
        │
        ▼
useUnifiedStaffOperations  ◄── enda hook
        │
        ▼
unifiedStaffService        ◄── enda service (edge: staff-management)
        │
        ▼
staff_assignments (DB)     ◄── unique (staff,team,date)
        │
        ▼
realtime invalidation → React Query
```

Konkret:
- `useReliableStaffOperations`, `useDateAwareStaffOperations`, `useStaffOperations` → ersätts av re-exports från `useUnifiedStaffOperations` (samma signatur, ingen call-site behöver ändras initialt).
- `services/staffService.ts` `assignStaffToTeam`/`removeStaffAssignment` → re-export från `unifiedStaffService`.
- `services/enhancedStaffService.ts` → samma sak, eller raderas där det går.
- `lib/staffCalendar/*` dubbletter → konvergerar till `services/unifiedStaffService.ts`.
- En enda regel för remove: `(staffId, date, teamId?)` — `teamId` satt = ta bort den raden, undefined = ta bort alla för dagen. Inga andra regler någonstans.
- En enda optimistic-update strategi (den i `useUnifiedStaffOperations`). Removas från `useLocalStaffState` och dashboard-hooken.

### Etapp 2: Splittra TimeGrid och staffAssignmentService

`TimeGrid.tsx` (722 rader) splittas:
- `TimeGrid.tsx` — bara grid + layout (~150 rader)
- `TimeGridDnD.tsx` — drag/drop-logik
- `TimeGridRow.tsx` — en rad (team)
- `TimeGridCell.tsx` — en cell (dag)
- `useTimeGridStaff.ts` — hook som filtrerar ut available + assigned

`staffAssignmentService.ts` (531 rader) splittas:
- `assignmentQueries.ts` — read
- `assignmentMutations.ts` — write
- `assignmentDerivations.ts` — sammansättning av status/availability
- `assignmentRealtime.ts` — subscription-hjälpare

`MoveEventDateDialog.tsx`, `staffCalendarService.ts`, `QuickTimeEditPopover.tsx`, `IndividualStaffCalendar.tsx`, `StaffBookingsList.tsx`, `StaffSelectionDialog.tsx` splittas i sub-komponenter/hooks där det är naturligt — utan att skapa mikrofiler.

### Etapp 3: Kontraktstest som låser regeln

Lägg `src/test/staffCalendar.contract.test.ts`:
- Endast `useUnifiedStaffOperations` får anropa `unifiedStaffService.assignStaffToTeam/removeStaffAssignment` direkt (regex-grep i src).
- Endast `unifiedStaffService` får göra `.from('staff_assignments')` mutations.
- Inga nya filer i `src/components/Calendar/` eller `src/hooks/` över 200 rader, services över 250.

Säkerhetsnät så att vi inte halkar tillbaka.

## Vad jag INTE rör

- Datamodellen (`staff_assignments`-tabellen, RLS, unique index — redan korrekt enligt memory `multi-team-staff-assignment-v1`).
- Edge function `staff-management`.
- `deriveStaffEvents.ts` (391 rader) — central, men välstrukturerad och täckt av tester. Lämnas.
- Bookingsync/import-loopen (separat ärende vi redan har).

## Förväntad effekt

- Inga fler "jobb flyttar sig" — bara en skrivare betyder bara en sanning.
- Filer ≤ memoriregeln (~200/250 rader).
- Lättare att felsöka: en stack trace pekar alltid till samma fil.
- Kontraktstest hindrar ny dubblering.

## Risker

- Många call-sites pekar på de gamla hookarna. Re-exports gör att vi kan migrera utan big-bang, men jag måste verifiera att signaturerna är 1:1. Det gör jag innan jag river något.
- Optimistic state-skillnader kan ge en kort period där en knapp beter sig nytt. Jag verifierar drag-and-drop i TimeGrid + SimpleStaffCurtain + dashboard manuellt efter etapp 1.

## Ordning

1. Etapp 1 (skrivvägs-konsolidering) — säkraste vinsten, fixar buggen.
2. Verifiera i preview att ingen flow är trasig.
3. Etapp 2 (splittring).
4. Etapp 3 (kontraktstest).

Säg till om du vill att jag kör hela paketet eller bara Etapp 1 först.
