# Plan

## Mål
- Planeringsvyn ska visa alla valda dagar per fas, inte bara första dagen.
- Ändrade datum i sheeten ska vara lokala utkast tills användaren klickar **Planera hela bokningen**.
- Ingen ny sanningskälla: fortsatt samma modell som personalkalendern med `bookings` primärdatum + `calendar_events` för extra dagar.

## Vad jag bygger
1. **Inför lokalt utkast i BookingPlannerSheet**
   - Datumeditorn ska inte längre skriva direkt till databasen.
   - När användaren ändrar rigg/event/rigg ner sparas ändringen bara i sheetens lokala state.
   - UI:t uppdateras direkt i sheeten så användaren ser alla valda dagar innan något sparas.

2. **Planera-knappen blir enda commit för datum**
   - När användaren klickar **Planera hela bokningen** skickas de lokala datumutkasten vidare tillsammans med checkbox-valen.
   - För varje vald fas skrivs full daglista via samma flerdagslogik som personalkalendern använder.
   - Om användaren öppnar/stänger sheeten utan att klicka Planera ska inga datum skrivas.

3. **Säkerställ korrekt flerdagsvisning i planeringsvyn**
   - Sheeten ska alltid rendera från den fulla daglistan (`rig_dates`, `event_dates`, `rigdown_dates`) när den finns.
   - Dagräknarna under “Vad ska planeras nu?” ska baseras på samma lokala utkast, så att 3 valda dagar visas som 3 direkt.
   - Efter commit ska refetch ge samma resultat från läsmodellen.

4. **Testa regressionspunkterna**
   - Test för att ändrade datum i sheeten inte triggar skrivning direkt.
   - Test för att Planera skriver alla valda dagar för vald fas.
   - Test för att flerdagsvisningen och dagräknaren visar hela listan, inte bara första dagen.

## Tekniska detaljer
- Berörda filer:
  - `src/components/project/large-planner/BookingPlannerSheet.tsx`
  - `src/components/project/large-planner/LargeProjectPlannerPanel.tsx`
  - ev. `src/components/project/LargeProjectScheduleEditable.tsx` om callbacken behöver göras tydligare som draft-only
  - tester i `src/components/project/large-planner/__tests__/...`
- Jag återanvänder befintlig skrivväg (`savePhaseDays`) istället för att skapa nya tabeller/kolumner eller parallell logik.
- `onUpdateBookingSchedule` ändras från “skriv direkt” till “uppdatera utkast”, och själva DB-skrivningen flyttas till Planera-flödet.
- Jag behåller nuvarande read-model i `largeProjectPlannerService`, men verifierar att den fortsätter läsa full daglista från `calendar_events` + bokningens primärdatum efter commit.

## Resultat
Efter detta kan användaren välja flera datum, se dem direkt i planeringssheeten, och inget sparas förrän **Planera hela bokningen** klickas.