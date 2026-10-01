# Gör Booking till direkt källa för projektets orderrader

## Bekräftad orsak
- Den aktuella bokningen har **6 aktiva Booking-rader** (`sync_key` börjar med `src:`) och **33 aktiva WMS-projektionsrader** (`sync_key` börjar med `wms:`) i samma tabell.
- Projektvyn hämtar alla dessa rader och sorterar endast på `sort_index`. Därför blandas två olika listor, exempelvis två Transport-rader och flera UNIFLEX-rader.
- Den aktuella Booking-raden för glasvägg är **64 st**. Den felaktiga fristående WMS-raden är **36 st**.
- Att bara filtrera den lokala tabellen räcker inte: då kan projektvyn fortfarande ligga efter Booking. Projektvyn måste läsa samma livekälla som bokningssidan.

## Ändring
1. Låt Projektinfo hämta orderrader direkt från samma kanoniska Booking-läsning som bokningssidan använder.
2. Visa endast det aktuella Booking-svaret, i exakt dess radordning och med dess aktuella antal. Den lokala WMS-kopian på 36 får aldrig användas som fallback i projektets orderlista.
3. Återanvänd samma gruppering/renderingsregler som Booking-vyn så huvudprodukt, tillbehör och Transport visas i samma följd och utan WMS-dubletter.
4. Om Booking inte kan nås ska listan visa ett tydligt läsfel i stället för gammal lokal data. Det förhindrar att Planning presenterar felaktiga antal som sanning.
5. Behåll WMS-raderna orörda för Lager/Scanner. Ändra endast Planning-vyn och dess läscache; inga orderrader raderas eller skrivs om.

## Tester
- Lägg till komponent-/integrationstest med samma livekälla som bokningssidan och lås att:
  - huvudprodukt, fyra tillbehör och Transport renderas i exakt Booking-ordning,
  - glasväggen visar 64 st och aldrig den lokala WMS-kopians 36 st,
  - Transport och övriga rader inte dubbleras,
  - ett fel från Booking visar läsfel och inte gammal lokal data.
- Lås med ett kontraktstest att Projektinfo inte återgår till direkt läsning av `booking_products` för den kundsynliga orderlistan.
- Kör riktade Vitest, typecheck och build.
- Kontrollera preview visuellt utan produktionsskrivning. Ingen deploy/publicering.
