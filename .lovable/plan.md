## Problem

I personalkalendern breddas team-kolumnen automatiskt när två events ligger samtidigt — varje "lane" får full kolumnbredd (`TEAM_COLUMN_WIDTH × antal lanes`). I projektkalendern händer det inte, så två RIGG-block trycks ihop i samma smala kolumn (se vänster i skärmdumpen).

## Rotorsak

`ProjectCalendarView.tsx` skickar in `timeGridFullWidth` på `CustomCalendar`, vilket sätter `fullWidth=true` i `TimeGrid`. I `TimeGrid` skrivs då header- och slots-kolumnernas `width`/`minWidth` till `auto`/`0`, vilket helt ignorerar det redan beräknade `teamColumnWidths[index]` (som innehåller overlap-bredden). Resultat: overlap-laning beräknas, men kolumnen växer aldrig.

Personalkalendern kör utan `timeGridFullWidth` och får därför fasta kolumnbredder som växer när `maxOverlapPerResource[i] > 1`.

## Lösning (minimal, frontend-only)

Behåll `fullWidth`-flexbeteendet för "normalfallet", men låt overlap-bredden vinna när den finns. Konkret: när `teamColumnWidths[i]` är större än standard `TEAM_COLUMN_WIDTH` (dvs. det finns overlap eller >5 personer), ska kolumnen få den bredden som `minWidth` även i fullWidth-läge — precis som i personalkalendern.

### Ändringar i `src/components/Calendar/TimeGrid.tsx`

1. Inför `effectiveMinWidth = colWidth > TEAM_COLUMN_WIDTH ? colWidth : (fullWidth ? 0 : colWidth)` per kolumn.
2. Använd `effectiveMinWidth` i de tre styles som idag har `minWidth: fullWidth ? 0 : colWidth` (header row 2, staff row 3, samt `SimpleTimeSlot.fixedWidth`). `width` får fortsätta vara `auto` i fullWidth-läge så normalfallet flexar lika som idag.
3. Skicka alltid med `colWidth` till `EventWrapper` (gör vi redan) så lane-procenten räknas korrekt.

Detta påverkar både projektkalendern (som kör `timeGridFullWidth`) och personalkalendern (oförändrad: den kör utan fullWidth, så uttrycket landar på samma `colWidth` som idag).

### Verifiering

- Öppna ett projekt med två RIGG-bokningar samma dag på samma team → kolumnen ska nu växa till två lane-bredder, exakt som höger sida i skärmdumpen.
- Personalkalender (`/calendar`) ska se identisk ut som tidigare.
- Kör `bunx vitest run src/components/Calendar` för att fånga regressioner i timeGridLayout/parity-tester.

## Förbjudet i denna ändring

- Ingen ändring av `computeOverlapLayout`, `getEventPosition`, `ProjectCalendarView`, eller data-/skrivvägar.
- Ingen ändring av personalkalenderns rytm/breddkonstanter (`SLOT_PX`, `COL_MIN`, `RAIL_PX`).
- Inga backend-, hook- eller schemändringar.
