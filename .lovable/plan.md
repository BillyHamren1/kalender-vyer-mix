# Plan

## Mål
Fixa att bokningar i projektkalendern fortfarande kan hamna fel när två händelser ligger nära eller överlappar i samma teamkolumn, så att de alltid placeras deterministiskt och läsbart.

## Vad jag kommer att ändra
1. **Stabilisera overlap-algoritmen i den delade TimeGrid-layouten**
   - Byta ut nuvarande gruppering i `src/components/Calendar/timeGridLayout.ts` mot en korrekt sweep/cluster-beräkning som hanterar transitiva överlapp.
   - Säkerställa att om A överlappar B och B överlappar C så hamnar alla i samma kluster innan lane-bredd och position räknas ut.

2. **Behålla projektkalendern på delad layout men få rätt rendering**
   - Låta `src/components/Calendar/TimeGrid.tsx` fortsätta använda samma delade layoutmotor, men verifiera att kolumnbredden verkligen bygger på korrekt maxantal samtidiga lanes.
   - Kontrollera att inga projekt-specifika CSS-regler i `src/components/project/ProjectCalendarView.css` maskerar eller klipper rätt placement.

3. **Skydda rendering för kantfall**
   - Verifiera korrekt beteende för:
     - exakt angränsande tider (t.ex. 12–14 följt av 14–16)
     - delvis överlapp
     - kedjeöverlapp (A↔B↔C)
     - flera event i samma resource på samma dag

4. **Lägga till regressionsskydd**
   - Skapa/utöka tester för `computeOverlapLayout` så buggen inte kommer tillbaka.
   - Täcka både vanliga överlapp och just det fall där separata grupper tidigare kunde bildas felaktigt.

5. **Validera i preview**
   - Verifiera i projektkalendern/etableringsvyn att korten faktiskt lägger sig korrekt efter ändringen.
   - Köra relevanta automatiska tester efter ändringen.

## Filer som sannolikt ändras
- `src/components/Calendar/timeGridLayout.ts`
- `src/components/Calendar/TimeGrid.tsx` (om liten justering krävs efter ny layout)
- `src/components/project/ProjectCalendarView.css` (endast om clipping behöver justeras)
- ny eller uppdaterad testfil under `src/components/Calendar/__tests__/` eller närliggande testkatalog

## Teknisk not
Rotorsaken ser ut att vara i den delade overlap-logiken, inte i själva Establishment-sidan. `ProjectCalendarView` återanvänder `CustomCalendar -> TimeGrid -> computeOverlapLayout`, så en fix där bör rätta både projektkalendern och andra vyer som använder samma layoutmotor utan att ändra affärslogik eller datakällor.