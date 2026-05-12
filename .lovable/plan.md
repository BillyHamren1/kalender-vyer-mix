# Plan

## Mål
Fixa varför block i `/staff-management/time-reports` ser ut att fortsätta framåt i tiden eller ligga ovanpå varandra, utan att gissa eller maskera problemet i UI.

## Bekräftat från underlaget
Session replayn visar att sidan faktiskt renderade två separata Gantt-block i ett av fallen:
- `FA Warehouse · 07:56– pågår · 7 h 14 min`
- `FA Warehouse · 06:55–14:45 · 7 h 50 min`

Det betyder att problemet inte bara är text eller CSS. Det finns ett riktigt dubbelt/överlappande underlag i blockdatan, och den visuella Gantt-layouten gör det ännu svårare att förstå.

## Lösningen

### 1. Isolera exakt vilken datakälla som dubblar blocket
Jag går hela vägen från:
- `get-staff-presence-day`
- `reportCandidateByStaff`
- `blocksFromStaff(...)`
- renderingen i `StaffGanttView`

Målet är att fastställa om dubletten uppstår i:
- backendens `reportCandidateBlocks`,
- kombinationen av `reportCandidateBlocks` + fallback/journal,
- eller i frontendens egen blockmappning.

### 2. Dela upp felet i två separata buggar
Jag kommer behandla detta som två problem som måste lösas var för sig:

**A. Databugg / dubbla block**
- samma mål/dag verkar kunna ge både ett avslutat block och ett "pågår"-block samtidigt
- jag verifierar om detta är legitimt eller om det är en felaktig dubbelrepresentation av samma aktivitet
- om det är samma aktivitet ska de slås ihop eller så ska den felaktiga ena representationen filtreras bort vid rätt nivå

**B. Visuell positionsbugg**
- även när blocken överlappar ska inget block få fel `top` eller `height`
- ett block med t.ex. `08:17–15:04` ska alltid sluta vid `15:04` visuellt
- underliggande transportblock får aldrig dra ut det gröna blocket nedåt

### 3. Fixa källan före presentationen
Om backend skickar två versioner av samma aktivitet kommer jag inte “dölja” det med CSS. Då blir lösningen:
- att normalisera blocken där de skapas, eller
- att lägga en explicit deterministic dedupe/merge-regel i frontendens blockbyggare om UI-lagret är rätt nivå för det.

### 4. Göra Gantt-positioneringen testbar
Jag flyttar positionslogiken till en liten pure helper så att vi kan testa:
- `top`
- `height`
- lane-fördelning vid äkta överlapp
- att ongoing-block inte renderas längre än sitt faktiska `endAt`

### 5. Lägga riktade regressionstester
Jag lägger testfall för exakt det här scenariot:
- ett avslutat block + ett öppet block på samma target
- ett block som inte får fortsätta visuellt efter sitt `endAt`
- transportblock under som inte får påverka föregående blocks höjd
- dubbla samma-target-block som antingen ska finnas som två separata rader eller slås ihop enligt regel

### 6. Verifiera i preview med samma typ av bildbevis
Efter fixen verifierar jag med:
- riktade Vitest-tester
- preview-screenshot
- zoom på samma område där du visade att blocket gick för långt ned

## Berörda filer
- `src/components/staff/StaffGanttView.tsx`
- `src/pages/StaffTimeReports.tsx`
- eventuellt `src/lib/staff/` för ny helper/dedupe-logik
- testfiler i `src/test/` eller `src/lib/staff/__tests__/`

## Förväntat resultat
- samma aktivitet visas inte felaktigt två gånger
- om två block verkligen finns ska det vara för att de faktiskt är två olika underlag
- ett grönt block slutar exakt där dess klockslag säger, inte längre ned i framtiden
- transportblock under påverkar inte höjden på blocket ovanför