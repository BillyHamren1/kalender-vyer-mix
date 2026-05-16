# Plan: visa alla planerade team i kalendern som standard

## Mål
Se till att `/calendar` inte längre döljer Team 5–10 när de har planerade jobb. Kalendern ska utgå från hela resurslistan som standard, inte från en gammal hårdkodad delmängd.

## Vad jag kommer att ändra

1. **Byta defaultkälla för synliga team i personalkalendern**
   - I `src/pages/CustomCalendarPage.tsx` ersätter jag den hårdkodade defaultlistan
     `['team-1', 'team-2', 'team-3', 'team-4', 'transport', 'team-11']`
     med en beräknad lista från aktuella `teamResources`.
   - Det gör att Team 5–10 inkluderas automatiskt.
   - `team-11` tas bort ur default eftersom team-hooken redan säger att Live-kolumnen är borttagen.

2. **Rätta låsningen i teamväljaren**
   - I samma fil uppdaterar jag toggle-logiken så att den inte fortfarande behandlar `team-11` som obligatorisk.
   - Jag låter obligatoriska team följa samma nya defaultkälla i stället för en separat gammal lista.

3. **Göra UI:t konsekvent med den nya sanningen**
   - I `src/components/Calendar/TeamVisibilityControl.tsx` synkar jag vilka team som markeras som “obligatorisk” med den nya standardmodellen.
   - Målet är att användaren inte ska se en meny som antyder gamla regler.

4. **Täppa igen övriga återstående planeringsvyer med samma risk**
   - Jag uppdaterar också de andra planeringsvyer som återanvänder samma gamla defaultmönster:
     - `src/components/ops-control/OpsPlanningDayPanel.tsx`
     - `src/components/project/ProjectCalendarView.tsx`
   - Fokus är att ta bort dolda team p.g.a. föråldrade defaultlistor, utan att ändra annan funktionalitet.

5. **Verifiering**
   - Jag lägger till/uppdaterar test som verifierar att:
     - alla resurser i standard-teamlistan visas initialt,
     - Team 5–10 inte filtreras bort av default,
     - `team-11` inte längre krävs eller injiceras,
     - användarval i `visibleTeamsByDay` fortfarande respekteras när något faktiskt sparats.
   - Efter kodändringen testar jag i preview att teamväljaren och kalenderkolumnerna beter sig rätt.

## Förväntat resultat
- Team 5–10 visas igen i `/calendar` när de finns i resurslistan.
- Ingen dold begränsning till Team 1–4 + Lager.
- Äldre `team-11`-antaganden försvinner från standardval och UI.
- Sparade användarval fortsätter fungera, men nya dagar får korrekt komplett standard.

## Tekniska detaljer

Rotorsak just nu:
- `useTeamResources` innehåller Team 1–10 och har tagit bort Live (`team-11`).
- `CustomCalendar` filtrerar resurser strikt via `getVisibleTeamsForDay(date)`.
- `CustomCalendarPage` returnerar fortfarande en gammal fallbacklista med bara Team 1–4 + `transport` + `team-11`.
- Därför försvinner Team 5–10 innan de ens renderas.

Berörda filer:
- `src/pages/CustomCalendarPage.tsx`
- `src/components/Calendar/TeamVisibilityControl.tsx`
- `src/components/ops-control/OpsPlanningDayPanel.tsx`
- `src/components/project/ProjectCalendarView.tsx`
- ev. ny liten helper om jag vill centralisera default-teamlogiken i en återanvändbar util

Vald riktning:
- Ingen backendändring.
- Ingen datamigrering.
- Endast frontendfix av filtreringslogik och dess tester.