/**
 * CONTRACT: the staff calendar (personalkalendern) read path must NOT be
 * touched by the phase-date consolidation work.
 *
 * If any of these assertions fail, the consolidation work has leaked into
 * personalkalenderns kodvägar and must be reverted before continuing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('personalkalendern remains untouched by phase-date consolidation', () => {
  const FILES = [
    'src/services/staffCalendarService.ts',
    'src/services/plannerCalendarDerivation.ts',
    'src/lib/staffCalendar/deriveStaffEvents.ts',
    'src/services/eventService.ts',
  ];

  it('none of the personalkalender files import the phase-day hook/service', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(
        src.includes('useBookingPhaseDays'),
        `${f} must not import useBookingPhaseDays`,
      ).toBe(false);
      expect(
        src.includes('bookingPhaseDaysService'),
        `${f} must not import bookingPhaseDaysService`,
      ).toBe(false);
      expect(
        src.includes('syncBookingPhaseDays'),
        `${f} must not call syncBookingPhaseDays`,
      ).toBe(false);
    }
  });

  it('plannerCalendarDerivation still selects rigdaydate/eventdate/rigdowndate from bookings (read-only mirror)', () => {
    // The planner has historically read phase dates straight from bookings
    // for fallback. Consolidation must not strip these reads — that would
    // change personalkalendern's behaviour.
    const src = read('src/services/plannerCalendarDerivation.ts');
    expect(src).toMatch(/rigdaydate/);
    expect(src).toMatch(/eventdate/);
    expect(src).toMatch(/rigdowndate/);
  });

  it('staffCalendarService still derives via deriveStaffEvents', () => {
    const src = read('src/services/staffCalendarService.ts');
    expect(src).toMatch(/deriveStaffEvents/);
  });
});
