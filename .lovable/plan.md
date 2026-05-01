Jag har lokaliserat exakt det du pekar på. Det handlar inte om namnen utan om tre separata UI-fel i projektkalendern.

Plan

1. Återställ samma kortform som personalkalendern
- Ta bort projekt-specifik CSS som gör dagkortet kantigt.
- Behåll bara fasfärgningen i själva toppraden (grön/gul/röd), men låt kortet i övrigt använda samma rundade hörn som vanliga kalendern.
- Resultat: den gröna kalendern får samma rundade form som den lila, istället för platt/square look.

2. Ta bort det tomma vita området till höger
- Projektkalendern renderas idag i breda dagkort, men själva TimeGriden kör fortfarande fast kolumnbredd. Därför fyller inte innehållet hela kortets bredd.
- Slå på fullbreddslayout för projektkalenderns TimeGrid så teamkolumnerna stretchar ut över hela kortet och högra TIME-kolumnen hamnar längst ut.
- Resultat: inget dött vitt fält till höger.

3. Gör “lägg till kolumner”-kontrollen tydlig igen
- Den kompakta team/people-kontrollen är hårdkodad med vit text och vit translucent bakgrund. På den ljusgröna headern blir den nästan osynlig.
- Anpassa den för projektkalenderns ljusa fasbakgrunder så ikon, siffra och pill får mörk kontrast och syns tydligt.
- Säkerställ att den fortfarande öppnar samma teamväljare så fler kolumner kan visas precis som i vanliga kalendern.

4. Behåll övrig projektlogik oförändrad
- Ingen ändring i vilka projekt-dagar som visas.
- Ingen ändring i booking-filtrering eller staff-logik.
- Bara visuell/layout-paritet med personalkalendern.

Tekniska detaljer

Berörda filer:
- `src/components/project/ProjectCalendarView.css`
- `src/components/project/ProjectCalendarView.tsx`
- `src/components/Calendar/TeamVisibilityControl.tsx`
- eventuellt en liten justering i `src/components/Calendar/TimeGrid.css` om det behövs för kontrast/paritet

Identifierade rotorsaker:
- `ProjectCalendarView.css` sätter idag `border-radius: 0 !important` på `.day-card` och `.time-grid-with-staff-header`, vilket tar bort de rundade hörnen.
- `ProjectCalendarView.tsx` skickar inte in fullbreddsläge till `CustomCalendar`, så `TimeGrid` använder fast kolumnbredd och lämnar tom yta i projektkortet.
- `TeamVisibilityControl.tsx` använder kompaktknappen `bg-white/20 text-white`, vilket fungerar på lila header men nästan försvinner på ljusgrön/röd/gul header.

QA efter implementation
- Kontrollera att projektkalenderns dagkort har rundade hörn.
- Kontrollera att högersidan inte längre har tom vit yta.
- Kontrollera att people/teams-knappen syns tydligt i toppraden.
- Kontrollera att det fortfarande går att visa fler teamkolumner från den knappen.
- Kontrollera att teamens `+`-knappar fortfarande syns och fungerar.

Om du godkänner kör jag exakt denna fix.