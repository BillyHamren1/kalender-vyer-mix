
Mål
- Få Lagerkalendern (/warehouse/calendar) att fungera igen och se/agera exakt som Personalplaneringen (/calendar) – samma 3D-kort, samma grid/breddutnyttjande, samma interaktioner – med enda avsiktliga skillnader:
  - lager-tema (färger/texter)
  - extra resurs “Packning” (resourceId: warehouse)
  - filter för lagerhändelsetyper
  - rigg/event/rigdown ska vara skrivskyddade i lagervyn

Vad som sannolikt hänt (rotorsak-hypoteser)
1) TimeGrid.tsx delas av både Personalplanering och Lagerkalender (via CustomCalendar). Ändringar i TimeGrid (Tillgängliga-kolumnen, gridTemplateColumns, widths, minWidth) kan ha gjort att lagervyns layout inte längre fyller sin container eller får fel kolumnberäkning.
2) Lagerkalenderns page-wrapper/layout skiljer sig från Personalplaneringen:
   - Personalplanering kör tydligt “h-screen flex flex-col” och en “flex-1 min-h-0 …” yta som ger kalendern korrekt höjd/utrymme.
   - WarehouseCalendarPage använder “min-h-screen” och andra paddings/containers, vilket ofta orsakar att barnkomponenter med “height:100% / flex:1 / min-height:0” inte får rätt höjd => kalendern “använder inte hela containern”.
3) Variant/tema-klasser och overflow-regler i Carousel3DStyles.css + day-card overflow kan förstärka problemet om föräldern inte ger korrekt höjd.

Plan (det jag kommer att implementera när du godkänner)
A) Repro & “diff-analys” (kodnivå)
- Identifiera exakt var WarehouseCalendarPage:s layout skiljer sig från CustomCalendarPage:
  - root wrapper (h-screen/flex/overflow)
  - content wrapper (flex-1 + min-h-0)
  - paddings som kan skapa “tom yta” eller göra att child inte kan växa
- Bekräfta att WarehouseCalendarPage och CustomCalendarPage använder samma kalenderkomponent (CustomCalendar + TimeGrid) och att de skickar “fullWidth={true}” (vilket de gör idag).

B) Gör WarehouseCalendarPage layout-identisk med CustomCalendarPage (för att eliminera container-problemet)
- Ändra WarehouseCalendarPage så att den använder samma layout-mönster som Personalplanering:
  - root: “h-screen flex flex-col … overflow-hidden”
  - content: “flex-1 min-h-0 …” (viktigt: min-h-0 så att inre scroll/height fungerar i flex)
- Behåll warehouse-specifika delar (WarehouseDayNavigationHeader/WeekNavigation variant=warehouse, filter-rad, dialoger), men placera dem i samma flex-struktur som Personalplanering:
  - Header/nav = fixed/top i flödet
  - Filterbar = naturlig höjd
  - Kalendercontainer = flex-1 min-h-0 så den tar allt resterande utrymme

C) Säkerställ att TimeGrid verkligen utnyttjar full bredd i “fullWidth” i båda vyer
- Granska TimeGrid.tsx för:
  - gridTemplateColumns när fullWidth=true
  - minWidth på header-celler och teamkolumner
  - eventuell “dayWidth” default (800) som kan påverka om någon style råkar använda dayWidth indirekt
- Implementera en konsekvent strategi:
  - fullWidth=true => total width = 100%
  - kolumnbredder:
    - timeColumnWidth = 80px (fast)
    - availableColumnWidth = (antingen 80–100px fast) (fast)
    - teamkolumner = repeat(n, minmax(120px, 1fr)) så de kan växa och använda all yta utan att skapa “dead space”
- Säkerställa att “day-header-teams” och andra header-wrappers inte sätter en hård maxWidth som begränsar bredden i fullWidth-läge.

D) “Exakt samma logik” mellan Personalplanering och Lagerkalender: avsiktliga skillnader isoleras
- Skapa/justera ett tydligt “shared base”-mönster (utan att byta ramverk), så att:
  - Personalplanering och Lagerkalender använder samma kalender-rendering (CustomCalendar + TimeGrid) och samma layoutprinciper
  - skillnaderna styrs av props/variant:
    - variant="warehouse"
    - isEventReadOnly(event)
    - onEventClick (lager: öppna BookingProductsDialog istället för navigering)
    - resources: rename “Lager 1…” + extra resource “warehouse”
    - filter: endast i WarehouseCalendarPage, påverkar vilka events som skickas in

E) Regression-säkring (för att undvika att vi “fixar” en vy och sabbar en annan igen)
- Efter ändringarna kontrollerar vi:
  - /calendar (personalplanering) weekly/monthly/list (desktop)
  - /warehouse/calendar weekly/monthly/list + day deep link (?view=day&date=YYYY-MM-DD)
  - att “Tillgängliga” kolumnen fortfarande fungerar och inte orsakar layout-brott
- Om det fortfarande finns problem:
  - lägger vi in en minimal debug-indikator (tillfälligt) som visar computed width/height i kalendercontainern (endast i dev) för att snabbt bekräfta om höjd/bredd kommer från layout vs grid.

Vilka filer som sannolikt ändras
- src/pages/WarehouseCalendarPage.tsx (huvudfix: layout/flex/min-h-0)
- src/components/Calendar/TimeGrid.tsx (kolumnbredd/minmax för att fylla yta robust i fullWidth)
- Ev. src/components/Calendar/TimeGrid.css (om någon klass sätter width/max-width/overflow som hindrar fullbredd)
- Ev. små justeringar i src/components/Calendar/Carousel3DStyles.css om card/day-card overflow/height måste matchas.

Testplan (du kan göra direkt i preview)
1) Gå till /warehouse/calendar och bekräfta:
   - kalendern fyller hela ytan (ingen “outnyttjad container”)
   - 3D-korten ser identiska ut med /calendar (förutom färg/labels)
2) Testa interaktioner:
   - klick på lager-event öppnar BookingProductsDialog
   - rigg/event/rigdown visar lås/är read-only i lagerkalendern (inga edit-popovers)
3) Testa day deep link:
   - /warehouse/calendar?view=day&date=YYYY-MM-DD
4) Testa /calendar så inget har regressat.

Om du vill att jag ska fortsätta efter detta plansteg
- Godkänn planen så implementerar jag detta i nästa körning (default mode) och testar igen i preview.