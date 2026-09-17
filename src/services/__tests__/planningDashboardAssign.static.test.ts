// @vitest-environment node
/**
 * Kontrakt: de äldre planeringsvägarna får INTE radera personens övriga
 * team-rader samma dag — de ska delegera till staffAssignmentCore.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('planningDashboardService — assign delegerar till kanonisk skrivväg', () => {
  const src = read('src/services/planningDashboardService.ts');

  it('importerar assignStaffToTeamCore', () => {
    expect(src).toContain('assignStaffToTeamCore');
  });

  it('gör ingen delete/insert mot staff_assignments', () => {
    const mutation = /\.from\(['"]staff_assignments['"]\)(?:(?!\.from\()[\s\S]){0,400}?\.(upsert|insert|update|delete)\s*\(/;
    expect(mutation.test(src)).toBe(false);
  });
});

describe('OpsStaffTimeline planerar på vald dag', () => {
  const src = read('src/components/ops-control/OpsStaffTimeline.tsx');

  it('skickar datum-propen till assignStaffToBooking', () => {
    expect(src).toContain('assignStaffToBooking(dragStaffId, targetBookingId, date)');
    expect(src).not.toContain('assignStaffToBooking(dragStaffId, targetBookingId, new Date())');
  });
});
