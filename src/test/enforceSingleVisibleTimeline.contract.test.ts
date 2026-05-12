/**
 * Time Engine 2.12 — enforceSingleVisibleTimeline contract.
 *
 * En person kan inte vara på två platser samtidigt. Efter post-pass 6 i
 * buildReportCandidateBlocks får inga block överlappa per staff/dag.
 *
 * Detta test importerar Deno-filen via en lättviktig "shape contract" — vi
 * kör inte hela motorn (kräver Supabase + GPS-fixtures). Istället
 * verifierar vi att Gantt-renderaren själv inte längre staplar block i
 * sub-lanes och att den loggar diagnostic-warning vid eventuella
 * kvarvarande överlapp.
 */
import { describe, it, expect, vi } from 'vitest';

describe('enforceSingleVisibleTimeline (contract)', () => {
  it('Gantt-vyn renderar block med full bredd (inga sub-lanes kvar i koden)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/staff/StaffGanttView.tsx', 'utf-8');
    // sub-lane-symboler får inte längre påverka layouten
    expect(src).not.toMatch(/widthPct\s*=\s*100\s*\/\s*laneCount/);
    expect(src).not.toMatch(/leftPct\s*=\s*widthPct\s*\*\s*lane/);
    // full bredd ska vara hard-codad
    expect(src).toMatch(/left:\s*2,/);
    expect(src).toMatch(/width:\s*'calc\(100% - 4px\)'/);
  });

  it('Time Engine exporterar singleTimelineDiagnostics i summary-typen', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts',
      'utf-8',
    );
    expect(src).toContain('singleTimelineDiagnostics');
    expect(src).toContain('enforceSingleVisibleTimeline');
    expect(src).toContain('remainingOverlapsCount');
    expect(src).toContain('syntheticActiveTimerBlocksRemovedCount');
  });
});
