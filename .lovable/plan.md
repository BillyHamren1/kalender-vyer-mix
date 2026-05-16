## Problem
I dialogen "Placera bokning" renderar `PlacementDayCalendar` den riktiga personalkalendern (`CustomCalendar`) i weekly-läge med en enda dag. Den globala CSS-regeln `.weekly-day-card { min-width: 400px; max-width: 600px; }` (i `src/components/Calendar/Carousel3DStyles.css`) gör att dagkortet kapas vid 600 px — därav den stora tomma ytan till höger som syns i skärmdumpen, trots att vänsterkolumnen i dialogen redan är `minmax(0,1fr)` och wrappern är `w-full`.

## Lösning
Lägg en scopad CSS-override på samma sätt som `ProjectCalendarView` redan gör för projektvyn, men för placement-dialogen.

### Steg

1. **`src/components/project/PlacementDayCalendar.tsx`**
   - Lägg klassen `placement-day-calendar` på den yttre wrappern (vid sidan av nuvarande `w-full`).
   - Importera den nya CSS-filen.

2. **Ny fil: `src/components/project/PlacementDayCalendar.css`**
   - Override scopad till `.placement-day-calendar`:
     - `.placement-day-calendar .weekly-horizontal-grid { padding: 0; overflow-x: hidden; }` (ingen horisontell scroll, ingen extra inre padding).
     - `.placement-day-calendar .weekly-day-card { flex: 1 1 auto; min-width: 0; max-width: none; width: 100%; }` (dagkortet får fylla hela tillgängliga bredden).
   - Ingen ändring av andra vyer — global `.weekly-day-card`-regeln är orörd.

3. **Ingen ändring** av `BookingPlacementDialog.tsx`-griden. `minmax(0,1fr)_320px` ger redan vänsterkolumnen all återstående bredd; problemet ligger bara i den inre kalendern.

### Inte ändras
- `CustomCalendar.tsx`, `TimeGrid`, datakällor, team-logik, eller andra vyers utseende.
- Höger-panelen (320 px bokningsinfo).

### Förväntat resultat
Kalendergrid + alla teamkolumner + tidsskala till höger fyller hela vänsterkolumnen i dialogen, utan horisontell scroll och utan tom yta.