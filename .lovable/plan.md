## Mål
Få bort "synthetic" kalenderrader helt. Allt sparas på samma sätt: en riktig `calendar_events`-rad per (bokning, fas, datum). Drag, team-byte och tidsändring funkar då likadant överallt — ingen "rullar tillbaka"-bugg.

## Bakgrund (kort)
Idag har `bookings` bara EN `rigdaydate` och EN `rigdowndate`. Flerdagars-rig/rigdown finns bara som personal-uppdrag i `staff_assignments`, och UI:t härleder låtsasrader ("synthetic", `id` börjar med `staff-…`). När man flyttar en synthetic-rad finns det ingen rad att skriva till → ändringen försvinner.

Skolfest #2604-64 är ett konkret exempel: `rigdowndate=2026-04-26` men personal jobbar även 27/4 → synthetic-rad → team-2 sparades aldrig.

## Steg

### 1. Quick-fix för Skolfest #2604-64
Skapa den saknade `calendar_events`-raden för 2026-04-27 (rigDown, `resource_id='team-2'`) så användarens flytt syns direkt.

### 2. Backfill: materialisera alla synthetic-dagar som finns idag
SQL-migration som för varje (bokning, fas) hittar alla dagar som har personal i `staff_assignments`/`booking_staff_assignments` men ingen `calendar_events`-rad — och skapar dem. Tider och team hämtas från BSA + booking-fältet, fallback 08:00–12:00.

### 3. Utöka `import-bookings`
Idag skapar reconcilern bara en rad per `rigdaydate`/`rigdowndate`. Ändras till: skapa en rad per dag som faktiskt är schemalagd (läs `rig_*_dates`-arrayer från BOOKING om de finns; annars expandera intervallet utifrån `rigdaydate`+antal dagar). Resultat: nya bokningar har aldrig synthetic-dagar.

### 4. Riv ut synthetic-koden
- `staffCalendarService.deriveStaffEvents` slutar generera `staff-…`-id:n för dagar som saknar `calendar_events` — istället loggas en varning ("backfill-kandidat") och raden visas inte.
- `plannerCalendarDerivation`: ta bort `pickNearestReal`/`inferProjectSynthetic`-fallback som hittar på `resourceId`. Om en rad saknas → den finns inte i kalendern, punkt.
- `useEventDragDrop` + `MoveEventDateDialog`: ta bort grenarna `isSyntheticCalendarEventId` / "booking-only update". Alla flyttar går samma väg: uppdatera `calendar_events`-raden + spegla till `bookings`.
- `calendarEventResolver.isSyntheticCalendarEventId` + alla användningar tas bort.

### 5. Kontraktstest som låser det
Nytt test (`src/test/calendarEvents.noSynthetic.contract.test.ts`) som failar om någon återinför `staff-`-prefix-id:n eller fallback-derivering av `resourceId` i kalenderkoden.

### 6. Memory-uppdatering
Lägg till `mem://constraints/no-synthetic-calendar-events-v1` och uppdatera index. Skriver om `calendar-sync-consistency` så det är tydligt: en rad per (bokning, fas, datum), inga härledningar.

## Tekniska detaljer

**Filer som ändras:**
- `supabase/functions/import-bookings/index.ts` — expandera `rigDates`/`rigdownDates` till alla schemalagda dagar (steg 3)
- `src/services/staffCalendarService.ts` — sluta skapa synthetic events (steg 4)
- `src/services/plannerCalendarDerivation.ts` — ta bort `pickNearestReal`/`inferProjectSynthetic`-derivering (steg 4)
- `src/hooks/useEventDragDrop.ts` — en enda kodväg för flytt (steg 4)
- `src/components/Calendar/MoveEventDateDialog.tsx` — ta bort synthetic-grenen (steg 4)
- `src/services/calendarEventResolver.ts` — ta bort `isSyntheticCalendarEventId` + relaterad logik (steg 4)

**Migrationer:**
- En SQL-migration för quick-fix Skolfest #2604-64 (steg 1)
- En SQL-migration för backfill av alla saknade rader (steg 2) — körs en gång, idempotent

**Risker / saker att vara extra noga med:**
- Backfill måste vara idempotent och får inte skapa duplicerade rader (unique på `(booking_id, event_type, source_date)` om det inte redan finns — vi lägger till indexet om det saknas).
- `import-bookings` reconcilern måste fortsätta använda samma matchningsnyckel `(event_type, date)` så befintliga rader inte raderas.
- Stora projekt har egen logik (`large_project_team_assignments`) som redan skriver riktiga overrides — den lämnas orörd.

**Inget som rörs:**
- `staff_assignments` skrivväg (precis konsoliderad — enda writer är `staffAssignmentCore`).
- Warehouse-kalendern (`warehouse_calendar_events`).
- BOOKING-systemet eller `planning-api-proxy`.

## Klart när
- Skolfest #2604-64 visar rigDown 27/4 i team-2 efter F5.
- Drag/team-byte funkar för alla rig-/rigdown-dagar oavsett om bokningen har en eller flera dagar — inget "hoppar tillbaka".
- Inga `staff-…`-id:n finns kvar i koden, kontraktstestet failar om någon återinför dem.
