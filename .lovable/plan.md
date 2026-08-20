# Sluta varna i onödan – visa bara relevanta ändringar, och visa VAD som ändrats

## Problemet

Varningen "Packlistan får inte användas utan kontroll" listar bara "Artikel som inte längre finns i bokningen" – två gånger, utan namn.

Kontroll av databasen visar:

1. Det finns **inga** packrader i systemet som pekar på en raderad bokningsrad. Ingen artikel är alltså faktiskt borttagen i Booking här.
2. Raderna som flaggas är **paketrader** (paketets huvudrad, t.ex. "Multiflex 8x15", som har underliggande komponenter). Kontrollen räknar bara lövrader som förväntade, så paketets huvudrad hamnar utanför och rapporteras som avvikelse – utan namn.

Alltså: ett falskt, blockerande larm som dessutom inte går att förstå.

## Ny regel för när något får visas

En avvikelse mellan bokningen och packlistan visas **bara** när minst ett av dessa gäller:

- Det är **mindre än 14 dagar** kvar till riggdag/event (samma 14-dagarsregel som redan används för ändringshantering), eller
- **Packningen är påbörjad** (status är inte längre planering).

Är det längre kvar och packningen inte startat: ingen banner, inget larm, inget blockeringsläge. Ändringen fångas ändå upp av den vanliga bokning→packning-synken.

Dessutom:

- **Paketrader räknas aldrig som avvikelse.** De är en normal följd av hur paket packas.
- När något väl visas är det **"ändrad", inte "får inte användas"** – tonen sänks till en informativ ändringsnotis. Packlistan blockeras inte längre av själva jämförelsen.

## Vad notisen ska säga

Alltid med namn, antal och orsak, t.ex.:

- "Borttagen i bokningen: Bardisk vit (2 st) ligger kvar på packlistan."
- "Antal ändrat: Uniflexgolv 175 st → 150 st."
- "Tillagd i bokningen: Mastertent 3x3 (1 st) saknas på packlistan."

Med bokningsnummer när packlistan omfattar flera bokningar, och en kort rubrik i stil med "3 ändringar sedan packlistan skapades – 6 dagar till rigg".

## Teknisk detalj

- `src/lib/packing/packingIntegrity.ts`: ta emot hela produktlistan (inte bara lövrader) så namn/antal/SKU alltid finns; ta bort paketrader ur avvikelserna; byt `orphan_item` mot `removed_in_booking`; behåll `missing_item`/`quantity_mismatch` men som "ändring", inte blockering.
- Ny relevansgrind som återanvänder `PACKING_SHORT_NOTICE_DAYS`/`daysUntil` i `src/lib/packing/shortNoticeChange.ts` plus packningens status. Returnerar inga avvikelser alls när grinden är stängd.
- `src/hooks/usePackingList.tsx`: skicka med riggdatum/eventdatum, packningsstatus och bokningsnummer till jämförelsen.
- `src/components/packing/PackingIntegrityBanner.tsx`: neutral "Ändringar från bokningen"-notis med namngivna rader; ingen banner när grinden är stängd eller när allt matchar.
- Tester i `src/__tests__/packingIntegrity.test.ts`: paketrader ger noll avvikelser; >14 dagar och ej påbörjad packning ger noll avvikelser; <14 dagar eller påbörjad packning ger namngivna ändringar.

Kontrollen förblir strikt read-only – inga packrader läggs till, ändras eller tas bort.
