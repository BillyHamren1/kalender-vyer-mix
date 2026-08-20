# Packlistan ska alltid gå att skriva ut

## Vad som händer idag

Knappen "Skriv ut" i packlistevyn (DesktopChecklistView) är inte borttagen – den spärras av två kontroller från scanner-/WMS-härdningen:

1. **Integritetskontroll** mot bokningen: blockerar om kontrollen inte hunnit köra klart, misslyckats, eller om bokning och packlista inte matchar exakt.
2. **WMS-preflight**: blockerar så länge läget inte är exakt `pass` – alltså även `not_run`, `checking` och mjuka `warning`.

Eftersom WMS-panelen är hopfälld som standard syns bara en grå knapp utan tydlig orsak.

## Vad vi ändrar

1. **Utskrift blockeras aldrig.** Knappen är alltid klickbar, oavsett integritets- eller WMS-läge. `printBlocked` tas bort helt.
2. **Stämpel istället för spärr.** Är läget inte fullt verifierat skrivs listan ut med en tydlig markering i sidhuvudet: "PRELIMINÄR – ej WMS-verifierad" + datum/tid och kort orsak. Fullt verifierad lista skrivs ut som idag, utan stämpel.
3. **Statusen syns i vyn.** Bredvid knappen visas en liten varningsikon med text när något är overifierat, som fäller ut WMS-panelen vid klick – information, inte hinder.
4. **Scanning påverkas inte.** Spärrar för scanning/godkännande av ändringar ligger kvar oförändrade.

## Tekniska detaljer

- `src/components/packing/DesktopChecklistView.tsx`: ta bort `disabled={printBlocked}`, behåll härledningen enbart för att sätta `preliminaryNotice` och statusraden.
- `src/lib/packing/printPackingList.ts`: valfri `preliminaryNotice`-sträng som renderas i utskriftens sidhuvud.
- Inga ändringar i WMS-anrop, statusflöden eller databas.

## Verifiering

- Vitest-test som låser regeln: utskriftsknappen är aldrig disabled, och `blocked` / `warning` / `not_run` ger preliminär-stämpel medan `pass` inte gör det.
- Manuell koll i preview på en packlista i lagervyn.
