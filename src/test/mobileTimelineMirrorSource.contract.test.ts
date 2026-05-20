// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('mobile timeline mirror source', () => {
  it('uses get-mobile-staff-day-report instead of direct get-staff-presence-day in the mobile gantt hook', () => {
    const src = read('src/hooks/useStaffGanttMirror.ts');
    expect(src).toContain("callStaffSnapshotFunction<MobileDayReport>('get-mobile-staff-day-report'");
    expect(src).not.toContain("callStaffSnapshotFunction<any>('get-staff-presence-day'");
  });

  it('exposes gantt mirror raw fields from get-mobile-staff-day-report', () => {
    const src = read('supabase/functions/get-mobile-staff-day-report/index.ts');
    expect(src).toContain('reportCandidateBlocks:');
    expect(src).toContain('displayTimelineBlocksV2:');
    expect(src).toContain('workdayAllocationSegments:');
  });
});