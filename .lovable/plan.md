Du har rätt. Det som är fel nu är att produktvyn fortfarande renderar bolags-/bokningsrubriker inne i själva produktlistan. Det ska bort.

Plan:
1. Rensa produktkolumnen helt
- Ta bort alla grupphuvuden med företagsnamn/bokningsnamn från `LargeProjectProductsOverview`.
- Den vita listytan under `Produkt:` ska bara innehålla produktrader.
- Inga kundnamn, inga bokningsnamn, inga adressfält i själva produktlistan.

2. Gör söket produkt-fokuserat
- Ändra sökningen så den filtrerar på produktnamn i stället för kund/adress/bolagslabel.
- Uppdatera placeholder till något i stil med `Sök produkt...` så UI:t matchar beteendet.

3. Städa bort fel UI som bygger på bolagsgruppering
- Ta bort renderingen och state som bara finns för att visa/kollapsa bolagsrubriker i produktkolumnen.
- Behåll full bredd på sökfältet/raden så layouten fortfarande känns luftig och enkel.

4. Verifiera resultatet visuellt
- Kontrollera att produktkortet bara visar produkter rad för rad.
- Kontrollera att inga bolagsnamn längre syns i listan, hover-state eller rubrikrader i produktdelen.

Tekniskt
- Felet ligger i `src/components/project/LargeProjectProductsOverview.tsx` där `g.label` renderas som en egen rad ovanför produkterna.
- Jag kommer ersätta den grupperade renderingen med en ren, platt lista av filtrerade produkter.
- Då försvinner också behovet av nuvarande grupp-collapse-logik i just produktvyn.

Godkänn så gör jag exakt den ändringen.