## Mål
Gantt-vyn på `/staff-management/time-reports` ska visa samma föreslagna tidsblock som modalen visar för samma person och dag.

## Vad jag ändrar
1. Gör Gantt-vyn i denna sida till en ren `reportCandidate`-vy
   - Slutar behandla `time_reports`/`LTE`/`travel_logs` som primär visuell källa för block i denna vy.
   - Slutar låta `displayTimelineV2/workdayAllocation` eller annan "committed/admin"-policy trumfa `reportCandidateBlocks` här.

2. Synkar summering och blockkälla mellan rad och modal
   - Radens "arbete / resa" ska räknas från samma `reportCandidateSummary` som modalen.
   - Om modalen visar 9h arbete + 3h transport ska raden visa samma siffror.
   - Tom Gantt-rad trots att modalen har block ska försvinna.

3. Behåller detta som read-only förslag
   - Ingen auto-convert till `time_reports`.
   - Ingen admin-godkännandepolicy i denna vy.
   - Allt som visas här fortsätter vara suggested / reportCandidate.

4. Begränsar ändringen till just denna vy
   - Ändrar bara admin-tidrapportsvyns Gantt/rendering.
   - Rör inte lönelogik, projektkostnad, mobile mirror-only eller write path.

## Tekniskt
- Uppdaterar `src/components/staff/StaffGanttView.tsx`
  - välj `reportCandidateBlocks` som visuell källa för raden i denna vy
  - summera label/minuter från `reportCandidateSummary`
  - ta bort logiken som gömmer legacy/reportCandidate när V2-fält finns för just denna skärm
- Uppdaterar `src/pages/StaffTimeReports.tsx`
  - se till att staff-raddata exponerar candidate-summary så Gantt-raden kan visa samma totalsiffror som modalen
  - låt `dayMetrics` finnas kvar för annan intern info, men inte styra just denna presentationsvy
- Lägger/uppdaterar tester så kontraktet blir:
  - om `reportCandidateBlocks` finns är det dessa som visas i admin-Gantt för dagen
  - radens totalsiffror matchar modalen
  - inga krav på admin approval eller committed rows för att synas i denna vy

## Validering
- Kör riktade tester för Gantt/reportCandidate-kontrakt
- Kör vitest efter ändringen
- Verifierar i preview att samma personrad och modal visar samma block/tider