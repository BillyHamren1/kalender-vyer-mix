## Problem

To-don sparas korrekt i `calendar_events` (event_type='todo' + resource_id = team), men personalkalendern visar den inte. Konsolloggen säger `non-project rows skipped (non-staffable event_type) 31` — det är `buildPlannerCalendarEvents` som filtrerar bort allt vars `event_type` inte är `rig`/`event`/`rigDown`.

## Lösning

I `src/services/plannerCalendarDerivation.ts`, i loopen runt rad 272–360:

- Innan `phase`-allowlisten, lägg till en passthrough för `row.event_type === 'todo'`:
  - kräv `resource_id` (annars hoppa)
  - hoppa om raden är knuten till booking som tillhör large project (samma guard som befintliga raden)
  - pusha via `mapRealRowToCalendarEvent(row, booking, undefined)`
  - ny räknare `todoEventsEmitted` i debug-loggen

- I `mapRealRowToCalendarEvent`:
  - Behåll `eventType: 'todo'` när `event_type === 'todo'` (idag returneras `undefined` eftersom `normalizePhase` ger null). Enklast: efter `normalizePhase`-fallback, sätt `eventType: row.event_type === 'todo' ? 'todo' : (normalizePhase(...) || undefined)` på både `eventType` och `extendedProps.eventType`.
  - Title: `row.title` används redan som sista fallback när booking saknas → OK.

## Test

- Lägg till `src/services/__tests__/plannerCalendarDerivation.todo.test.ts`:
  - Given en rad med `event_type='todo'`, `resource_id='team-1'`, `booking_id=null`, `title='Upphämtning – Kund X'`, `source_date='2026-05-14'`.
  - Förvänta att outputen innehåller exakt 1 event med `eventType:'todo'`, `resourceId:'team-1'`, korrekt title.
  - Andra fallet: `resource_id=null` → ska hoppas.
- Kör `bunx vitest run src/services/__tests__/plannerCalendarDerivation.todo.test.ts` efter ändringen.

## Verifiering i UI

- ResourceData/CustomEvent har redan styling för `'todo'` (orange) → kortet renderas.
- Realtime: kalendern lyssnar redan på `calendar_events` (befintlig "Real-time calendar subscription established") så INSERT triggar refetch — ingen ändring behövs där.

## Filer som ändras

- `src/services/plannerCalendarDerivation.ts` (passthrough + eventType-mappning)
- `src/services/__tests__/plannerCalendarDerivation.todo.test.ts` (nytt)
