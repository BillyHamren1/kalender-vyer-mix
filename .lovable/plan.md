
# Steg 4: Regression Test Layer ✅ Klart

## Nya testfiler:
- `src/utils/__tests__/dateUtils.test.ts` — 22 tester
- `src/hooks/__tests__/useMemoizedEvents.test.ts` — 12 tester

## Utökade testfiler:
- `plannerStore.test.tsx` — +4 tester (rapid view switching)
- `useEventEditController.test.ts` — +4 tester (stress/edge cases)
- `eventUtils.test.ts` — +5 tester (edge cases)

## Totalt: 159 tester i 7 filer, alla gröna.

---

# Steg 1: SAFE NOW ✅ Klart

- ✅ `convertToISO8601` centraliserad till `src/utils/dateUtils.ts`
- ✅ Debug-`console.log` borttagna från `CustomEvent.tsx` och `EventHoverCard.tsx`
- ✅ `openDelay={300}` på `EventHoverCard`

---

# Steg 2: SAFE NEXT ✅ Klart

## 2a. Tidszons-konsistens ✅ Klart
**Åtgärd**: Lagt till `extractUTCTime`, `extractUTCDate`, `buildUTCDateTime` i `dateUtils.ts`. `EditEventTimeDialog` använder nu samma UTC-approach som `QuickTimeEditPopover`.
**Filer**: `src/utils/dateUtils.ts`, `src/components/Calendar/EditEventTimeDialog.tsx`

## 2b. MoveEventDateDialog data-synk ✅ Klart
**Åtgärd**: `MoveEventDateDialog` uppdaterar nu både `calendar_events` och `bookings`-tabellen (datum + tider) via samma mönster som `QuickTimeEditPopover`. Använder UTC-helpers. Tidszons-bugg med `getHours()` fixad.
**Filer**: `src/components/Calendar/MoveEventDateDialog.tsx`

## 2c. Batch staff availability ✅ Klart
**Åtgärd**: Ny `getAvailableStaffForDateRange` i `staffAvailabilityService.ts` gör 2 queries (staff + availability) istället för 2×N. `CustomCalendar` använder batch-funktionen. Console.log-spam borttagen från availability-logik.
**Filer**: `src/services/staffAvailabilityService.ts`, `src/components/Calendar/CustomCalendar.tsx`

---

# Steg 3: LATER ✅ Klart (utom 3d)

## 3a. Event deduplication guard ✅ Klart
**Åtgärd**: Realtime INSERT-handler i `useRealTimeCalendarEvents` kollar nu både `id` OCH `booking_id + event_type` combo innan ett event läggs till. Förhindrar dubbletter vid snabb sync.
**Filer**: `src/hooks/useRealTimeCalendarEvents.tsx`

## 3b. Console.log-sanering (rendervägar) ✅ Klart
**Åtgärd**: Borttagna icke-error `console.log` från `useRealTimeCalendarEvents`, `CustomCalendar`, `CalendarEventHandlers`, `useEventOperations`, `useResourceCalendarHandlers`. Kvar: `console.error` för faktiska fel.

## 3c. Borttagning av oanvända komponenter ✅ Klart
**Åtgärd**: `DayCalendar.tsx` och `useDayCalendarEvents.tsx` borttagna — inga importer fanns.

## 3d. FullCalendar-migration ✅ Klart (parallellt spår)
**Status**: Custom-ersättningar byggda i `src/components/Calendar/custom/`. Feature flag `use_custom_calendar` i localStorage styr vilken implementation som körs.

### Nya filer:
- `src/components/Calendar/custom/useCalendarGrid.tsx` — Tidsberäkning, slot-generering, event-positionering i pixlar
- `src/components/Calendar/custom/TimeColumn.tsx` — Tidslots-kolumn (06:00–22:00)
- `src/components/Calendar/custom/ResourceColumn.tsx` — En team-kolumn med events, använder befintlig `CustomEvent`
- `src/components/Calendar/custom/CustomResourceTimeGrid.tsx` — Ersätter `ResourceCalendar` (resourceTimeGrid dagvy)
- `src/components/Calendar/custom/MonthCell.tsx` — Dag-cell i månadsvy
- `src/components/Calendar/custom/CustomMonthGrid.tsx` — Ersätter `IndividualStaffCalendar` (månadsvy)
- `src/components/Calendar/ResourceCalendarSwitch.tsx` — Feature flag wrapper för resource-kalender
- `src/components/Calendar/StaffCalendarSwitch.tsx` — Feature flag wrapper för personal-kalender

### Inkopplade konsumenter:
- `MonthlyResourceCalendar.tsx` → `ResourceCalendarSwitch`
- `TestMonthlyResourceCalendar.tsx` → `ResourceCalendarSwitch`
- `StaffMemberCalendar.tsx` → `StaffCalendarSwitch`

### Aktivering:
```js
localStorage.setItem('use_custom_calendar', 'true'); // Aktivera custom-versionen
localStorage.removeItem('use_custom_calendar');       // Tillbaka till FullCalendar
```

## 3e. Refaktorera CustomCalendar ✅ Klart
**Åtgärd**: CustomCalendar (400→185 rader) uppdelad i tre extraherade hooks:
- `useWeekDays` — generering av 7-dagars array
- `useCarouselState` — karusellnavigering, scroll-hantering, centrerad dag
- `useAvailableStaffWeek` — batch-hämtning av tillgänglig personal + team-tilldelning
Gemensam `buildTimeGridProps`-helper eliminerar duplicerad TimeGrid-konfiguration.
**Filer**: `src/hooks/useWeekDays.tsx`, `src/hooks/useCarouselState.tsx`, `src/hooks/useAvailableStaffWeek.tsx`, `src/components/Calendar/CustomCalendar.tsx`

## 3f. Optimistic updates drag & drop ✅ Klart
**Åtgärd**: FullCalendar hanterar redan optimistic UI nativt (DOM uppdateras direkt vid drag). `useEventOperations` har rensats till att enbart: (1) persist:a ändringen till DB, (2) visa toast, (3) revert:a via `info.revert()` vid fel. Alla redundanta `console.log` borttagna. `CalendarEventHandlers` förenklad — passthrough utan loggning.
**Filer**: `src/hooks/useEventOperations.tsx`, `src/components/Calendar/CalendarEventHandlers.tsx`, `src/hooks/useResourceCalendarHandlers.tsx`
