## Mål
Ta bort palett-ikonen i hörnet av kalenderkortet. Flytta färgmärkningen till högerklicks-menyn (ContextMenu).

## Ändringar

### 1. `src/components/Calendar/CustomEvent.tsx`
- Ta bort renderingen av `<BookingColorMarkButton ... />` (raderna ~233–239) och importen.
- I `ContextMenuContent` (raderna 510–525), lägg till en ny sektion "Färgmärkning" med:
  - Transport (blå)
  - Endast uthyrning (orange)
  - Valfri färg (öppnar color-picker i submenu eller inline)
  - Ta bort färg (visas bara om `calendarColor` finns)
- Sektionen visas alltid när `event.bookingId` finns och kortet inte är avbokat/todo, oavsett `consolidationMenuDisabled` (separat villkor).
- Använd `setBookingCalendarColor` + `BOOKING_COLOR_PRESETS` från befintlig `bookingColorService`.
- Bevara `onChanged → onEventResize` så kalendern uppdateras.

### 2. `src/components/Calendar/BookingColorMarkButton.tsx`
- Filen behålls inte längre i bruk via CustomEvent. Antingen: a) lämna kvar orörd (om används annorstädes), eller b) ta bort. Plan: kontrollera användningar med `rg` innan radering — om enda referensen är CustomEvent, ta bort filen.

## Teknisk detalj
- ContextMenu från shadcn stödjer `ContextMenuSub` / `ContextMenuSeparator` — använd separator mellan färg-sektion och konsolidera-sektion.
- För "Valfri färg" använd `<ContextMenuSub>` med inbäddad `<input type="color">` (eller en enkel ContextMenuItem som öppnar en liten Popover/Dialog). Enklast: behåll de två presets + "Ta bort färg" direkt i menyn, och lägg "Valfri färg…" som en ContextMenuItem som öppnar en mini-dialog. För scope: skippa custom-färg helt (presets täcker normalfallet). Bekräfta med användaren om custom behövs.

## Inte med i denna ändring
- Ingen ändring av `bookingColorService` eller DB-schema.
- Ingen ändring av warehouse-event-flödet (de saknar redan ContextMenu — där fortsätter färg ej vara tillgänglig).