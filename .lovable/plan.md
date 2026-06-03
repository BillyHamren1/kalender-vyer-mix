## Plan

Jag återställer bara den senaste AI-kopplingen i tidrapportvyn och lämnar övrig attestvy orörd.

### Det som ska göras
1. Ta bort AI-renderingen från rapport­raderna i `StaffPayrollReportDayRow.tsx`.
   - ta bort `UnknownPlaceCell`
   - ta bort import/användning av `useUnknownPlaceAi`
   - låt `unknown_place` visas exakt som vanlig etikett igen, styrd enbart av befintlig `kindLabel`/matrisdata

2. Ta bort den fristående hooken och dess tester som kom med senaste AI-ändringen.
   - `src/hooks/staff-time/useUnknownPlaceAi.ts`
   - `src/hooks/staff-time/__tests__/useUnknownPlaceAi.test.tsx`

3. Säkerställa att ingen annan del av payroll-vyn längre refererar till den AI-funktionaliteten.
   - snabb kontroll av imports/referenser
   - ingen badge, ingen tooltip, ingen AI-text i aktivitetskolumnen

4. Verifiera efter ändringen.
   - preview: kontrollera att kända rader åter visas normalt
   - preview: kontrollera att endast systemets befintliga klassning visas, utan AI-badges
   - tester: köra relevanta automatiska tester så att vyn inte gått sönder

### Resultat
Efter detta är vyn tillbaka till samma radlogik som före senaste AI-ändringen: systemet visar sina vanliga block, och ingen AI-analys eller AI-etikett syns i rapporten.

### Tekniska detaljer
- Ingen ändring av klassningslogik, Time Engine, geofence-regler eller backend.
- Endast frontend-återställning av den senaste AI-presentationskopplingen i payroll-raderna.