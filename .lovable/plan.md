# Gantt 5.3 — Integrationstest för V2 visual pipeline

## Mål
Bevisa att V2 (`displayTimelineBlocksV2`) går genom EXAKT samma merge/absorb-pipeline som legacy, så block kan mergeas, korta transport/review absorberas, fallback fungerar och metadata bevaras.

## Problem att lösa först (refactor)
Pipeline-helpern `applyGanttVisualPipeline` ligger inbäddad i `src/components/staff/StaffGanttView.tsx` (rad 434) och är inte exportbar. Den måste extraheras till en pure modul så testet kör samma kod som UI:t — inte en kopia.

## Filer

### 1. Ny fil: `src/lib/staff/ganttVisualPipeline.ts`
Flytta `applyGanttVisualPipeline` hit som pure helper:
- Input: `GanttBlock[]` + staffName + valfri diagSink
- Output: `GanttBlock[]` med `attachedChips` + `absorbedSourceIds`
- Komponerar `applyVisualMerge` → `buildVisualGanttBlocks` → mappa tillbaka till `GanttBlock`
- Beroenden importeras från befintliga moduler (`ganttBlockMerge`, `visualGanttBlocks`, `StaffGanttView`-typer flyttas vid behov till en typfil eller importeras tillbaka)

### 2. Edit: `src/components/staff/StaffGanttView.tsx`
- Ersätt lokala `applyGanttVisualPipeline` med import från `ganttVisualPipeline.ts`
- Ingen funktionell ändring i renderingen

### 3. Ny fil: `src/lib/staff/__tests__/ganttVisualPipeline.integration.test.ts`
Testfall (5 st):

**Test 1 — Två V2 project-block med samma targetId**
- block 1: 08:00–10:00, `displayType:project`, targetId A, gap 5 min
- block 2: 10:05–12:00, `displayType:project`, targetId A
- Kör: `mapDisplayTimelineBlocksToGantt` → tilldela `sessionKey` via `sessionKeyFromTimelineBlock` → `applyGanttVisualPipeline`
- Expect: båda får sessionKey `target:project:A`; efter pipeline = 1 visuellt block; `absorbedSourceIds`/`sourceBlockIds` innehåller båda raw-id

**Test 2 — V2 project + kort travel före/efter**
- travel 07:45–08:00 (15 min), project 08:00–12:00, travel 12:00–12:15 (15 min)
- Expect: 1 huvudblock (work), inga standalone transport-block, `attachedChips` innehåller "Transport före 15 min" + "Transport efter 15 min", `absorbedSourceIds` inkluderar båda travel-id

**Test 3 — V2 project + kort review/unknown**
- project 08:00–12:00, unlinked_address `severity:needs_user_review` 12:00–12:20
- Expect: review absorberas (durationMinutes < 60 = longReview tröskel), huvudblock kvar, chip-label "Granska efter 20 min"

**Test 4 — V2 endast private → fallback**
- V2 endast `{displayType:'private'}` (mappar → 0)
- allocation har 1 `project_work`-segment
- Expect: `selectGanttSourceFromMapped({mappedV2Count:0, mappedAllocationCount:1, legacyCount:0})` === `'workdayAllocation'`; pipeline kör allocation-blocken och returnerar ≥1 renderbart block

**Test 5 — Metadata bevaras genom hela pipeline**
- V2 block med targetType, targetId, address, warnings + 1 absorberad travel
- Efter pipeline: huvudblockets `targetType/targetId/address/warnings/source` finns kvar oförändrade på det returnerade `GanttBlock`-objektet; `source === 'displayTimelineV2'`; eventuella `sourceAllocationSegmentIds`/`sourceLocationTruthSegmentIds` (om de propageras i merge) bevaras

## Constraints
- Ingen renderingsändring om testerna passerar direkt efter refactor
- Pure test, ingen React-rendering
- Kör `bunx vitest run src/lib/staff/__tests__/ganttVisualPipeline.integration.test.ts` efter implementation

## Rapport efter körning
A. Vilka tester lades till (5 + refactor)
B/C/D/E: pass/fail per testfall
