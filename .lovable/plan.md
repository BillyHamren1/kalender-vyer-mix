# Ta bort felaktig blockering: paketrubriker flaggas som "borttagna artiklar"

## Vad som faktiskt är fel

Kontroll av just denna packlista visar två blockerande avvikelser:

- `Multiflex 6x15`
- `Kassettgolv 6x15 - Upp till 40cm`

Båda finns kvar i bokningen och är INTE borttagna (`source_missing_since` är tom). De är paketrubriker (huvudrader med underliggande komponenter). Integritetskontrollen räknar bort paketrubriker från "förväntade rader", men packlistan har historiskt en rad även för själva rubriken. Då hamnar raden i "orphan"-grenen och rapporteras som blockerande med den generiska texten "Artikel som inte längre finns i bokningen" — trots att inget är borttaget.

Alltså: varningen är ett falskt larm orsakat av paketrubriker, inte av någon Booking-ändring.

## Vad som ska göras

1. Paketrubriker ska aldrig ge avvikelse. En packlisterad vars bokningsrad fortfarande finns och är en rubrik (har barnrader) behandlas som strukturell rad — ingen blockering, ingen varning.
2. Riktiga borttagningar ska fortfarande synas, men bara via 14-dagarsflödet (attestpanelen) enligt tidigare beslut.
3. Namn i avvikelselistan ska alltid vara det riktiga produktnamnet + antal + SKU när raden går att härleda; den generiska texten används bara när ingen källinfo alls finns.
4. Efter fixen ska denna packlista visa "Stämmer med bokningen" utan blockering.

## Teknisk detalj

- `src/lib/packing/packingIntegrity.ts`: i orphan-slingan, hoppa över `productId` som finns bland `parentIds` (paketrubrik) och som fortfarande finns i `products`. Använd produktens `name`/`sku`/`quantity` för issue-texten istället för fallback-strängen.
- Verifiering: nytt testfall i `src/__tests__/` som matar in en paketrubrik med barnrader + en packlisterad för rubriken och förväntar `blockingCount === 0`, plus befintliga tester körs om (`bunx vitest run`).
