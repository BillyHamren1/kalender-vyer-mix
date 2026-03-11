
# Steg 1: SAFE NOW ✅ Klart

- ✅ `convertToISO8601` centraliserad till `src/utils/dateUtils.ts`
- ✅ Debug-`console.log` borttagna från `CustomEvent.tsx` och `EventHoverCard.tsx`
- ✅ `openDelay={300}` på `EventHoverCard`

---

# Steg 2: SAFE NEXT (rekommenderas härnäst)

## 2a. Tidszons-konsistens
**Problem**: `EditEventTimeDialog` använder lokal tid, `QuickTimeEditPopover` använder UTC. Kan ge tidsförskjutning vid redigering.
**Åtgärd**: Skapa adapter-funktioner i `dateUtils.ts` (`toLocalInputValue`, `fromLocalInputValue`) som båda komponenterna använder. Ingen ändring av API-kontrakt.
**Filer**: `src/utils/dateUtils.ts`, `src/components/Calendar/EditEventTimeDialog.tsx`, `src/components/Calendar/QuickTimeEditPopover.tsx`

## 2b. MoveEventDateDialog data-synk
**Problem**: `MoveEventDateDialog` uppdaterar bara `calendar_events`, inte `bookings`-tabellen. Events hoppar tillbaka vid nästa sync.
**Åtgärd**: Lägg till ett kompletterande `bookings`-update i samma transaktion, via adapter i `eventService.ts`.
**Filer**: `src/components/Calendar/MoveEventDateDialog.tsx`, `src/services/eventService.ts`

## 2c. N+1 staff availability
**Problem**: Staff-availability hämtas per dag/resurs istället för i batch.
**Åtgärd**: Batch-fetch i `useRealTimeCalendarEvents` eller i en ny `useStaffAvailability`-hook.
**Filer**: Analysera `src/components/Calendar/CustomCalendar.tsx` för exakt scope.

---

# Steg 3: LATER

- Avveckla FullCalendar-beroende om `ResourceCalendar` inte längre används
- Refaktorera `CustomCalendar` till mindre sub-komponenter (header, grid, event-layer)
- Lägg till optimistic updates för drag & drop
- Event deduplication guard i realtime-handler
