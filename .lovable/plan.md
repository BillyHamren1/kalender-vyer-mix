
## Problemet i klartext

Bokningsplaneraren i stora projekt försöker spara datum via `updateBookingDatesViaApi` → `planning-api-proxy` → upstream Booking-API, som svarar `400 Unknown type: bookings`. Det är fel väg.

Personalkalendern (`timeSync.applyPhaseTimes`) skriver datum/tider rakt mot lokala `bookings`-tabellen och låter befintlig kalender-sync sprida ändringen till calendar_events och syskonbokningar. Det är samma väg vi ska använda här.

## Lösning

### 1. Byt skrivväg i `LargeProjectPlannerPanel.handleUpdateBookingSchedule`
- Ta bort anropet till `updateBookingDatesViaApi` + `import-bookings`-invoke.
- Använd istället samma motor som personalkalendern:
  - `supabase.from('bookings').update({ rigdaydate, eventdate, rigdowndate, rig_dates, event_dates, rigdown_dates, rig_start_time, ... })` på den valda bokningen.
  - Kör befintlig `applyPhaseTimes` från `src/services/timeSync.ts` för respektive fas så att tider sprids till calendar_events och syskon i stora projektet.
  - Trigga `recompute_booking_staff_for_day` RPC per berörd dag (samma som kalendern gör vid datum-flytt) så att BSA-rader följer med.
- Optimistisk refetch av `useProjectBookings` + invalidering av planning-dashboard queries.

### 2. Verifiera att UI:t fortfarande funkar end-to-end
- `BookingPlannerSheet`: ingen ändring i komponenten — den anropar samma `onUpdateBookingSchedule`-prop.
- `LargeProjectBookingPlanMirror` på bokningsdetaljvyn: opåverkad, lever vidare som checklistspegel av order-to-dos.
- "Planera hela bokningen"-knappen: opåverkad, fortsätter skapa mirror-items + per-orderrad-todos baserat på de nu lokalt sparade datum-arrayerna.

### 3. Tester (vitest)
- `largeProjectPlannerService` får en ny enhet som mockar supabase-klienten och verifierar att schedule-skrivningen:
  - Träffar `bookings.update` med rätt fält per fas.
  - Anropar `applyPhaseTimes` med rätt fas+datum+tid-trippel.
- Snapshot på `BookingPlannerSheet` att schedule-block är synligt och `Planera hela bokningen` förblir disabled tills minst en fas har datum.

### 4. Rensa upp
- Lämna `updateBookingDatesViaApi` orörd i `planningApiService.ts` (används inte längre av planneren, men kan finnas kvar för framtiden). Lägg in en TODO-kommentar att upstream svarar 400 så ingen annan call-site tar samma fälla.
- Ingen migration behövs — alla fält finns redan i lokala `bookings`.

## Filer som ändras

- `src/components/project/large-planner/LargeProjectPlannerPanel.tsx` — byt skrivväg i `handleUpdateBookingSchedule`.
- `src/components/project/large-planner/largeProjectPlannerService.ts` — flytta ut själva DB-skrivningen hit som ren helper (`saveBookingSchedule(bookingId, dateType, payload)`).
- `src/components/project/large-planner/__tests__/largeProjectPlannerService.schedule.test.ts` — ny vitest.
- `src/services/planningApiService.ts` — TODO-kommentar.

## Det här ändrar inte

- Booking-system-as-source-of-truth-policyn berör läs-data (offerter, fakturor, ekonomi). Skrivning av rig/event/rigDown-datum och team-tilldelningar är redan lokal — det är så hela personalkalendern fungerar idag.
