## Mål
I `BookingTodosChecklist` (kortet "To-do & checklista" på bokningssidan): låt varje to-do få ett eget datum (och valfri start/sluttid), så det syns vilka saker som ska göras vilken dag. Schema-kortet rörs inte.

## Ändringar
Endast `src/components/booking/detail/BookingTodosChecklist.tsx`.

Per rad, mellan title-blocket och personal-väljaren:
- **Datum-chip** — `Popover` + shadcn `Calendar` (`mode="single"`, `className="p-3 pointer-events-auto"`). Visar `9 jun` om satt, annars "Sätt datum". Spar via `updateLargeProjectPlannerItem({ plan_date })`.
- **Tid-chip** — `Popover` med två `Input type="time"` (start, slut) + "Rensa". Visar `08:00–17:00` om satt, annars "Hela dagen". Spar via `updateLargeProjectPlannerItem({ start_time, end_time })`.

Snabbval i datum-popovern: knappar för bokningens rigg-, event- och nedrivnings-datum (om de finns på `booking`) ovanför kalendern, för att snabbt fördela.

Grupperingen (dagens kortrubrik "tis 9 juni 2026") rerenderas automatiskt eftersom listan grupperas på `plan_date` och cachen invalideras efter mutation.

Skapande av ny to-do från orderrad: lägg till val av datum (default = `defaultDate`, sortlistan av befintliga rigg-dagar) innan rad skapas.

Optimistisk uppdatering via `queryClient.setQueryData` på `['booking-todos-checklist', bookingId]` för att undvika flimmer.

## Tester
- `BookingTodosChecklist.dates.test.tsx`: 
  - klick på datum-chip + välj dag → `updateLargeProjectPlannerItem` anropas med ny `plan_date`
  - skriv tid → mutation anropas med `start_time`/`end_time`
  - rensa tid → mutation anropas med `null/null`

## Bevaras
- Schema-kortet, `calendar_events`, personalkalendern, `apply-project-dates`, BookingPlannerSheet — orörda.
- Inga DB-migrationer (kolumnerna finns redan på `large_project_booking_plan_items`).
- "Order-row todos not calendar blocks"-policyn — todons datum påverkar inte kalenderblock.
