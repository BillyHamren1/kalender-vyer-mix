# Plan: byt till rätt Personalkalender i placeringsdialogen

## Mål
Vänstersidan i placeringsdialogen ska matcha **bild 1**: den riktiga Personalkalendern från planeringen, med lila dagkort, personalrader och riktiga bokningskort. Den ska inte se ut som **bild 2** med tom teal-header.

## Jag kommer att göra
1. Byta referensen i placeringsdialogen från den publika/read-only-varianten till samma kalenderupplägg som används i Planning.
2. Göra `PlacementDayCalendar` till en riktig **dagvy** som återanvänder planeringens kalenderbeteende i stället för nuvarande förenklade weekly/read-only-rendering.
3. Koppla in samma stöd som planeringskalendern använder för att visa rätt innehåll i dagkortet:
   - personalrader per team
   - synliga team för vald dag
   - lagerkolumn där den ska finnas
   - riktiga kalenderkort i samma layout
4. Behålla dialogens behov oförändrade:
   - fokusdatum från högerpanelen ska styra vänster kalender
   - inga nya projekt ska skapas i förväg
   - kalendern i dialogen ska vara ett planeringsunderlag, inte en ny separat kalenderprodukt
5. Justera wrapper/CSS så att den inbäddade planeringskalendern får rätt höjd och inte faller tillbaka till fel layout.
6. Verifiera direkt i preview mot din referens: samma visuella familj som bild 1, inte bild 2.
7. Köra relevanta tester och vid behov lägga till ett regressionstest så att dialogen fortsätter använda rätt kalenderläge framåt.

## Förväntat resultat
- Lila dagkort som i bild 1
- Teamrubriker och personalrader överst
- Faktiska bokningskort i tidsytan
- Samma typ av planeringskalender som användaren redan känner igen
- Ingen återgång till den tomma teal-varianten

## Tekniska detaljer
- Huvudfil: `src/components/project/PlacementDayCalendar.tsx`
- Trolig följdjustering: `src/components/project/PlacementDayCalendar.css`
- Referensimplementation: `src/pages/CustomCalendarPage.tsx` och `src/components/Calendar/TimeGrid.tsx`
- Jag undviker backend/databasändringar här; detta ska lösas i frontendens kalenderkoppling

## Validering
- Öppna placeringsdialogen i preview
- Kontrollera att vänster kalender visuellt matchar bild 1
- Kontrollera att vald dag från högerpanelen speglas korrekt
- Bekräfta att teal-varianten från bild 2 inte längre renderas i detta flöde