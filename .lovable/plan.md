# Visa VAD som saknas/tagits bort i packlistans kontroll

## Problemet

Varningen säger bara "Artikel som inte längre finns i bokningen" – två gånger, utan namn. Det går inte att förstå vad det gäller.

Kontroll av databasen visar två saker:

1. Det finns **inga** packrader som pekar på en raderad bokningsrad i hela systemet just nu. Ingen artikel är alltså faktiskt borttagen i Booking.
2. De rader som flaggas är i stället **paketrader** (paketets huvudrad, t.ex. "Multiflex 8x15", som har underliggande komponenter). Kontrollen räknar bara "packbara" lövrader som förväntade, så paketets huvudrad hamnar utanför och rapporteras som avvikelse – och eftersom raden inte har något manuellt namn skrivs den generiska texten ut.

Så dagens larm är dels felformulerat, dels i det här fallet falskt blockerande.

## Åtgärd

1. **Namnge alltid raden.** Kontrollen får med sig produktens namn, antal, SKU och bokningsnummer även för rader som inte ingår i "förväntade" rader. Texten blir t.ex.:
   - "Multiflex 8x15 (1 st, SKU 12345) · bokning 2608-32".
2. **Skilj på tre helt olika fall** i stället för en enda gemensam text:
   - **Borttagen i bokningen** – bokningsraden finns inte längre: "Borttagen i bokningen: <namn> (<antal> st) ligger kvar på packlistan." (blockerande, som idag)
   - **Markerad som borttagen i källan** – raden finns kvar lokalt men är flaggad som saknad från Booking: samma tydliga text plus datum när den försvann. (blockerande)
   - **Paketets huvudrad** – raden är ett paket vars komponenter också ligger på listan: informativ rad, inte blockerande. Den är en normal följd av hur paket packas.
3. **Sammanfattningen blir konkret.** Rubriken visar t.ex. "2 avvikelser: 1 borttagen artikel, 1 antalsdiff" i stället för bara ett antal, och de tydligaste namnen visas direkt utan att man måste öppna "Detaljer".

Ingen packrad ändras, tas bort eller läggs till – kontrollen förblir strikt read-only.

## Teknisk detalj

- `src/lib/packing/packingIntegrity.ts`: låt jämförelsen ta emot hela produktlistan (inte bara lövrader) plus `source_missing_since`, och dela upp `orphan_item` i `removed_in_booking` (blockerande), `source_missing` (blockerande) och `package_header` (informativ). Namn/antal/SKU/bokning följer med i varje issue.
- `src/hooks/usePackingList.tsx`: hämta även `source_missing_since` och bokningsnummer så texterna kan byggas.
- `src/components/packing/PackingIntegrityBanner.tsx`: nya texter per typ och en kort sammanfattning i rubriken.
- `src/__tests__/packingIntegrity.test.ts`: nya testfall som låser att paketrader inte blockerar och att borttagna artiklar alltid namnges.
