import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Packning/Retur — tydlig visuell skillnad med rigg/riv-färger', () => {
  const packingCard = readFileSync('src/components/scanner/calendar/PackingCard.tsx', 'utf8');
  const lpCard = readFileSync('src/components/scanner/calendar/LargeProjectPackingCard.tsx', 'utf8');
  const overview = readFileSync('src/components/warehouse-ops/WarehouseOverviewNext7Days.tsx', 'utf8');
  const actionQueue = readFileSync('src/components/warehouse-ops/WarehouseOpsActionQueue.tsx', 'utf8');

  it('scanner PackingCard använder grön helkort för UT och rött helkort för IN', () => {
    expect(packingCard).toMatch(/isReturn\s*\?\s*['"]border-red-500 bg-red-100['"]/);
    expect(packingCard).toMatch(/:\s*['"]border-green-500 bg-green-100['"]/);
  });

  it('scanner LargeProjectPackingCard använder grön för UT och rött för IN', () => {
    expect(lpCard).toMatch(/isReturn\s*\?\s*['"]border-red-500 bg-red-100['"]/);
    expect(lpCard).toMatch(/:\s*['"]border-green-500 bg-green-100['"]/);
  });

  it('WarehouseOverviewNext7Days färglägger kort baserat på direction', () => {
    expect(overview).toContain("row.job.direction === 'in'");
    expect(overview).toContain("border-l-red-500");
    expect(overview).toContain("row.job.direction === 'out'");
    expect(overview).toContain("border-l-green-500");
  });

  it('WarehouseOpsActionQueue färglägger obemannat/tid-saknas-rader baserat på direction', () => {
    expect(actionQueue).toContain('directionColor === "red"');
    expect(actionQueue).toContain('directionColor === "green"');
    expect(actionQueue).toContain('border-l-red-500');
    expect(actionQueue).toContain('border-l-green-500');
  });
});
