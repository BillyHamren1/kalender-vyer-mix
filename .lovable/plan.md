# Varför packlistans utskrift är grå – och hur vi fixar det

## Vad som faktiskt händer

Knappen "Skriv ut" i packlistevyn (DesktopChecklistView) är inte borttagen – den spärras av två kontroller som infördes med scanner-/WMS-härdningen:

1. **Integritetskontroll** mot bokningen: utskrift blockeras om kontrollen inte hunnit köra klart, misslyckats, eller om bokning och packlista inte matchar exakt.
2. **WMS-preflight**: utskrift blockeras så länge preflight-läget inte är exakt `pass`. Det betyder att även `not_run` (innan kontrollen kört), `checking` (medan den kör) och `warning` (mjuka varningar) ger grå knapp.

Eftersom WMS-panelen numera är hopfälld som standard ser man inte varför knappen är grå – bara en grå knapp med en tooltip.

## Vad vi ändrar (endast UI/villkor, ingen ändring av packlogiken)

1. **Lås inte utskrift på mjuka lägen.** Endast hårda lägen blockerar:
   - WMS: blockera bara vid `blocked`.
   - Integritet: blockera bara vid bekräftad avvikelse (källa tillgänglig och ingen exakt match).
   - `not_run` / `checking` / `warning` / tillfälliga fel blockerar inte längre.
2. **Preliminär utskrift.** När något är osäkert (warning, ej körd kontroll, integritetsfel) skrivs listan ut med en tydlig stämpel i sidhuvudet: "PRELIMINÄR – ej WMS-verifierad" + datum/tid. Fullt verifierad lista skrivs ut som idag utan stämpel.
3. **Synlig orsak.** Vid faktisk blockering visas en liten röd text/varningsikon bredvid knappen med orsaken och en knapp som fäller ut WMS-panelen, istället för bara tooltip.

## Tekniska detaljer

- `src/components/packing/DesktopChecklistView.tsx`: skriv om `integrityBlocked` / `wmsBlocked` / `printBlocked` enligt ovan, lägg till `printPreliminary`-flagga som skickas till utskriften och styr orsaksraden.
- `src/lib/packing/printPackingList.ts`: ta emot valfri `preliminaryNotice`-sträng och rendera den i utskriftens sidhuvud.
- Inga ändringar i scanning, WMS-anrop, statusflöden eller databas – scanning förblir spärrad vid ogodkända ändringar precis som idag.

## Verifiering

- Vitest-test som låser regeln: `blocked` → utskrift spärrad; `warning` / `not_run` → utskrift tillåten men markerad preliminär.
- Manuell koll i preview på en packlista i lagervyn: knappen ska vara klickbar och PDF:en få rätt stämpel.
