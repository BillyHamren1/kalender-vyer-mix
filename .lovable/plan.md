Du har rätt. Det som ska fixas är inte att ta bort kolumnerna — det är att ta bort bolags-/bokningsnamn inne i själva produktkolumnen, samtidigt som layouten med fyra kolumner ska vara kvar.

Plan:
1. Återställ tabellayouten med fyra kolumner
- `LargeProjectProductsOverview` ska åter visa:
  - Produkt
  - Antal
  - Kund
  - Levadress
- Varje rad ska vara en produkt radvis över dessa fyra kolumner.

2. Ta bort företagsnamn från produktkolumnen
- Produktkolumnen ska bara innehålla produktnamnet.
- Inga grupphuvuden, inga bolagsnamn, inga bokningsnamn, inga extra etiketter ovanför produktraderna i just produktkolumnen.

3. Behåll kund och leveransadress i sina egna kolumner
- `Kund` ska hämtas från bokningen (`booking.client`).
- `Levadress` ska hämtas från bokningen (`booking.deliveryaddress`).
- `Antal` ska hämtas från produkten (`quantity`).
- Produktdata ska alltså mappas ihop med respektive bokning, men utan att bokningen renderas som rubrik i listan.

4. Behåll sökningen produkt-fokuserad
- Sökfältet ska fortsätta filtrera på produktnamn.
- Placeholder kan fortsätta vara `Sök produkt...`.
- Sökningen ska inte bygga på kundnamn, adress eller bolagsrubriker.

5. Verifiera slutresultatet visuellt
- Säkerställa att produktvyn ser ut som din referensbild:
  - fyra kolumner kvar
  - bara produkter i produktkolumnen
  - kund/adress visas endast i sina egna kolumner
  - inga företagsrubriker inne i listan

Tekniskt
- Fil som ska ändras: `src/components/project/LargeProjectProductsOverview.tsx`
- Queryn behöver utökas igen så att produkter hämtar `quantity` tillsammans med nuvarande produktfält.
- Komponenten behöver bygga en lookup från `bookings` på `booking_id` för att kunna visa kund och levadress per produkt-rad.
- Den nuvarande platta en-kolumnsvyn ersätts med en enkel grid/tabellrad per produkt, utan tidigare grupp-collapse-logik.

När du godkänner gör jag exakt detta — återställer kolumnerna och tar endast bort företagsnamn ur produktkolumnen.