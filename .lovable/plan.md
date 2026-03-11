
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

## 3d. FullCalendar-beroende ⏳ Ej möjligt ännu
**Status**: `ResourceCalendar.tsx` importeras av `UnifiedResourceCalendar`, `MonthlyResourceCalendar`, `TestMonthlyResourceCalendar`. `IndividualStaffCalendar` använder FullCalendar direkt. Kräver migrering av 4 komponenter till custom grid — stort scope, rekommenderas som separat projekt.

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
