## Mål

Tre tydliga kalendrar:

1. **Personalkalendern** — `CustomCalendar` + `useRealTimeCalendarEvents` + `useUnifiedStaffOperations`. Visar rig/rigDown (+ todo + Lager). **Aldrig** event-fasen. **Aldrig** `large_project_booking_plan_items`.
2. **Stora projektets interna projektkalender** — `LargeProjectBookingPlannerCalendar` → `LargeProjectPlannerCalendarView` → `LargeProjectPlannerCalendarAdapter`. Läser/skriver endast `large_project_booking_plan_items`. **Aldrig** event-fasen.
3. **Legacy `ProjectCalendarView`** — låst till vanliga single-booking-projekt (`EstablishmentPage`). Får aldrig anropas för stora projekt.

Audit visar att huvudstrukturen redan stämmer — det här är ett härdnings-PR.

## Ändringar

### 1. `src/services/eventService.ts` (personalkalendern, läsning)

Bekräfta `.neq('event_type', 'event')` och lägg policy-kommentar:

```
// Event-fasen är medvetet exkluderad. Personalkalendern visar bara
// bemanningsbara dagar (rig + rigDown + todo). Eventdagen finns kvar
// i databasen men renderas inte här. Se constraint
// staff-calendar-no-event-day-v1.
```

Dev-diagnostik bakom `import.meta.env.DEV`:
- total rader hämtade
- count per `event_type`
- count `event_type='event'` *exkluderade* via .neq (≈0 förväntat, sanity-check)
- count rig / rigDown / todo skickade vidare

### 2. `src/services/plannerCalendarDerivation.ts`

Bekräfta `if (phase === 'event') continue;` och förstärk kommentar:

```
// Event phase is intentionally hidden in staff planning calendars.
// Event days are not staffed/planned here. Constraint:
// staff-calendar-no-event-day-v1.
```

Lägg dev-summary i slutet av `buildPlannerCalendarEvents`:
- realEvents in
- phase rig / phase event (hidden) / phase rigDown
- rader utan resource_id
- final events emitted

(Befintliga `eventDaysHidden`/`largeProjectMissingAssignment`-counters återanvänds.)

### 3. `src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts`

- Lägg tydlig kommentar:
  ```
  // Event booking phase is intentionally hidden from the internal
  // large project planner calendar. Same rule as personalkalendern.
  ```
- Ändra default-routing för items utan `assigned_team_id`:
  - Inför `UNASSIGNED_RESOURCE_ID = 'unassigned'`.
  - `buildPlannerResourcesForDay` returnerar `[unassigned, team-1..team-5]`.
  - `mapPlannerItemsToCalendarEvents`: `resourceId = it.assigned_team_id ?? UNASSIGNED_RESOURCE_ID`.
  - Ta bort `DEFAULT_TEAM_ID = 'team-1'`-fallbacken.
- Dev-counters: planner-items in, booking-items rig/event(filtered)/rigDown, todos filtrerade, items utan team, final events.

Drop/move-skrivvägen i `LargeProjectPlannerCalendarView`/service ska redan sätta `assigned_team_id = null` när man drar till `unassigned`. Verifiera och justera vid behov.

### 4. `src/components/project/large-planner/useLargeProjectPlannerCalendarEvents.ts`

Inga produktionsimports → **ta bort filen helt**. Befintliga tester verifierar redan att den inte importeras från `LargeEstablishmentPage`.

### 5. `src/components/project/ProjectCalendarView.tsx`

- Topp-kommentar:
  ```
  // LEGACY: Single-booking project calendar only.
  // Do NOT use for large project internal planning — use
  // LargeProjectBookingPlannerCalendar instead.
  ```
- Lägg dev-guard: om `isLargeProject === true` eller `largeProjectId` är satt → `console.warn` + tidig return (eller stor varningsbanner i DEV). Detta hindrar framtida felaktig återanvändning.

