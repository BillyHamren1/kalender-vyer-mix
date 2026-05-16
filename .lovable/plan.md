# Plan: akutfix för Gantt-källa

## Mål
Få `StaffGanttView` att visa block igen genom att använda `displayTimelineBlocksV2` som primär källa, med säker fallback till `workdayAllocationSegments` och därefter gamla `reportCandidateBlocks` så Gantt aldrig blir tom p.g.a. fel källa.

## Ändringar

### 1. Utöka dataflödet i `StaffTimeReports.tsx`
- Spara följande fält från `get-staff-presence-day` i `reportCandidateByStaff`:
  - `displayTimelineBlocksV2`
  - `displayTimelineDiagnosticsV2`
  - `workdayAllocationSegments`
  - `workdayAllocationDiagnostics`
- Behåll nuvarande `reportCandidateBlocks` och relaterade fält som fallback.

### 2. Utöka typen i `StaffGanttView.tsx`
- Lägg till de nya V2-/allocation-fälten i `reportCandidateByStaff`-typen.
- Behåll kompatibilitet med nuvarande `reportCandidate`-objekt så drawer och äldre logik fortsätter fungera.

### 3. Inför tydlig source-selection i `StaffGanttView`
Bygg en deterministisk prioritering per person:
1. `displayTimelineBlocksV2` om arrayen har block
2. annars `workdayAllocationSegments` om arrayen har block
3. annars `reportCandidateBlocks`
4. annars tom rad

Viktig regel:
- Om `displayTimelineBlocksV2` finns men är tom och `reportCandidateBlocks` har innehåll, ska Gantt falla tillbaka till `reportCandidateBlocks`.

### 4. Lägg till mapper för V2 → `GanttBlock`
Skapa en liten ren mapper i ny fil `src/lib/staff/displayTimelineToGanttBlocks.ts`.

Den ska:
- mappa `DisplayTimelineBlock.displayType` till `GanttKind`
- återanvända befintlig faslogik där det går för `project` / `large_project` / `booking`
- mappa:
  - `warehouse` → `warehouse`
  - `travel` / `commute` → `transport`
  - `review` → `review`
  - `unlinked_address` → `review` eller `unknown` beroende på severity
  - `private` → inte bli huvudblock i Gantt
  - `supplier` → `work` tills vidare
- föra över minst:
  - `id`, `kind`, `startAt`, `endAt`, `durationMinutes`, `title`, `subtitle`
  - `targetType`, `targetId`, `address`, `warnings`
  - källa/metadata så debug och tooltip kan skilja på V2 och legacy

### 5. Lägg till fallback-mappning för `workdayAllocationSegments`
- Skapa en enkel intern mapper i samma nya fil eller i `StaffGanttView`.
- Syftet är inte perfekt visuell policy utan att garantera synliga block när V2 saknas men allocation finns.
- Håll mappningen konservativ och läsbar.

### 6. Koppla om `blocksByStaff`
- Byt ut nuvarande direkta anrop till `blocksFromStaff(s, cand?.blocks...)` mot en selector som:
  - väljer källa
  - mappar till `GanttBlock[]`
  - endast använder gamla `blocksFromStaff(...)` när legacy-källan valts
- Lägg in temporär debug-logg:
  - `staffName`
  - `displayTimelineBlocksV2Count`
  - `workdayAllocationSegmentsCount`
  - `reportCandidateBlocksCount`
  - `selectedSource`
  - `renderedBlockCount`

### 7. Säkerställ pre-work-regeln
- Behåll `excludedPreWorkBlocks` endast för diagnostics/drawer.
- Ingen pre-work ska bli huvudblock i Gantt.
- Verifiera att det inte finns någon kvarvarande väg som gör `pre_work` till renderat block från legacy-källan.

### 8. Lås layout-regeln
- Bekräfta att `ROW_PX` är `96` och lämna det så.

### 9. Tester
Uppdatera/addera tester för:
- staff med endast `displayTimelineBlocksV2` → Gantt visar V2-block
- staff med endast `reportCandidateBlocks` → Gantt visar legacy-block
- staff med båda → V2 vinner
- staff utan block → tom rad, inte felaktig källkollaps
- pre-work renderas inte som huvudblock
- mappern för V2 ger rätt `GanttKind` för minst warehouse/travel/review/private

## Teknisk not
Jag har verifierat i koden att:
- `StaffTimeReports.tsx` hämtar redan `displayTimelineBlocksV2`, `displayTimelineDiagnosticsV2`, `workdayAllocationSegments` och `workdayAllocationDiagnostics` från edge-funktionen men sparar dem inte i `reportCandidateByStaff`.
- `StaffGanttView.tsx` bygger idag `blocksByStaff` enbart från `cand?.blocks` via `blocksFromStaff(...)`.
- `ROW_PX` står redan på `96`.
- `excludedPreWorkBlocks` används nu bara som dold diagnostics-count i den visade koden, men jag kommer att verifiera att ingen annan render-path råkar göra dem synliga som huvudblock.

## Validering efter implementation
- köra relevanta vitest-tester
- kontrollera preview/logik så att Gantt inte blir tom när V2 finns men legacy saknas
- rapportera per staff vilken källa som valdes samt antal V2-/legacy-/renderade block