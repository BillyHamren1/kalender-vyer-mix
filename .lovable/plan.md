# Plan för veckovyn

## Mål
Veckovyn ska bete sig så här:
- hela veckan får scrolla horisontellt
- varje dagkort ska få den bredd som krävs för dagens synliga team
- inga teamkolumner inne i dagkortet ska kapas eller pressas ihop för att få plats med 7 dagar samtidigt
- Lager ska fortsatt ligga längst till höger i varje dag

## Vad jag kommer att ändra

1. **Återställa veckocontainerns ansvar**
   - Låta `.weekly-horizontal-grid` vara den enda horisontellt scrollbara containern.
   - Ta bort logik som försöker tvinga in alla 7 dagkort inom viewportens bredd.

2. **Låta dagkortets bredd styras av sitt faktiska innehåll**
   - Sluta använda `timeGridFullWidth` i veckoläget.
   - Låta `TimeGrid` beräkna faktisk totalbredd utifrån tidskolumn + dagens synliga teamkolumner i stället för att alltid använda `100%`.
   - Se till att ett dagkort inte krymper mindre än den beräknade gridbredden.

3. **Behålla dagens auto-filtrering av team**
   - Veckovyn ska fortfarande bara visa team som faktiskt har jobb den dagen, plus manuellt valda team och Lager.
   - Det gör att dagkortet blir så brett som det behöver vara, men inte bredare.

4. **Rätta CSS som idag klipper eller pressar innehållet**
   - Justera `.weekly-day-card` så att den använder innehållsbredd i stället för `flex: 1 1 0`.
   - Säkerställa att `.day-card` och grid-wrappern inte orsakar intern horisontell scroll eller dold klippning av teamkolumner.
   - Behålla vertikal scroll för tider/events inne i dagen.

5. **Verifiering**
   - Testa i preview att veckoraden går att scrolla i sidled.
   - Kontrollera att en dag med fler team blir bredare än en dag med färre team.
   - Kontrollera att teamrubriker, personalrader och eventkort inte kapas.
   - Köra relevanta Vitest-tester efter ändringen.

## Tekniska detaljer
Berörda filer:
- `src/components/Calendar/TimeGrid.tsx`
- `src/components/Calendar/TimeGridEventLayer.tsx`
- `src/components/Calendar/CustomCalendar.tsx`
- `src/components/Calendar/Carousel3DStyles.css`
- eventuellt `src/components/Calendar/TimeGrid.css` om någon overflow-regel fortfarande motverkar layouten

Förväntad slutlayout:
```text
[ Dag 1 = 2 team bred ] [ Dag 2 = 3 team bred ] [ Dag 3 = 2 team bred ] ...
<---------------- hela raden scrollar horisontellt ---------------->
```

Det viktiga är att veckovyn scrollar på utsidan, inte att dagkorten scrollar på insidan.