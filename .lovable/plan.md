
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

# Steg 3: LATER — delvis klart

## 3a. Event deduplication guard ✅ Klart
**Åtgärd**: Realtime INSERT-handler i `useRealTimeCalendarEvents` kollar nu både `id` OCH `booking_id + event_type` combo innan ett event läggs till. Förhindrar dubbletter vid snabb sync.
**Filer**: `src/hooks/useRealTimeCalendarEvents.tsx`

## 3b. Console.log-sanering (rendervägar) ✅ Klart
**Åtgärd**: Borttagna icke-error `console.log` från `useRealTimeCalendarEvents`, `CustomCalendar`. Kvar: `console.error` för faktiska fel.
**Filer**: `src/hooks/useRealTimeCalendarEvents.tsx`, `src/components/Calendar/CustomCalendar.tsx`

## 3c. Borttagning av oanvända komponenter ✅ Klart
**Åtgärd**: `DayCalendar.tsx` och `useDayCalendarEvents.tsx` borttagna — inga importer fanns.
**Filer**: (borttagna)

## 3d. FullCalendar-beroende ⏳ Ej möjligt ännu
**Status**: `ResourceCalendar.tsx` importeras av `UnifiedResourceCalendar`, `MonthlyResourceCalendar`, `TestMonthlyResourceCalendar`. `IndividualStaffCalendar` använder FullCalendar direkt. Kräver migrering av 4 komponenter till custom grid — stort scope, rekommenderas som separat projekt.

## 3e. Refaktorera CustomCalendar ⏳ Ej påbörjat
**Status**: CustomCalendar (400 rader) hanterar carousel, weekly grid, event filtering. Kan delas till sub-komponenter men ingen risk idag. Rekommenderas vid nästa funktionsutökning.

## 3f. Optimistic updates drag & drop ⏳ Ej påbörjat
**Status**: Kräver analys av befintligt drag & drop-flöde i TimeGrid/ResourceCalendar. Medelhög risk. Rekommenderas efter stabilisering av alla edit-flows.
