# Plan

## Mål
Få veckokalendern att använda tillgänglig höjd korrekt och ta bort den konstgjorda scroll som fortfarande syns längst ned.

## Vad jag kommer ändra
1. Ta bort den nuvarande `calendar-zoom-out`-lösningen i veckovyn som skalar hela gridet till `125%` och skapar falsk scroll i både bredd och höjd.
2. Låsa veckovyns höjdkedja från sida → content wrapper → `CustomCalendar` → `weekly-horizontal-grid` → `TimeGrid`, så att kalendern fyller ytan utan extra vit botten.
3. Separera horisontell scroll från vertikal scroll tydligare:
   - veckogriden ska bara hantera horisontell scroll
   - varje dags `TimeGrid` ska bara hantera vertikal scroll
4. Justera dagkorts-/grid-CSS så att korten inte längre expanderar artificiellt på höjden när innehållet skalas eller när scrollbar-banor räknas in.
5. Verifiera i preview att:
   - ingen extra tom yta ligger under gridet
   - den nedre scrollbaren bara visas när bredden faktiskt kräver det
   - vertikal scroll stannar inne i dagkortet
   - veckotabsen ligger kvar stabilt längst ned
6. Köra relevanta tester och lägga till en liten regressionskontroll om det behövs för att låsa scroll/höjd-beteendet.

## Tekniska detaljer
- Filer som sannolikt ändras:
  - `src/pages/CustomCalendarPage.tsx`
  - `src/components/Calendar/CustomCalendar.tsx`
  - `src/components/Calendar/Carousel3DStyles.css`
  - `src/components/Calendar/TimeGrid.css`
- Huvudorsaken jag hittade är att `.calendar-zoom-out .weekly-horizontal-grid` kör `transform: scale(0.8)` tillsammans med `width: 125%` och `height: 125%`, vilket driver fram fel scrollarea.
- Jag kommer ersätta den visuella “zoom”-effekten med riktig layoutanpassning i stället för transform-skalning.

## Resultat efter fix
Veckovyn ska fylla kortets höjd korrekt, inte skapa falsk botten-scroll, och scrollen ska kännas logisk: sidled för veckan, upp/ner inne i respektive dag.