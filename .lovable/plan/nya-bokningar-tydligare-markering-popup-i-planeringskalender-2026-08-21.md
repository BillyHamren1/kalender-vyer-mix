# Nya bokningar: tydligare markering + popup i planeringskalendern

## 1. Tydligare markering på dashboard

Kortet "Nya bokningar" i inkorgen ska sticka ut istället för att se ut som vilken panel som helst:

- Färgad ram runt hela panelen (grön/primary accent) och svag bakgrundston när det finns nya bokningar.
- Rubrikraden får samma accentfärg samt antal nya tydligt markerat.
- När det bara finns avbokningar (inga nya) behålls dagens neutrala/röda utseende.

## 2. Popup över planeringskalendern

När en planerare öppnar planeringskalendern och det finns nya, oplacerade bokningar som personen inte redan kryssat bort visas en dialog överst:

- Lista med de nya bokningarna: kund, bokningsnummer, datum, leveransadress.
- Knapp **Planera** per rad → öppnar den befintliga placeringsdialogen direkt i kalendervyn, så bokningen kan planeras in utan att lämna sidan.
- Knapp **Stäng/Kryssa bort** (per rad och för hela dialogen) → bokningen ligger kvar i inkorgen på dashboarden, men popupen visas inte igen för just den bokningen.
- Popupen visas bara en gång per ny bokning och användare (lagras lokalt i webbläsaren). Nya bokningar som kommer in senare triggar popupen igen nästa gång kalendern öppnas.
- Om en bokning placeras försvinner den både ur popupen och ur inkorgen automatiskt.

## Teknisk beskrivning

- **Markering**: `src/components/project/IncomingBookingsList.tsx` — villkorlig ram/bakgrund på ytterst `div` när `totalNew > 0`.
- **Ny komponent** `src/components/calendar/NewBookingsPopup.tsx`:
  - Använder samma datakälla som inkorgen (`useUnplannedProjects` + queryn `bookings-without-project`) — ingen ny DB-logik, inga nya tabeller.
  - Filtrerar bort id:n som finns i `localStorage`-nyckeln `calendar.newBookingsDismissed.v1` (array av bokningsid).
  - Renderar `Dialog` + återanvänder `BookingPlacementDialog` (props: `open`, `onOpenChange`, `bookingId`) för Planera-flödet.
  - Vid dismiss: lägg till id i localStorage och stäng.
- **Montering**: `src/pages/CustomCalendarPage.tsx` renderar komponenten en gång i toppen av sidan (endast desktop-planeringsvyn).
- Efter lyckad placering invalidateras `bookings-without-project` / `unplanned-projects` så inkorg och popup uppdateras.

## Verifiering

- Kontraktstest som verifierar dismiss-filtret (localStorage-id filtreras bort, nya id passerar).
- Manuell körning i preview: kalender öppnas → popup syns, kryss döljer den, Planera öppnar placeringsdialogen.
