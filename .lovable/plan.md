## Mål

Göra det snabbt att flytta och justera kalender-events. Ersätt nuvarande hover-info med en klickbar **action popover** som samlar de vanligaste operationerna på ett ställe.

## Ändringar

### 1. Ny komponent: `src/components/Calendar/EventActionPopover.tsx`
En enda Radix `Popover` som triggas genom **enkelklick** på eventet (ersätter dagens hover-flöde för planning-events). Innehåll uppifrån och ner:

**a) Team-rad (flytta team)**
- Hämtar `teamResources` via `useTeamResources` (filtrerar bort `team-11` och `transport`, samma logik som `MoveDayPopover`).
- Renderar varje team som liten `Button` (visar t.ex. "T1", "T2"…). Aktivt team markeras (variant `default`), övriga `outline`.
- Klick → samma flytt-pipeline som `MoveDayPopover.moveOneDay(newTeamId)` (consolidated event-ids för LP, recompute_booking_staff_for_day RPC, optimistic `setEvents`). Vi extraherar den logiken till en hook `useMoveEventToTeam(event, setEvents, onUpdate)` så både popovern och befintliga ←/→-pilar (om vi behåller dem) använder samma kod.

**b) Rigg-datum-rad (lägg till / ta bort dagar)**
- Lista bokningens `rig` / `event` / `rigDown`-datum (hämtas från `calendar_events` filtrerat på `booking_id` — eller, för LP, `consolidatedBookingIds`). Rendera som chip per datum + typ, sorterat kronologiskt.
- Varje chip: klickbar → bekräftelse → `deleteCalendarEvent(id)` (samma path som `DeleteDayButton`).
- Sista chip: "+ Lägg till dag" → öppnar befintlig `AddRiggDayDialog`.

**c) Tid-rad (snabbjustera start/slut)**
- Två kompakta Select-dropdowns (timme + minut, 30-min-steg) för start och slut, prefyllda från `event.start`/`event.end`.
- "Spara"-knapp → kallar `updateCalendarEvent` (eller `moveLargeProjectDay` för LP) — samma helpers som `QuickTimeEditPopover` redan använder. Vi återanvänder den logiken (extraherar i `useQuickTimeUpdate` om nödvändigt) istället för att duplicera.

**d) Footer**
- "Öppna bokning" → `handleViewDetails()` (befintlig).
- "Flytta datum…" → öppnar `MoveEventDateDialog` (befintlig).

### 2. `src/components/Calendar/CustomEvent.tsx`
- Ta bort `EventHoverCard`-omslaget för planning-events (behåll det för project-activity och read-only/warehouse-event där relevant — eller ersätt även där om vi bestämmer oss; default: bara planning-events får nya popovern).
- Wrappa `eventCardContent` i `<EventActionPopover event={event} setEvents={setEvents} onUpdate={onEventResize}>` så enkelklick öppnar action-popovern.
- Behåll `onContextMenu` (öppnar `MoveEventDateDialog`) och dubbelklick (`handleViewDetails`).
- Ta bort de små in-card-ikonerna `AddDayButton` / `MoveDayPopover` / `DeleteDayButton` från eventytan eftersom funktionaliteten nu finns i popovern (renare kort, mindre felklick). `DeleteDayButton`-knappen bevaras för cancelled events.

### 3. Drag-n-drop påverkas inte
`TimeGridEventLayer.EventWrapper` är fortsatt `draggable` — popovern öppnas på klick (mouseup utan drag), inte på dragstart.

### 4. Hover-kortet
`EventHoverCard` används kvar för project-activity-rendering och read-only-vy. Inom planning-vyn slutar det att renderas.

## Tekniska detaljer

- Återanvänd existerande services — vi skapar inga nya DB-anrop:
  - Team-flytt: samma kod som `MoveDayPopover.moveOneDay`.
  - Tid-edit: samma som `QuickTimeEditPopover` (vanlig + LP-gren).
  - Add day: `AddRiggDayDialog`.
  - Delete day: `deleteCalendarEvent` + last-row-warning från `DeleteDayButton`.
- Datumlistan i avsnitt b) hämtas via en lättviktig query `useEventBookingDays(event)` (single `select id, event_type, start_time, end_time from calendar_events where booking_id = ? OR id in (consolidatedEventIds)`).
- Popovern sätter `data-state="open"` så `EventHoverCard`-detekteringen redan är konsistent med övriga dialoger.

## Filer

- ny: `src/components/Calendar/EventActionPopover.tsx`
- ny: `src/hooks/useMoveEventToTeam.ts` (extraherad från `MoveDayPopover`)
- ny: `src/hooks/useEventBookingDays.ts`
- edit: `src/components/Calendar/CustomEvent.tsx` (byt wrapper, ta bort in-card-knappar)
- edit: `src/components/Calendar/MoveDayPopover.tsx` (refaktoreras att använda `useMoveEventToTeam`, alternativt bli intern del av popovern)

## Out of scope
- Ändringar i warehouse-events (de behåller dagens beteende).
- Ändringar i project-activity-rendering.
