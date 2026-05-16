## Problem

`PlacementDayCalendar` mountar `CustomCalendar` med `viewMode="day"`. Day-läget i `CustomCalendar` (rad 250–296) renderar en **3D-carousel** (`carousel-3d-wrapper` / `carousel-3d-container`) som är byggd för att svepa mellan flera dagar och kräver perspective + fixerad höjd från `Carousel3DStyles.css`. När vi skickar in **bara en dag** via `daysOverride={[targetDate]}` får containern ingen höjd → inget syns (det är precis vad skärmdumpen visar: tom rad, ingen TimeGrid).

Personalkalendern själv kör aldrig day-läge med en enda dag — den använder weekly-grid och låter användaren klicka på en dagrubrik för att öppna dagen fullskärm via `expandedDayDialog`.

## Fix

Rendera CustomCalendar i **weekly-läget men begränsa `daysOverride` till exakt en dag**. Då går renderingen genom `weekly-horizontal-grid` (rad 220–246) → `TimeGrid` direkt, vilket är samma kodväg personalkalendern faktiskt visar dagligen. En enda `weekly-day-card` växer naturligt till full bredd i container och får höjd från TimeGrid:s eget innehåll.

### Ändring

`src/components/project/PlacementDayCalendar.tsx`:
- `viewMode="weekly"` (i stället för `"day"`)
- Behåll `daysOverride={[targetDate]}` så bara den ena dagen visas
- Behåll `timeGridFullWidth` så TimeGriden fyller dialogen
- Inga andra ändringar; fortfarande read-only, samma events/resources/internalLager-merge

Inget övrigt rörs — wizardens logik, sparflöde och övriga steg är oförändrade.

## Verifiering

Öppna "Placera bokning" på en bokning i `/projects` → steg 1 ska nu visa samma TimeGrid (med team-kolumner och eventuella existerande bokningar/Lager-pass) som motsvarande dag i `/personalkalendern`.
