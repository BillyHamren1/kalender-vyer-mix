# Kontroll av packlistor från 19 september och framåt

Mål: alla bokningar med riggdag 2026-09-19 eller senare ska ha packlistor som följer senaste överenskommelsen — paketnamn som rubrik, paketmedlemmar och tillbehör åtskilda, inga dubblettrader, rätt antal, ej packningsbara rader överstrukna men inte räknade.

## Vad kontrollen visade (avläst i databasen nu)

37 bokningar har riggdag 19 sept eller senare. Av dem har 25 en packlista.

Tre tydliga problemgrupper:

1. **Gammal struktur (10 listor)** — raderna bär bara den gamla texten "Ingår i paket: X" och saknar uppdelning mellan paketmedlem och tillbehör:
   2603-101, 2609-24, 2608-50, 2607-7, 2609-10, 2606-26, 2606-50, 2608-29, 2608-36, 2609-5.
   I dessa listor saknar dessutom i princip alla rader koppling till bokningsraden, så relationen kan inte härledas lokalt — den måste hämtas från lagret.

2. **Tomma packlistor trots bekräftad bokning (6 st)** — 2609-29, 2609-30, 2609-31, 2609-33, 2609-34, 2609-35. Ingen enda rad finns.

3. **Korrekta enligt ny standard (2 st)** — 2609-41 och 2607-28 har riktig medlem/tillbehör-uppdelning och används som facit.

Ingen av listorna har packat antal ännu (allt är 0), vilket gör en omkörning ofarlig.

Dessutom finns rader vars namn börjar med gamla prefix ("-- " och "↳ ") och rader som ser ut som dubbletter av samma artikel inom samma lista. Om dessa är fel eller separata paketinstanser avgörs först när lagrets projektion svarar.

## Genomförande

1. **Kontrollkörning (läsning)** — hämta lagrets signerade projektion för varje av de 25 bokningarna och jämför mot den lokala listan: paketnamn, medlem kontra tillbehör, antal, packningsbarhet, dubbletter.
2. **Rättning där det är riskfritt** — för listor där lagret svarar korrekt körs projektionen in igen. Regler som gäller hela vägen:
   - inga rader raderas,
   - packat antal och kolli rörs aldrig,
   - befintliga bortvalda rader återupplivas aldrig,
   - en lista som redan har packat material lämnas orörd och rapporteras i stället.
3. **Rapport** — per bokningsnummer: före/efter antal rader, antal paket, medlemmar, tillbehör, ej packningsbara, samt kvarstående avvikelser och orsak.
4. **Andra körningen** — samma bokningar körs en gång till för att bevisa att inget dubbleras.

Bokningar som fortfarande ligger som offert och saknar packlista rapporteras men rörs inte.

## Tekniska detaljer

- Läsningen går via den signerade serverkopplingen mot lagrets projektion (`time-wms-outbound/outbound/projection`) med `PLANNING_WMS_HMAC_SECRET`; den gamla `get-packing-list`-vägen används inte.
- Varje anrop binds till verifierad organisation och användare; saknas aktör stoppas WMS-läsningen i stället för att gissa.
- Skrivning sker via befintlig idempotent synk (`sync-booking-to-packing` / `repair-packing-items`) — inga nya tabeller, inga migrationer, ingen bred backfill.
- Ett skript under `scripts/` driver körningen batchvis med loggad före/efter-räkning per bokning.
- Vitest-kontraktstest körs före och efter; resultatet redovisas.

## Öppen risk

Om lagrets projektion svarar med fel för en bokning kan den listans medlem/tillbehör-uppdelning inte återskapas. Sådana listor rapporteras som "kräver lagret" i stället för att lappas lokalt.
