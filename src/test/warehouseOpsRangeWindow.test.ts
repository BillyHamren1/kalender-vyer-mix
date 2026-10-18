import { describe, expect, it } from 'vitest';
import { isOpsWindowCandidate, readAllPages, readInChunks } from '@/lib/warehouse/opsRangeWindow';
import { readFileSync } from 'node:fs';

const W = { start: '2026-10-19', end: '2026-10-25', today: '2026-10-19' };
const c = (p: any) => isOpsWindowCandidate({ start_date: null, end_date: null, ...p }, W.start, W.end, W.today);

describe('warehouse overview bounded window', () => {
  it('excludes completed history outside the window', () => {
    expect(c({ status: 'completed', rigdaydate: '2026-05-01', rigdowndate: '2026-05-03' })).toBe(false);
  });
  it('excludes open but already rigged-down jobs', () => {
    expect(c({ status: 'planning', rigdaydate: '2026-09-01', rigdowndate: '2026-09-03' })).toBe(false);
  });
  it('keeps completed jobs anchored in the window', () => {
    expect(c({ status: 'completed', rigdaydate: '2026-10-15', rigdowndate: '2026-10-21' })).toBe(true);
  });
  it('keeps return job whose rigdown is in the window', () => {
    expect(c({ status: 'delivered', rigdaydate: '2026-10-10', rigdowndate: '2026-10-20' })).toBe(true);
  });
  it('keeps multi-day job overlapping the window and upcoming open jobs', () => {
    expect(c({ status: 'delivered', rigdaydate: '2026-10-10', rigdowndate: '2026-11-02' })).toBe(true);
    expect(c({ status: 'planning', rigdaydate: '2026-12-01', rigdowndate: '2026-12-03' })).toBe(true);
  });
  it('keeps internal task by its own dates', () => {
    expect(c({ status: 'planning', start_date: '2026-10-22', end_date: '2026-10-22' })).toBe(true);
  });
  it('reads all pages without truncation', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const out = await readAllPages<number>(async (f, t) => ({ data: rows.slice(f, t + 1), error: null }));
    expect(out).toHaveLength(2345);
  });
  it('propagates page errors instead of returning partial data', async () => {
    await expect(readAllPages(async () => ({ data: null, error: new Error('x') }))).rejects.toThrow('x');
  });
  it('chunks with bounded concurrency', async () => {
    let active = 0, peak = 0;
    const ids = Array.from({ length: 1000 }, (_, i) => String(i));
    const out = await readInChunks(ids, async (ch) => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--; return ch; }, 100, 3);
    expect(out).toHaveLength(1000);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('polling and cache gating (static)', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('no 10/30 s dataset polling in warehouse reads', () => {
    for (const p of ['src/hooks/useWarehouseOpsRange.ts', 'src/hooks/useWarehousePersonnelWeek.ts', 'src/hooks/useWarehouseCardMeta.ts']) {
      expect(read(p)).not.toMatch(/refetchInterval:\s*(10|30)_000/);
    }
  });
  it('overview cache key is organization and actor scoped', () => {
    expect(read('src/hooks/useWarehouseOpsRange.ts')).toMatch(/"warehouse-ops-range", organizationId \|\| "none", userId \|\| "none"/);
  });
  it('calendar sources are gated off in personnel mode', () => {
    const s = read('src/pages/WarehouseCalendarPage.tsx');
    expect(s).toContain("enabled: planningMode === 'calendar'");
    expect(s).toContain('!calendarActive ? []');
  });
  it('staff directory incl. inactive has its own cache key and no forced refetch', () => {
    const s = read('src/pages/StaffManagement.tsx');
    expect(s).toContain("['staffMembers', 'includeInactive']");
    expect(s).not.toContain("refetchOnMount: 'always'");
  });
});
