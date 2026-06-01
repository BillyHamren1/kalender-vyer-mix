/**
 * get-mobile-gps-day-view single-pipeline contract.
 *
 * Verifierar att V2-läsendpointen ENBART går via resolveStaffDayReport och
 * inte längre bygger upp dagen från:
 *   - staff_location_history (raw GPS pings)
 *   - canonical staff-day GPS-builder
 *   - GPS-only timeline / buildDayView GPS-fallback
 *
 * Den får heller inte läsa eller skriva från/till
 * time_reports / workdays / location_time_entries / travel_time_logs /
 * day_attestations / active_time_registrations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FILE = resolve(__dirname, '../../supabase/functions/get-mobile-gps-day-view/index.ts');
const source = readFileSync(FILE, 'utf8');

describe('get-mobile-gps-day-view single-pipeline', () => {
  it('imports resolveStaffDayReport (the only allowed read path)', () => {
    expect(source).toMatch(/from\s+["']\.\.\/_shared\/staff-day-report\/resolveStaffDayReport\.ts["']/);
    expect(source).toMatch(/resolveStaffDayReport\(/);
  });

  it('does NOT import legacy GPS/canonical/timeline builders', () => {
    const forbidden = [
      'fetchPingsForDayV2',
      'buildCanonicalStaffDayGpsResult',
      'buildGpsDayTimelineOnly',
      'buildDayView',
      'buildDayMap',
      'loadKnownTargetsV2',
    ];
    for (const sym of forbidden) {
      expect(source, `must not reference ${sym}`).not.toContain(sym);
    }
  });

  it('does NOT query staff_location_history or legacy report tables', () => {
    const forbiddenTables = [
      'staff_location_history',
      'time_reports',
      'workdays',
      'location_time_entries',
      'travel_time_logs',
      'day_attestations',
      'active_time_registrations',
    ];
    for (const t of forbiddenTables) {
      expect(source, `must not reference table ${t}`).not.toContain(`"${t}"`);
    }
  });

  it('contains no insert/update/upsert/delete (read-only endpoint)', () => {
    const writeOps = ['.insert(', '.update(', '.upsert(', '.delete('];
    for (const op of writeOps) {
      expect(source, `must not call ${op}`).not.toContain(op);
    }
  });
});
