/**
 * Copy contract test for EndDayOnArrivalHomeDialog.
 * The dialog must NEVER mention "hem", "hemma" or "bostad" in any
 * user-visible string. The inferred home is an internal trigger only.
 */
import { describe, it, expect } from 'vitest';
import { END_DAY_HOME_COPY } from '@/components/mobile-app/EndDayOnArrivalHomeDialog';

const FORBIDDEN = /(?:^|\b)(hem|hemma|hemmet|bostad|bostaden)(?:\b|[.,!?])/i;

function allStrings(): string[] {
  return [
    END_DAY_HOME_COPY.title,
    END_DAY_HOME_COPY.body('Stockholm Globen', '17:42'),
    END_DAY_HOME_COPY.yes('17:42'),
    END_DAY_HOME_COPY.no,
    END_DAY_HOME_COPY.custom,
  ];
}

describe('EndDayOnArrivalHomeDialog copy', () => {
  it('never contains the words hem/hemma/bostad', () => {
    for (const s of allStrings()) {
      expect(s).not.toMatch(FORBIDDEN);
    }
  });

  it('mentions the workplace name and time in the body', () => {
    const body = END_DAY_HOME_COPY.body('Stockholm Globen', '17:42');
    expect(body).toContain('Stockholm Globen');
    expect(body).toContain('17:42');
  });
});
