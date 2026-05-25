# Large Project Calendar — Separationsaudit

Datum: 2026-05-25
Syfte: Tydlig isolation mellan **Personalkalendern** (planerar projekt som helhet,
ägar personalfördelning) och **Kalendern inne i ett stort projekt** (planerar
bokningar/tasks INUTI projektet — får INTE skriva till personalkalenderns
tabeller).

---

## A) Personalkalendern (oförändrad — enda skrivare)

- Komponent: `CustomCalendarPage` + `CustomCalendar`
- Skriver till:
  - `calendar_events` (drag/resize/move via `useEventDragDrop` → `updateCalendarEvent`)
  - `staff_assignments` (drop personal via `useUnifiedStaffOperations.handleStaffDrop`
    → `staffAssignmentCore.assignStaffToTeamCore` / `removeStaffAssignmentCore`)
  - `booking_staff_assignments` (sido-effekt via `warehouseAssignmentsSync` +
    `recompute_booking_staff_for_day` RPC)
  - `large_project_team_assignments` (drag av syskonbokning →
    `largeProjectPlannerService.setLargeProjectDayTeam` / `moveLargeProjectDay`)

Detta beteende får INTE ändras.

## B) Kalendern inne i stora projekt (måste isoleras)

### Nuvarande implementation
`src/components/project/ProjectCalendarView.tsx` är en TUNN wrapper som
återanvänder personalkalenderns rigg rakt av. Den ärver därmed ALLA skrivvägar
ovan, vilket bryter mot kravet att intern bokningsplanering inte ska skriva
till personalkalenderns tabeller.

### Konkreta läckage (rad-referenser i ProjectCalendarView.tsx)

| Rad | Symbol | Skrivväg som läcker in |
|-----|--------|------------------------|
| 24, 107 | `useUnifiedStaffOperations(...)` | `staff_assignments` + `booking_staff_assignments` + `warehouse_assignments` |
| 215 | `onStaffDrop={staffOps.handleStaffDrop}` | Drop personal i en projektdag → `staff_assignments` |
| 218 | `weeklyStaffOperations={staffOps}` | Personal-dialoger i CustomCalendar använder samma writes |
| 22, 79–85 | `useRealTimeCalendarEvents()` + `setEvents`/`refreshEvents` | Källa för `useEventDragDrop` inuti CustomCalendar → `calendar_events.update` + `large_project_team_assignments` |
| 206–226 | `<CustomCalendar ... />` | Drag/resize/+-knapp ärvs oförändrade och skriver till `calendar_events` |

Hooks/services som är förbjudna att kalla från den nya isolerade
projekt-bokningsplaneraren:

- `useUnifiedStaffOperations` (alla write-paths)
- `staffAssignmentCore.assignStaffToTeamCore` / `removeStaffAssignmentCore`
- `services/calendarService.updateCalendarEvent` / `addCalendarEvent` / `deleteCalendarEvent`
- `services/eventService.*` write-funktioner
- `services/largeProjectPlannerService.moveLargeProjectDay` / `setLargeProjectDayTeam`
- `services/warehouseAssignmentsSync.*`
- `useEventDragDrop` (default-handler, eftersom den anropar updateCalendarEvent)

## C) Plan för isolerad ersättare

Ny komponent (stub finns redan):
`src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx`

Designprinciper:
1. **Read-only mot personalkalenderns tabeller.** Får läsa `staff_assignments`
   för att visa vilka som är planerade på dagen, men ALDRIG skriva.
2. **Egen intern plan-store.** Bokningar/tasks inuti projektet skrivs till en
   separat tabell (förslag: `large_project_internal_plan` — införs i senare
   steg, ingen migration i detta steg).
3. **UI-återanvändning OK.** Återanvänd CustomCalendar-look (dagkort,
   tidsgrid, badges) genom presentational subkomponenter, men koppla ALDRIG
   in `onStaffDrop`, `weeklyStaffOperations`, `setEvents` eller drag-handlers
   som muterar `calendar_events`.
4. **Switch-punkt.** `LargeEstablishmentPage` (rad 209–210) renderar idag
   `<ProjectCalendarView .../>`. När den nya komponenten är klar byts den
   raden ut — `ProjectCalendarView` ligger kvar för bakåtkompatibilitet.

## D) Detta steg

- [x] Audit-dokument (denna fil)
- [x] Varningskommentarer i `ProjectCalendarView.tsx` på exakta läckagepunkter
- [x] Tom stub-fil för `LargeProjectBookingPlannerCalendar.tsx`
- [ ] (Senare) Egen tabell + write-paths
- [ ] (Senare) Byt ut renderingen i `LargeEstablishmentPage`
