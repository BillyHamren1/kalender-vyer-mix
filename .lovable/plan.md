

# Lägg till "Kopiera"-knapp i Flytta händelse-dialogen

## Vad
Lägga till en "Kopiera"-knapp i `MoveEventDateDialog` som skapar en kopia av eventet på valt datum/tid/team — istället för att flytta det. Perfekt för att lägga till en byggdag eller duplicera ett event till ett annat team samma dag.

## Hur

### Ändra `MoveEventDateDialog.tsx`
1. Lägg till en `onDuplicate`-callback som optional prop (bredvid `onUpdate`)
2. Lägg till en `handleDuplicate`-funktion som:
   - Skapar ett nytt event via `createCalendarEvent` med valt datum, tid och team
   - Kopierar `title`, `eventType`, `bookingId`, `bookingNumber`, `deliveryAddress` från källeventet
   - Visar success-toast: "Händelse kopierad"
   - Anropar `onUpdate` för att refresha kalendern
3. Lägg till en "Kopiera"-knapp i `DialogFooter` mellan "Avbryt" och "Flytta":
   - Teal/outline-stil för att skilja från "Flytta"
   - Disablad om inget datum är valt eller om submitting

### Ändra `CustomEvent.tsx`
- Skicka med nödvändiga props (`event`-objektet med alla fält) till `MoveEventDateDialog` så att kopieringen har tillgång till `bookingId`, `bookingNumber`, `deliveryAddress` etc.

## Teknisk detalj
- Kopiering använder befintliga `createCalendarEvent` från `eventService.ts` — ingen ny service behövs
- Flytta-knappen fungerar exakt som innan, ingen regression
- Kopian får ett nytt ID, alla andra fält kopieras

