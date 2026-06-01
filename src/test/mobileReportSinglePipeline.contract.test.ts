/**
 * /m/report single-pipeline contract.
 *
 * Mobilappen /m/report → MobileTimeV2Page → WeekFlowMobilePanel +
 * MobileDaySubmitSheet. Inga andra GPS-byggare, gamla v2-endpoints eller
 * raw GPS-läsningar får finnas i den aktiva importgrafen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORBIDDEN = [
  'useStaffGpsWeekSummary',
  'get-staff-gps-week-summary',
  'get-mobile-gps-day-view',
  'submit-mobile-gps-day-v2',
  'buildCanonicalStaffDayGpsResult',
  'staff_location_history',
  'MobileTimeReportQueue',
];

const FILES = [
  'src/pages/mobile/MobileTimeReport.tsx',
  'src/features/mobile-time-v2/MobileTimeV2Page.tsx',
  'src/components/mobile-app/time/WeekFlowMobilePanel.tsx',
  'src/components/mobile-app/time/MobileDaySubmitSheet.tsx',
  'src/hooks/useMobileStaffDayReport.ts',
  'src/hooks/useSubmitStaffDayReport.ts',
  'src/hooks/staffTimeFlow/useStaffSelfWeekMatrix.ts',
];

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('/m/report — single pipeline', () => {
  for (const f of FILES) {
    it(`${f} contains no forbidden symbols`, () => {
      const src = read(f);
      // Strip block + line comments so docblock warnings ("får ALDRIG anropa
      // get-mobile-gps-day-view") don't falsely trip the test.
      const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
      const noComments = noBlock.replace(/^\s*\/\/.*$/gm, '');
      for (const symbol of FORBIDDEN) {
        expect(noComments, `${f} must not reference ${symbol}`).not.toContain(symbol);
      }
    });
  }

  it('submit goes through submit-staff-day-v3 only', () => {
    const src = read('src/hooks/useSubmitStaffDayReport.ts');
    expect(src).toContain('submit-staff-day-v3');
    expect(src).not.toContain('submit-mobile-gps-day-v2');
    expect(src).not.toContain('attest-staff-day');
  });

  it('submit payload carries the v3 contract', () => {
    const src = read('src/hooks/useSubmitStaffDayReport.ts');
    for (const field of [
      'requestedStartAt',
      'requestedEndAt',
      'breakMinutes',
      'comment',
      'userEdits',
      'displayTimelineSnapshot',
    ]) {
      expect(src, `payload must include ${field}`).toContain(field);
    }
  });

  it('day fetch uses get-mobile-staff-day-report (resolver-backed)', () => {
    const src = read('src/hooks/useMobileStaffDayReport.ts');
    expect(src).toContain('get-mobile-staff-day-report');
  });

  it('week fetch uses get-staff-time-week-matrix (resolver-backed)', () => {
    const src = read('src/hooks/staffTimeFlow/useStaffSelfWeekMatrix.ts');
    expect(src).toContain('get-staff-time-week-matrix');
  });
});
