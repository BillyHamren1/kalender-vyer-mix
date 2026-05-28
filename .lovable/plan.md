# Projektkalendern: full UX-paritet med personalkalendern (separat backend)

## Utgångsläge (efter förra reverten)
- `LargeEstablishmentPage` renderar `LargeProjectBookingPlannerCalendar`.
- Den använder TimeGrid → `EventWrapper` → **`CustomEvent`**, som redan har `EventHoverCard` + `EventActionPopover`.
- Planner-items kommer in som `CalendarEvent` via `mapPlannerItemsToCalendarEvents`.
- **Problemet:** `EventActionPopover` (delete, ändra tid, lägg till rigg-dag, flytta) skriver via `eventService`/`updateCalendarEvent` → personalkalenderns tabeller. Det får planner-items inte göra.

## Mål
Projektkalenderns block ska:
- Hovra → samma info-card som personalkalendern.
- Klick → action-popover som ser likadan ut, men där varje action skriver till **`large_project_booking_plan_items`** (via `largeProjectPlannerService` / `updateItem` / `deleteItem` / `createItem`).
- "Lägg till rigg-/event-/nedriggdag"-knapp i tomma celler/toolbar → skapar planner-item, inte calendar_event.

## Steg

### 1. Markera planner-events i CalendarEvent
I `LargeProjectPlannerCalendarAdapter.mapPlannerItemsToCalendarEvents` — sätt `extendedProps.kind = 'planner_item'` + `plannerItemId`, `plannerItemType` ('booking'|'task'), `plannerPhase`, `plannerBookingId`, `plannerLargeProjectId`. (Idag finns delar av det redan — säkerställ kompletthet.)

### 2. Routa popover-typ i CustomEvent
I `src/components/Calendar/CustomEvent.tsx`: när `extendedProps.kind === 'planner_item'` → rendera **`PlannerEventActionPopover`** istället för `EventActionPopover`. EventHoverCard återanvänds som-är (läser bara visningsfält).

### 3. Ny `PlannerEventActionPopover`
Ny fil `src/components/project/large-planner/PlannerEventActionPopover.tsx` (~250 rader). Speglar `EventActionPopover` visuellt (samma popover-layout, samma sektioner: Tid, Team/Dag-lista, Ta bort, Öppna detaljer), men:
- **Ändra tid** → `updatePlannerItem(id, { start_time, end_time })`.
- **Flytta till annan dag/team** → `updatePlannerItem(id, { plan_date, assigned_team_id, assigned_staff_id: null })`.
- **Ta bort** → `deletePlannerItem(id)`.
- **Öppna detaljer** → dispatchar samma `lp-planner-item-open` event som idag.
- **Lägg till rigg-/event-/nedriggdag** (om source_booking_phase finns) → öppnar ny `PlannerAddPhaseDayDialog`.
- Hämtar "befintliga fas-dagar" från `items` i samma projekt (filter på `booking_id` + `source_booking_phase`), inte från `useEventBookingDays`.

### 4. Ny `PlannerAddPhaseDayDialog`
Ny fil `src/components/project/large-planner/PlannerAddPhaseDayDialog.tsx` (~200 rader). Speglar `AddRiggDayDialog` (månadsväljare, multiselect på datum, tid-fält), men sparvägen:
- Skapar ett `large_project_booking_plan_items`-item per vald dag med `source_booking_phase = phase`, `source = 'booking'`, ärver tider från bokningens fas, ärver `assigned_team_id` från det klickade eventet om sådan finns.
- **Skriver aldrig** till `bookings` eller `calendar_events`.

### 5. "Lägg till dag"-knapp i tomma TimeGrid-celler
I projektkalenderns view: lägg en + -knapp i tomma celler (som personalkalenderns `AddDayButton`) som öppnar `PlannerAddPhaseDayDialog` förvalt på det datumet/teamet. Använder befintlig TimeGrid `plannerMode`-prop — kräver en ny callback-prop `onAddDay(date, teamId)` som TimeGrid kan exponera via en floating + i tomma kolumner.

### 6. Tester (vitest)
- `plannerPopoverIsolation.test.tsx`: rendera `CustomEvent` med planner-event → verifiera att `PlannerEventActionPopover` används (inte `EventActionPopover`), och att inga `supabase.from('calendar_events'|'bookings')`-anrop sker när man trycker delete/ändra tid/flytta dag.
- `plannerAddPhaseDay.test.ts`: kalla dialogens onSave → assertera att `large_project_booking_plan_items` får N rader och `calendar_events`/`bookings` INTE rörs.
- Behåll befintlig `projectCalendarSeparation.test.ts` grön.

### 7. Verifiering
- `bash scripts/test-time-reporting.sh` (vid behov) + `lovable-exec test` på de nya specerna.
- Manuell rök: öppna `/large-project/:id/establishment`, hovra block → info; klicka block → popover; tryck "Lägg till nedriggdag", välj 3 datum, spara → 3 nya planner-block dyker upp utan att personalkalendern påverkas.

## Filer (sammanfattning)
- **Nya:**
  - `src/components/project/large-planner/PlannerEventActionPopover.tsx`
  - `src/components/project/large-planner/PlannerAddPhaseDayDialog.tsx`
  - `src/components/project/large-planner/__tests__/plannerPopoverIsolation.test.tsx`
  - `src/components/project/large-planner/__tests__/plannerAddPhaseDay.test.ts`
- **Ändras:**
  - `src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts` — kompletta planner-flaggor i `extendedProps`.
  - `src/components/Calendar/CustomEvent.tsx` — välj popover baserat på `extendedProps.kind`.
  - `src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx` — visa + i tomma celler via TimeGrid-callback.
  - `src/components/Calendar/TimeGrid.tsx` — liten `onAddDay?(date, resourceId)`-prop som visar en + i tomma cellytor när `plannerMode` är på.

## Vad jag INTE rör
- `calendar_events`, `bookings.*`, `staff_assignments`, `large_project_team_assignments`.
- `eventService`, `bookingPhaseDaysService`, personalkalenderns popover/dialog.
- Time Engine, BSA, geofence.
