# Plan: veckolistan ska visa exakt samma sak som detaljvyn

## Mål
Veckolistan ska inte längre ha någon egen ”sanning”. För varje person och dag ska den visa exakt samma GPS-pings, geofences och platsbesök som detaljvyn visar från `get-mobile-staff-day-pings`.

## Vad jag bygger
1. Byter veckolistans datakälla från egen batch-summary till dagssnapshot per person/dag
   - Slutar använda batch-resultatet som primär källa för besök/tider i listan.
   - Veckolistan bygger istället sin raddata direkt från samma snapshot-format som detaljvyn använder.
   - Om batch behålls alls blir den bara ett cache-/transportlager som returnerar exakt samma snapshotstruktur, utan egen summeringslogik.

2. Tar bort dubbel tolkning i veckolistan
   - Ingen separat batch-beräkning av `firstIso`, `lastIso`, `durationMin`, `visits` från annan payload än snapshoten.
   - Samma filtrering av privata platser som redan används när snapshoten renderas i UI.
   - Samma visit-ordning och samma platsnamn som i detaljvyn.

3. Gör batch-endpointen 1:1 med detaljendpointen
   - `get-staff-gps-week-summary` ska antingen:
     - returnera en samling fulla dagssnapshots per staff/dag, eller
     - returnera ett format som är mekaniskt kopierat från `get-mobile-staff-day-pings` utan egen alternativ logik.
   - Ingen separat ”summary-only”-representation som riskerar att avvika.

4. Låser konsekvens i frontend
   - `StaffGpsWeekList` och `StaffGpsWeekListRow` ska läsa samma besöksstruktur som inline-kartan redan visar.
   - Om inline-kartan säger Handelsbanken ska raden också säga Handelsbanken.
   - Om detaljvyn visar rå GPS som inte matchar warehouse ska listan inte få summera allt till warehouse.

5. Lägger regressionstester
   - Test att veckolistans raddata för en dag blir identisk med snapshotens visits.
   - Test att batchsvaret och `get-mobile-staff-day-pings` ger samma platsnamn och tider för samma input.
   - Test för fallet där GPS ligger utanför warehouse men nära annan giltig dagsgeofence, så att all tid inte felaktigt hamnar på warehouse.

6. Verifiering
   - Kör riktade tester för hook + karta/lista.
   - Validerar i preview att en öppnad dagsrad i listan och detaljvyn visar samma platser/tider för samma person/dag.

## Tekniska detaljer
- Troliga filer:
  - `src/hooks/staff/useStaffGpsWeekSummaryBatch.ts`
  - `src/components/staff/StaffGpsWeekList.tsx`
  - `src/components/staff/StaffGpsWeekListRow.tsx`
  - `supabase/functions/get-staff-gps-week-summary/index.ts`
  - ev. `src/hooks/staff/__tests__/useStaffGpsWeekSummaryBatch.test.ts`
- Detaljvyns nuvarande källa som ska vara facit:
  - `src/hooks/useMobileStaffDayPings.ts`
  - `supabase/functions/get-mobile-staff-day-pings/index.ts`
  - `supabase/functions/_shared/staff-gps/buildVisits.ts`

## Förväntat resultat
- Lista, inline-karta och detaljvy visar samma verklighet.
- Ingen egen batch-tolkning kan längre flytta tid till warehouse eller byta platsnamn jämfört med detaljvyn.
- Om datat är fel efter detta, då ligger felet i den gemensamma snapshotkällan och inte i listan.