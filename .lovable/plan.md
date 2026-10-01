# Återställ exakt Booking-ordning i projektets orderrader

## Bekräftad orsak
- Den aktuella bokningen har **6 aktiva Booking-rader** (`sync_key` börjar med `src:`) och **33 aktiva WMS-projektionsrader** (`sync_key` börjar med `wms:`) i samma tabell.
- Projektvyn hämtar alla dessa rader och sorterar endast på `sort_index`. Därför blandas två olika listor, exempelvis två Transport-rader och flera UNIFLEX-rader.
- Den aktuella Booking-raden för glasvägg är **64 st**. Den felaktiga fristående WMS-raden är **36 st**.
- Ingen data behöver raderas eller skrivas om för att rätta visningen.

## Ändring
1. Låt Projektinfo välja Bookings kanoniska orderrader när sådana finns:
   - visa `src:`-rader i deras `sort_index`-ordning,
   - behåll rätt huvudprodukt–tillbehörsstruktur,
   - visa inte parallella `wms:`-projektionsrader i Projektinfo.
2. Behåll en säker fallback för äldre bokningar som saknar `src:`-identitet, så befintliga äldre orderrader inte försvinner.
3. Efter manuell uppdatering från Booking ska även produktlistans cache uppdateras, så ändrade antal och rader syns direkt utan omladdning.
4. Ändra endast presentation/cache i Planning. Booking-, WMS-, Scanner-, packnings- och importlogik lämnas orörda; inga databasrader raderas eller ändras.

## Tester
- Lägg till modelltester som låser:
  - Booking-rader vinner över WMS-rader när båda finns,
  - ordningen blir exakt `sort_index`-ordningen från Booking,
  - samma namn från Booking och WMS visas bara som Booking-raden,
  - glasväggsexemplet visar 64 st och inte 36 st,
  - legacy-bokningar utan `src:` fortfarande visas.
- Lägg till komponenttest för huvudprodukt, fyra tillbehör och Transport i rätt ordning utan dubletter.
- Kör riktade Vitest, typecheck och build.
- Kontrollera preview visuellt utan produktionsskrivning. Ingen deploy/publicering.