### 6. `src/services/largeProjectPlannerService.ts` — `buildProjectDays`

Bygg projektdagar från **unionen** av:
- projektets `start_date[]` (rig)
- projektets `end_date[]` (rigDown)
- alla `large_project_booking_plan_items.plan_date` där `source_booking_phase !== 'event'`

För dagar som kommer enbart från planner-items utanför projektets datumarray: emit dagen, men med metadata `warning: 'planner_item_outside_project_dates'` så UI kan visa varning istället för att tyst dölja items.

### 7. Tester (utöka befintliga)

Lägg till i `src/components/project/large-planner/__tests__/` (källfilsbaserade, samma stil som befintliga separation-tester):

- `LargeProjectBookingPlannerCalendar` importerar inte `useRealTimeCalendarEvents` / `useUnifiedStaffOperations`.
- `LargeProjectPlannerCalendarView` importerar inte `CustomCalendar` / `ProjectCalendarView` / `useRealTimeCalendarEvents` / `useUnifiedStaffOperations`.
- `useLargeProjectPlannerCalendarEvents.ts`-filen existerar inte.
- Adapter filtrerar bort `source_booking_phase === 'event'` (befintligt test utökas).
- Adapter: items utan `assigned_team_id` → `unassigned`, inte `team-1`.
- Adapter: `booking_product_id`-items renderas inte.
- `plannerCalendarDerivation` filtrerar `phase === 'event'` (funktionellt test med fixturer).
- Personalkalendervägen läser inte `large_project_booking_plan_items` (källsökning i `eventService.ts` + `useRealTimeCalendarEvents.tsx`).
- `ProjectCalendarView` har dev-guard mot `isLargeProject`.

### 8. Validering (efter implementation)

- Kör `lovable-exec test` för alla nya + befintliga separation-tester.
- Verifiera i preview att personalkalendern visar rig + rigDown + Lager men inga event-dagar.
- Verifiera att Almedalen (stort projekt) → Kalender & planering visar `LargeProjectBookingPlannerCalendar` med rig/rigDown men ingen event-dag.
- Verifiera att drag av planner-item till `unassigned`-kolumnen sätter `assigned_team_id = null` (och inte rör calendar_events).

## Tekniska detaljer

**Ingen DB-migration** — alla regler är frontend-/derivations-policy.

**Inga skrivningar mot skyddade tabeller från intern projektkalender:** `LargeProjectBookingPlannerCalendar`/service skriver endast `large_project_booking_plan_items`. Detta är redan låst av `projectCalendarSeparation.test.ts`; vi utökar bara skyddet.

**Filer som skapas/ändras:**

```text
ändras:
  src/services/eventService.ts                                      (kommentar + dev-counters)
  src/services/plannerCalendarDerivation.ts                         (kommentar + dev-summary)
  src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts  (unassigned + counters + kommentar)
  src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx    (unassigned-kolumn + drag→null)
  src/components/project/large-planner/largeProjectPlannerService.ts          (buildProjectDays union + warning)
  src/components/project/ProjectCalendarView.tsx                    (LEGACY-kommentar + dev-guard)
  src/pages/project/EstablishmentPage.tsx                           (kommentar: legacy single-booking only)

tas bort:
  src/components/project/large-planner/useLargeProjectPlannerCalendarEvents.ts

skapas:
  src/components/project/large-planner/__tests__/calendarArchitectureHardening.test.ts
  src/services/__tests__/plannerCalendarDerivation.eventPhaseHidden.test.ts
```

## Slutsumma (skrivs efter implementation)

Efter ändringen kommer svaret innehålla exakt:
- vilka kalenderkomponenter som finns kvar
- vilken kalender personalkalendern använder
- vilken kalender stora projektets interna planering använder
- om `ProjectCalendarView` finns kvar + var
- om något togs bort + vilka imports som rensades
- bekräftelser per regel i Fix 10/11.