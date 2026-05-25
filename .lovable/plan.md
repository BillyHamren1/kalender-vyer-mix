## Mål
Få previewn att faktiskt visa de återställda start-/sluttiderna, utan att ändra någon hem-/privatlogik.

## Plan
1. Verifiera vilken källa previewn använder just nu för raden i GPS-vyn.
   - Jämför edge function-svaret med vad komponenten renderar.
   - Bekräfta om felet ligger i stale deploy/cache eller i klientens datalager.

2. Säkerställ att rätt version av `get-staff-gps-week-summary` används av previewn.
   - Om edge-funktionen inte är deployad i den miljö previewn anropar: deploya rätt version.
   - Om previewn har fastnat i gammal data: tvinga omhämtning/invalidiering på rätt React Query-nyckel eller restarta relevant preview-flöde.

3. Validera exakt på den dag du pekade ut.
   - Kontrollera att raden visar återställda tider från svaret.
   - Bekräfta att endast start/slut påverkas och att övrig klassificering lämnas orörd.

## Tekniska detaljer
- `StaffGpsDayRow.tsx` renderar redan `summary.firstIso` och `summary.lastIso` direkt.
- `useStaffGpsWeekSummary.ts` mappar också värdena rakt igenom utan extra tolkning.
- Nätverkssnapshoten visar att backend-svaret redan innehåller de korrekta tiderna för 2026-05-18 (`06:55–22:29`).
- Därför ska nästa steg fokusera på miljö/deploy/cache, inte ny affärslogik.