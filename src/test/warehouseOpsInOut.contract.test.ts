import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const hook = readFileSync('src/hooks/useWarehouseOpsRange.ts', 'utf8');

describe('Lager OPS — packning har både UT och IN', () => {
  it('genererar två rader per bokningskopplad packning', () => {
    expect(hook).toContain('const jobs: OpsJob[] = list.flatMap((p)');
    expect(hook).toContain('id: `${p.id}::in`');
    expect(hook).toContain('direction: "in"');
    expect(hook).toContain('direction: "out"');
  });

  it('behåller riktigt packnings-id för navigering och bemanning', () => {
    expect(hook).toContain('packingId: p.id');
    expect(hook).toContain('jobId: j.packingId');
  });

  it('UI navigerar via packingId, inte rad-id', () => {
    for (const file of [
      'src/pages/WarehouseOps.tsx',
      'src/components/warehouse-ops/WarehouseOverviewNext7Days.tsx',
      'src/components/warehouse-ops/OpsStatusBoard.tsx',
      'src/components/warehouse-ops/OpsJobsTable.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/warehouse\/packing\/\$\{(row\.)?(job|j|selectedJob)\.id\}/);
    }
  });
});
