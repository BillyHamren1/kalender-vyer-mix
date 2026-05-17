## Problem

`StaffGanttView.blocksFromStaff` har två vägar för att producera `GanttBlock[]`:

1. **Parity-vägen** (rad 502–553): När `buildSuggestedDisplayBlocksForAdminGantt` returnerar block, `return`as direkt utan att passera `applyVisualMerge`.
2. **Engine-vägen** (rad ~735): Kör `applyVisualMerge(out, staff.name)`.

De 3 RIGG-blocken i screenshoten kommer från **parity-vägen**, därför slås de aldrig ihop — trots att merge-logiken i `ganttBlockMerge.ts` är korrekt (normaliserar work↔rig, struntar i sessionKey, gap ≤ 15 min).

## Lösning

Låt parity-vägen också passera `applyVisualMerge` innan den returnerar.

### Ändring i `src/components/staff/StaffGanttView.tsx`

Vid rad 529 — istället för att returnera direkt, bygg listan i en variabel och kör samma `applyVisualMerge(parityGantt, staff.name)` innan return:

```text
const parityGantt: GanttBlock[] = parityBlocks.map((b) => ({ ...samma som idag... }));
return applyVisualMerge(parityGantt, staff.name);
```

Inget annat ändras. Engine-vägens merge står kvar.

### Test

Lägg till ett testfall i `src/test/ganttBlockMerge.test.ts` (eller en ny `parityVisualMerge.test.ts`) som verifierar att 3 adjacent RIGG-block med olika sessionKey men gap ≤ 15 min blir 1 block — speglar exakt scenariot i screenshoten.

## Notering

Detta är en frontend-only fix i presentationslagret. Påverkar inte time-engine, time_reports, planning eller annan affärslogik.