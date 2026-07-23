# Auto-lås "Fast tid" vid import av bokning

## Problem
När en bokning kommer in från Booking med explicit satta start/slut-tider (`rig_start_time`, `rig_end_time`, `rigdown_start_time`, `rigdown_end_time`) skapas kalenderraderna med rätt tid — men utan `times_locked=true`. Därför saknas röda ramen i planeringskalendern och användaren kan dra/resiza raden utan att låsa upp först.

Låsmekaniken finns redan på plats i frontend (`times_locked` → `extendedProps.timeLocked` → röd ram i `BookingEvent`/`CustomEvent`, blockerad drag/resize, "Lås upp"-knapp i `QuickTimeEditPopover`/`EventActionPopover`). Det som fattas är att `import-bookings` faktiskt sätter flaggan.

## Lösning
Reconcilern i `supabase/functions/import-bookings/index.ts` känner redan till om tiden är explicit (`isExplicitStart`) via `buildDateTimeFromPartsEx`. Vi utnyttjar den signalen — utökad till att också ta hänsyn till om slut-tiden är explicit — för att skriva `times_locked=true` på raden när tiden kommer explicit från Booking.

### Ändringar (endast `supabase/functions/import-bookings/index.ts`)

1. Utöka `desiredEvents`-objekten (rig och rigDown) med `isExplicitEnd` utöver `isExplicitStart`, och deriva en `lockRequested = isExplicitStart && isExplicitEnd` (dvs. Booking har satt både start och slut → äkta fast tid).
2. **INSERT-vägen**: sätt `times_locked: lockRequested` i `.insert({...})` för nya calendar_events-rader.
3. **UPDATE-vägen**: när `explicitTimeChanged` är true, ta med `times_locked: lockRequested` i `updatePayload` så en bokning som blir explicit i efterhand också blir låst. Om Booking däremot tar bort den explicita tiden (osannolikt, men) ska vi INTE tvinga upp en användarsatt lås — därför sätts flaggan enbart när `lockRequested === true`; annars rörs kolumnen inte.

### Vad som INTE ändras
- Frontend-rendering, låsdialoger, drag/resize-blockering — allt fungerar redan när `times_locked=true` finns i DB.
- Manuellt satta lås (via `QuickTimeEditPopover` "Fast tid") berörs inte — de skrivs mot samma kolumn men rörs inte vid en re-import där bokningen fortfarande har explicit tid (idempotent).
- Ingen migration behövs — kolumnen `calendar_events.times_locked` finns redan.

## Verifiering
Efter deploy: kör en manuell re-import av en bokning som har både `rig_start_time` och `rig_end_time` satt i Booking, öppna projektets planering och bekräfta att rig-raden får röd ram + att drag blockeras med toast "Tiden är låst".
