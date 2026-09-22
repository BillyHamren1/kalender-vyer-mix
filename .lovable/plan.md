# Återställ korrekt paketstruktur i packlistor

## Resultat
- Paketnamnet visas som en egen tydlig grupprubrik.
- Paketets verkliga medlemmar ligger under avsnittet **Paketmedlemmar**.
- Separata ordertillbehör ligger under **Tillbehör** och blandas inte med paketmedlemmarna.
- Vanliga produkter behåller sin ordning och historiskt utfasade rader förblir dolda.

## Genomförande
1. Bevara WMS-relationen för varje fysisk rad: fristående produkt, paketmedlem eller tillbehör, inklusive föräldrapaketets namn och stabila rad-ID.
2. Bygg en gemensam, testbar presentationsstruktur som grupperar aktuella lagerrader utan att skapa eller dubbelräkna fysiska packrader.
3. Använd samma struktur i lagervyn och utskriften, med paketnamn som rubrik och separata undergrupper för medlemmar respektive tillbehör.
4. Behåll den kanoniska packregeln oförändrad: endast `excluded !== true && is_packable !== false` räknas, skannas och skrivs som packbar rad.
5. Lägg regressionsprov för paketnamn, medlems-/tillbehörsskillnad, ordning, utskrift och progress.
6. Kör riktade Vitest-prov, kontrollera previewbygget och driftsätt endast den berörda synkfunktionen om serverkoden ändras.

## Tekniskt
- Ingen schemaändring, delete eller bred backfill.
- Metadata uppdateras idempotent vid ordinarie WMS-synk; packat antal, kolli och historik påverkas inte.
- Äldre rader med den tidigare paketnoteringen kan fortfarande läsas säkert tills nästa synk kompletterar relationstypen.
