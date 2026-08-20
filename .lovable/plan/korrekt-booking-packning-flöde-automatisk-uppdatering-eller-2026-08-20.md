# Korrekt Booking→packning-flöde: automatisk uppdatering eller lagerattest

## Problemet

Varningen "Packlistan får inte användas utan kontroll" listar bara "Artikel som inte längre finns i bokningen" – två gånger, utan namn.

Kontroll av databasen visar:

1. Det finns **inga** packrader i systemet som pekar på en raderad bokningsrad. Ingen artikel är alltså faktiskt borttagen i Booking här.
2. Raderna som flaggas är **paketrader** (paketets huvudrad, t.ex. "Multiflex 8x15", som har underliggande komponenter). Kontrollen räknar bara lövrader som förväntade, så paketets huvudrad hamnar utanför och rapporteras som avvikelse – utan namn.

Alltså: ett falskt, blockerande larm som dessutom inte går att förstå.

## Ny regel för hur ändringar ska verkställas

En ändring i Booking ska aldrig ligga kvar som en gammal, packbar rad. Den hanteras på ett av två sätt:

### Mer än 14 dagar kvar och packningen är inte påbörjad

- Ändringen appliceras **automatiskt och tyst** på packlistan.
- Borttagen artikel tas bort, tillagd artikel läggs till och ändrat antal uppdateras.
- Ingen banner, varning eller attest krävs.

### Mindre än 14 dagar kvar, eller packningen är påbörjad

- Ändringen köas och visas tydligt för Lager med produktnamn, antal och vad som hänt.
- Lager klickar **Ta emot** för att attestera ändringen.
- Direkt efter attest verkställs ändringen i packningen: en borttagen Booking-rad tas bort från den operativa packlistan, en ny rad läggs till och ett ändrat antal skrivs om.
- Notisen försvinner först när ändringen faktiskt är genomförd.
- Om artikeln redan har skannats/packats måste samma attestflöde först återföra den packade kvantiteten från kollit/packningen, så att ingen fysisk artikel eller WMS-allokering lämnas kvar på en rad som tas bort. Därefter tas raden bort.

Dessutom:

- **Paketrader räknas aldrig som avvikelse.** De är en normal följd av hur paket packas.
- När något visas heter det **"Bokningen har ändrats – Lager måste ta emot ändringen"**, inte den generiska texten "Packlistan får inte användas utan kontroll".
- Packningens kontroll/signering blockeras medan en relevant ändring väntar på attest, men inte av falska paketradsavvikelser.

## Vad notisen ska säga

Alltid med namn, antal och orsak, t.ex.:

- "Borttagen i bokningen: Bardisk vit (2 st) ligger kvar på packlistan."
- "Antal ändrat: Uniflexgolv 175 st → 150 st."
- "Tillagd i bokningen: Mastertent 3x3 (1 st) saknas på packlistan."

Med bokningsnummer när packlistan omfattar flera bokningar, och en kort rubrik i stil med "3 ändringar sedan packlistan skapades – 6 dagar till rigg".

## Teknisk detalj

- `sync-booking-to-packing`: dela skrivvägen vid 14-dagarsgränsen och packningsstatus. Normal/lång framförhållning appliceras direkt och idempotent; kort varsel eller påbörjad packning skapar `packing_change_requests` och lämnar packlistan fryst tills attest.
- `apply-packing-change-request`: gör attest och packlisteändring atomiskt. För `item_removed` tas raden bort; om den redan packats återförs skannad/allokerad kvantitet kontrollerat innan raden tas bort. Begäran markeras `applied` först när hela operationen lyckats.
- `packing_change_requests`: endast relevanta väntande attester ska visas. Normala ändringar över 14 dagar får inte ligga kvar som pending-rader.
- `src/lib/packing/packingIntegrity.ts`: ta emot hela produktlistan så namn/antal/SKU alltid finns och ignorera paketets huvudrader som normal struktur, inte avvikelse.
- `src/components/packing/PackingChangeRequestsPanel.tsx`: visa exakt ändring och låt **Ta emot** verkställa den; falska integritetslarm tas bort från `PackingIntegrityBanner`.
- Tester täcker: automatisk tyst borttagning över 14 dagar; kö/attest under 14 dagar; kö/attest när packning är påbörjad oavsett datum; redan packad artikel återförs och tas bort säkert; pakethuvud ger aldrig larm; inga pending-rader eller varningar blir kvar efter lyckad verkställning.

Att bara öppna sidan förblir strikt read-only. Ändringar sker endast genom Booking-synken (>14 dagar, ej startad) eller genom Lagers uttryckliga attest (<14 dagar eller påbörjad).
