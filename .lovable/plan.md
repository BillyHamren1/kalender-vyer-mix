

# Steg 1: SAFE NOW -- Säkra förbättringar utan beteendeändringar

Tre åtgärder som inte ändrar design, färger, routes, API-anrop eller funktionalitet.

---

## 1. Centralisera `convertToISO8601` till gemensam utility

**Problem**: Identisk funktion duplicerad i `eventService.ts` och `useRealTimeCalendarEvents.tsx`. Bugfix i en glöms i den andra.

**Åtgärd**:
- Skapa `src/utils/dateUtils.ts` med funktionen.
- Byt import i `eventService.ts` och `useRealTimeCalendarEvents.tsx` till den nya filen.
- Exakt samma logik, ingen beteendeändring.

**Filer som ändras**:
- `src/utils/dateUtils.ts` (ny)
- `src/services/eventService.ts` (ta bort lokal kopia, lägg till import)
- `src/hooks/useRealTimeCalendarEvents.tsx` (ta bort lokal kopia, lägg till import)

---

## 2. Ta bort debug-`console.log` från rendervägen

**Problem**: `CustomEvent.tsx` (rad 96-102) och `EventHoverCard.tsx` (rad 17-18, 32-36) loggar vid varje render. Med 100+ events ger detta tusentals loggar per frame och döljer verkliga fel.

**Åtgärd**: Ta bort dessa `console.log`-anrop. Ingen funktionell påverkan.

**Filer som ändras**:
- `src/components/Calendar/CustomEvent.tsx` (ta bort rad 96-102)
- `src/components/Calendar/EventHoverCard.tsx` (ta bort rad 17-18 och 32-36)

---

## 3. Lägg till `openDelay={300}` på EventHoverCard

**Problem**: `openDelay={0}` gör att hover-kortet blinkar upp vid snabb musrörelse över kalendern, vilket stör interaktion och kan orsaka popup-konflikter.

**Åtgärd**: Ändra `openDelay={0}` till `openDelay={300}` i `EventHoverCard.tsx` rad 44. Ingen design- eller funktionsändring, bara en fördröjning.

**Filer som ändras**:
- `src/components/Calendar/EventHoverCard.tsx` (rad 44)

---

## Nästa steg (SAFE NEXT)

Efter Steg 1 rekommenderas:

1. **Tidszons-konsistens** -- Synka `EditEventTimeDialog` och `QuickTimeEditPopover` till samma UTC-hantering via adapter-funktioner i `dateUtils.ts`.
2. **MoveEventDateDialog data-synk** -- Säkerställ att flytt av event uppdaterar både `calendar_events` och `bookings`-tabellen, så events inte hoppar tillbaka vid nästa sync.
3. **N+1 query i CustomCalendar** -- Batchfetch staff-availability istället för per-dag-anrop.

Dessa tre kräver mer analys men kan göras säkert via adapterlager utan att ändra befintliga kontrakt.

