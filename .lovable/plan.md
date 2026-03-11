
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

# Steg 3: LATER

- Avveckla FullCalendar-beroende om `ResourceCalendar` inte längre används
- Refaktorera `CustomCalendar` till mindre sub-komponenter (header, grid, event-layer)
- Lägg till optimistic updates för drag & drop
- Event deduplication guard i realtime-handler
