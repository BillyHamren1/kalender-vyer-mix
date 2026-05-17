## Mål
Få veckovyn i `/calendar` att verkligen kunna visa fler teamkolumner utan att de klipps bort, samtidigt som `Lager` alltid ligger längst till höger och teamväljaren förblir nåbar.

## Plan
1. Rensa bort motstridiga overflow-regler i kalenderns dagkort.
   - Uppdatera `src/components/Calendar/TimeGrid.tsx` så både headern och tidsgridens innehåll kan scrolla horisontellt tillsammans inom dagkortet.
   - Ta bort inline/CSS-regler som fortfarande tvingar `overflow-x: hidden` på den scrollbara delen.

2. Sluta återinföra klippning via CSS-lager ovanpå komponenten.
   - Justera `src/components/Calendar/TimeGrid.css` så `.time-grid-with-staff-header`, `.day-card` och `.time-grid-scrollable-content` inte motverkar horisontell scroll.
   - Justera `src/components/Calendar/Carousel3DStyles.css` så `.weekly-day-card .day-card` inte sätter `overflow: hidden` och därmed kapar extra teamkolumner.

3. Säkerställ att veckovyns wrappers inte stryper innehållet.
   - Gå igenom `src/components/Calendar/CustomCalendar.tsx` och `src/pages/CustomCalendarPage.tsx` så yttre containrar fortfarande kan ha korrekt höjd men inte blockerar intern horisontell scroll i varje dagkort.
   - Behåll nuvarande logik för att `Lager`/`transport` ligger sist i resource-listan och alltid är synlig som kolumn när man scrollar åt höger.

4. Validera beteendet i appen innan något kallas fixat.
   - Testa i preview att: standardvyn visar `Lager` längst till höger, knappen för teamval syns, fler team kan slås på, och nya kolumner blir åtkomliga via horisontell scroll i dagcontainern.
   - Köra relevant testfil för synliga team/defaults och lägga till/uppdatera test om det saknas skydd för denna regression.

## Tekniska detaljer
- Filer som sannolikt ändras:
  - `src/components/Calendar/TimeGrid.tsx`
  - `src/components/Calendar/TimeGrid.css`
  - `src/components/Calendar/Carousel3DStyles.css`
  - eventuellt `src/components/Calendar/CustomCalendar.tsx`
  - eventuellt `src/pages/CustomCalendarPage.tsx`
- Fokus är layout/scroll i frontend, inte affärslogik eller datamodell.
- Jag kommer inte säga att det är löst förrän previewn faktiskt visar att dagcontainern går att scrolla och att högerkolumnen nås.