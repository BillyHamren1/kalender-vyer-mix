## Mål
Återställa veckolistan så att den visar samma plats-/projektdata som tidigare för varje person och dag, och endast behåller de UI-ändringar du bad om (direkt visning i listan + inline-karta).

## Plan
1. Byta tillbaka veckolistans datakälla till den kanoniska dagsnapshoten som tidigare visade rätt platser per person och dag.
2. Behålla den nya layouten i listan, men låta den rendera data från samma källa som dagvyn redan använder.
3. Ta bort den felaktiga batch-logiken ur det här flödet, eller begränsa den så att den inte längre får ändra platsmatchningen.
4. Säkerställa att platsnamn, projekt och warehouse/lager visas exakt enligt tidigare logik för respektive datum, utan att gamla/felaktiga jobb tar över.
5. Verifiera Markus-fallet och minst ett par andra personer i preview så att innehållet nu matchar tidigare beteende.
6. Köra riktade tester för GPS-veckoöversikten så att samma regression inte händer igen.

## Tekniska detaljer
- Problemet verkar vara att veckolistan nu använder `get-staff-gps-week-summary`, medan den tidigare korrekta logiken byggde på `get-mobile-staff-day-pings` / `useStaffGpsWeekSummary`.
- Den nya batch-källan använder en annan geofence-/platsmatchning än den tidigare dagskällan, vilket gör att innehållet ändras trots att bara layouten skulle ändras.
- Jag kommer därför att återkoppla listvyn till den tidigare sanningskällan för dagsdata och bara mappa om presentationen.
- Om batch-flödet får vara kvar görs det endast om det kan garanteras ge exakt samma resultat som dagsnapshoten; annars används det inte i den här vyn.

## Validering
- Kontroll i preview att veckolistan visar samma platser/projekt som tidigare, men i den nya layouten.
- Kontroll att inline-kartan fortfarande öppnas under raden och inte på ny sida.
- Riktade tester för att fånga att veckovyn inte får avvika från dagsnapshoten igen.