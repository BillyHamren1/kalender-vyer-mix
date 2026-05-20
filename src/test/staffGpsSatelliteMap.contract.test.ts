import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontrakt: GPS satellitkarta får ALDRIG dra in Time Engine / dayJournal /
 * displayTimelineV2 / reportCandidate / workday-allocation. Den är rådata-only.
 */
const FORBIDDEN = [
  '@/lib/time-engine',
  '@/lib/staff/dayEventTimeline',
  '@/lib/staff/displayTimelineV2',
  '@/lib/staff/dayJournal',
  '@/lib/staff/actualStaffDayModel',
  '@/lib/staff/canonicalDayModel',
  // pingPlaceSegments tillåts: behövs för att visa exakt IN/UT-tid per geofence-besök på kartan.
  'reportCandidate',
  'WorkdayAllocation',
  'staff_day_report_cache',
  'staff_day_submissions',
];

const FILES = [
  'src/hooks/staff/useStaffGpsPingsForDay.ts',
  'src/hooks/useDayKnownSites.ts',
  'src/components/staff/RawGpsSatelliteMap.tsx',
  'src/components/staff/StaffGpsSatelliteMap.tsx',
  'src/pages/StaffGpsSatelliteMap.tsx',
];

describe('GPS satellitkarta — isolation contract', () => {
  for (const rel of FILES) {
    it(`${rel} importerar inget från Time Engine / tolkningslager`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const needle of FORBIDDEN) {
        expect(src.includes(needle), `${rel} innehåller förbjuden referens: ${needle}`).toBe(false);
      }
    });
  }

  it('hook använder satellit-tabellen staff_location_history och ingen edge function', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/hooks/staff/useStaffGpsPingsForDay.ts'), 'utf8');
    expect(src).toContain("from('staff_location_history')");
    expect(src).not.toContain('functions.invoke');
  });

  it('kartan använder satellit-style', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/staff/RawGpsSatelliteMap.tsx'), 'utf8');
    expect(src).toContain('style="satellite"');
  });

  it('dagens known-sites hämtar targets via booking assignments + projektkopplingar', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/hooks/useDayKnownSites.ts'), 'utf8');
    expect(src).toContain("from('booking_staff_assignments')");
    expect(src).toContain('assigned_project_id');
    expect(src).toContain("from('large_project_bookings')");
    expect(src).toContain("select('team_id')");
  });
});
