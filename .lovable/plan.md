# Plan

## Mål
Få Gantt-vyn på `/staff-management/time-reports` att visa exakt samma suggested-block som detaljvyn/modalen visar för samma person och dag — samma blockindelning, samma etiketter och samma summering.

## Vad som är fel nu
Gantt och modal läser båda från `reportCandidate`, men de renderar inte samma pipeline:

- **Modalen** kör `buildReportDisplayBlocks(...)` direkt på `reportCandidateBlocks` och visar resultatet.
- **Gantt** kör fortfarande en egen väg via `blocksFromStaff(...)` → `applyVisualMerge(...)` → `buildVisualGanttBlocks(...)`.

Det betyder att Gantt fortfarande kan:
- slå ihop block som modalen visar separat
- absorbera transport/unknown/review som chips i andra block
- visa andra titlar/subtitles än modalen
- få annat antal block trots samma summary

Det är därför användaren fortfarande ser olika vyer trots att summary-raden redan hämtas från samma source.

## Ändring
1. **Inför en gemensam suggested-display-pipeline för denna vy**
   - Bygg reportCandidate-spåret i Gantt från samma `buildReportDisplayBlocks(...)` som modalen använder.
   - Använd samma filtrering av synliga blocktyper: `work`, `transport`, `unknown`, `needs_review`.

2. **Stäng av Gantt-specifik block-omformning för reportCandidate-spåret**
   - Ingen `applyVisualMerge(...)` för reportCandidate i denna adminvy.
   - Ingen `buildVisualGanttBlocks(...)`-absorption/chip-hopslagning för reportCandidate i denna adminvy.
   - Varje synligt display-block från modalen ska motsvara ett block i Gantt.

3. **Behåll övriga fallback-källor orörda**
   - `displayTimelineV2` och `workdayAllocation` får ligga kvar som fallback när `reportCandidate` är tomt.
   - Scope stannar på just admin-tidrapportsvyn.

4. **Synka titel/subtitle i blockrenderingen**
   - Gantt ska använda display-titel/subtitle från samma display-block som modalen bygger.
   - Tooltip/detaljdialog ska fortsätta fungera utan att ändra write paths eller backend-policy.

5. **Lås kontraktet med test**
   - Lägg till/uppdatera test som verifierar att reportCandidate → display-block → Gantt ger samma blocksekvens som modalen skulle visa.
   - Täck särskilt fall där transport tidigare absorberades in i arbetsblock.

## Tekniska detaljer
- Berörda filer:
  - `src/components/staff/StaffGanttView.tsx`
  - ev. ny liten helper i `src/lib/staff/` för att dela display→gantt-mappning utan UI-koppling
  - `src/test/staffGanttSuggestedOnly.contract.test.ts` eller ny närliggande kontraktstest

- Planerad implementation:
  - extrahera en liten pure mapping från `DisplayBlock` → `GanttBlock`
  - låt reportCandidate-källan i `StaffGanttView` använda:
    1. `buildReportDisplayBlocks(...)`
    2. samma visibleKinds som modalen
    3. direkt mappning till renderbara Gantt-block
  - lämna V2/allocation-pipeline oförändrad

## Validering
- Kör riktade vitest-kontrakt för suggested-only/Gantt-paritet.
- Kör full relevant testsvit efter ändringen.
- Verifiera i preview att raden för samma person/dag visar samma blockuppdelning som modalen, inte bara samma totalsiffror.