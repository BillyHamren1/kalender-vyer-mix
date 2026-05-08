## Mål

1. **Allt på singelklick.** Högerklick (det du kallar "dubbeltryck") ska bort helt på event i planeringskalendern. Allt det idag öppnar (Flytta datum-dialogen) ska istället nås via singelklick.
2. **Röd ram runt event när "Fast tid" är ikryssad** i QuickTimeEditPopover.

---

## 1. Konsolidera singel + höger­klick → singelklick

**Idag:**
- Singelklick öppnar `EventActionPopover` (Team / Dagar / Tid / Öppna / Flytta datum…).
- Högerklick (`onContextMenu`) öppnar `MoveEventDateDialog` direkt.
- Det skapar två olika ingångar och förvirrar.

**Ändring i `src/components/Calendar/CustomEvent.tsx`:**
- Ta bort `handleContextMenu` och `onContextMenu`-wrapparna runt eventkortet (både för warehouse-grenen och normal-grenen).
- Återställ standard webbläsar-kontextmeny (ingen egen UI-trigger på högerklick).
- Behåll `EventActionPopover` på singelklick (där "Flytta datum…"-knappen redan finns och öppnar `MoveEventDateDialog`). Det är nu enda vägen in.
- Säkerställ att popovern faktiskt öppnas: `PopoverTrigger`-wrappen får `onPointerDown`/`onClick` som triggar `setOpen(true)` även när eventet är `draggable` (drag stjäl ibland klick-eventet på Radix).

**Resultat:** Ett enda klick på ett event öppnar popovern med Team, Dagar, Tid, Öppna, Flytta datum. Högerklick gör inget speciellt längre.

---

## 2. Röd ram när "Fast tid" är ikryssad

**Idag:**
- `CustomEvent.tsx` ritar redan röd ram (`border: 2px solid #DC2626`) när `event.extendedProps?.timeLocked === true`.
- Flaggan `timeLocked` sätts korrekt i `plannerCalendarDerivation` från `bookings.<phase>_time_locked`.
- Men: när användaren bockar i "Fast tid" i `QuickTimeEditPopover` så uppdaterar inte den lokala calendar-event-listan `timeLocked` förrän nästa fulla refetch. Och i `useRealTimeCalendarEvents` enrichas `extendedProps` om utan att uttryckligen ta med `timeLocked` (den följer bara med via `...event.extendedProps`-spread, vilket gör den känslig för att en mellanstegs-mappning tappar fältet).

**Ändringar:**

a) `src/hooks/useRealTimeCalendarEvents.tsx`
- Lägg till `timeLocked: event.extendedProps?.timeLocked === true` i den explicita `extendedProps`-uppbyggnaden så fältet aldrig tappas.

b) `src/components/Calendar/QuickTimeEditPopover.tsx`
- Efter `setPhaseLock(...)` lyckats: optimistiskt uppdatera lokala events via `setEvents` (om tillgängligt) eller dispatcha samma cache-invalidations som `onUpdate` redan gör — så röd ram syns direkt utan reload.

c) `src/components/Calendar/CustomEvent.tsx`
- Förtydliga ramen: gör den lite tjockare (3px) och lägg en svag röd glow så den verkligen syns mot grön/blå eventbakgrund.
- Säkerställ att `isLocked`-grenen körs även när eventet samtidigt är `hasSourceChanges` (idag vinner orange ramen). Prioritetsordning: cancelled > locked (röd) > sourceChanges (orange) > default.

---

## Filer som ändras

- `src/components/Calendar/CustomEvent.tsx` — ta bort kontextmeny, säkra klick-trigger, justera ramprioritet.
- `src/hooks/useRealTimeCalendarEvents.tsx` — propagera `timeLocked` explicit.
- `src/components/Calendar/QuickTimeEditPopover.tsx` — optimistisk uppdatering efter lås­ändring.

Inget backend/DB-arbete krävs.

---

## Vad som INTE ändras

- `EventActionPopover` (innehåll/layout är samma — det är redan rätt vy).
- `EventHoverCard` (rich hover-info kvarstår på hover, oförändrad).
- "Fast tid"-toggling-logiken (`setPhaseLock`) är oförändrad.
