## Mål
Mobilens `/m/report` ska visa samma dagssanning som webbens tidrapportvy för samma person och datum, så fall som Raivis inte kan visa 09:00 i mobilen när webb/pings visar arbete till 18:00.

## Plan
1. Byt mobilens dagsvy från den alternativa cache-endpointen till den kanoniska dagssnapshoten.
   - Ersätt användningen av `useStaffDayStatusViaMobileReport` i mobilens rapportflöde med `useStaffDaySnapshot` där dagsdata, arbetsspann, totals och segment visas.
   - Låt dag-/vecko-/månadsöversikten fortsätta använda samma period-API som idag, men när man öppnar en enskild dag ska den använda exakt samma dagssnapshot som webben.

2. Bevara mobilens nuvarande UI, men mata den med den kanoniska strukturen.
   - Behåll `TodayTab`, `TimeReportTab`, `StaffDayDetailSheet` och `SegmentDetailSheet` visuellt/funktionellt.
   - Säkerställ att dessa komponenter läser `workday`, `totals`, `segments`, `attestation` och GPS-panel från den kanoniska snapshoten utan lokal omtolkning.

3. Ta bort divergerande mobil-logik för dagdata där den orsakar felaktig spegling.
   - Sluta använda `get-mobile-staff-day-report` som primär källa för `/m/report` dagvy.
   - Antingen avveckla adaptern `mobileReportToDaySnapshot` från rapportvyn eller begränsa den till en separat användning där den inte påverkar tidrapportssidan.

4. Verifiera med det konkreta felet och regressionsskydd.
   - Kontrollera att mobilens dagvy nu visar samma arbetsdagsspann och block som webbens snapshot för samma datum.
   - Lås gärna med ett litet test eller tydlig kodgräns så att `/m/report` inte återgår till alternativ cachemodell igen.

## Teknisk detalj
- Rotorsaken är att mobilen idag hämtar dagsdata från `get-mobile-staff-day-report` / `staff_day_report_cache`, medan webben och periodsammanställningen bygger på `get-staff-day-status` / samma dagssnapshot-motor.
- Det gör att `/m/report` kan visa en annan workday/segmentkedja än webben, trots att periodkort och adminvy bygger på den kanoniska modellen.
- Fixen hålls i frontend-hookar/komponentkopplingar om möjligt; ingen databasändring behövs för detta steg.

## Påverkade delar
- `src/components/mobile-app/time/TodayTab.tsx`
- `src/components/mobile-app/time/TimeReportTab.tsx`
- `src/components/mobile-app/time/StaffDayDetailSheet.tsx`
- `src/hooks/useStaffDayStatusViaMobileReport.ts` eller dess anrop
- Eventuellt städning kring `src/hooks/useMobileStaffDayReport.ts` och `src/lib/staff/mobileReportToDaySnapshot.ts`

## Resultat efter implementation
- Mobilens tidrapportvy speglar webbens tidrapportvy för samma dag.
- Raivis-liknande fall visar inte längre fel sluttid i mobilen när den kanoniska dagssnapshoten säger något annat.