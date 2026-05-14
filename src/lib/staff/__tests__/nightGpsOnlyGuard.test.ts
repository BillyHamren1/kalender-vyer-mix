import { describe, it, expect } from 'vitest';
import {
  classifyNightGpsOnly,
  overlapsNightWindow,
  stockholmHour,
} from '../nightGpsOnlyGuard';

const isoLocal = (h: number, m = 0): string => {
  // 2026-05-13 i Europe/Stockholm; sommartid (CEST = UTC+2)
  const d = new Date(Date.UTC(2026, 4, 13, h - 2, m, 0));
  return d.toISOString();
};

const emptyEvidence = {
  timeReportWindows: [],
  locationEntryWindows: [],
  manualWorkdayWindow: null,
};

describe('stockholmHour', () => {
  it('returns local hour in Stockholm summer time', () => {
    expect(stockholmHour(isoLocal(0, 1))).toBe(0);
    expect(stockholmHour(isoLocal(12, 0))).toBe(12);
    expect(stockholmHour(isoLocal(23, 30))).toBe(23);
  });
});

describe('overlapsNightWindow', () => {
  it('detects 00:01–01:58 as night', () => {
    expect(overlapsNightWindow(isoLocal(0, 1), isoLocal(1, 58))).toBe(true);
  });
  it('detects 04:30–06:30 as night (partial)', () => {
    expect(overlapsNightWindow(isoLocal(4, 30), isoLocal(6, 30))).toBe(true);
  });
  it('does not flag 12:00–13:00 as night', () => {
    expect(overlapsNightWindow(isoLocal(12, 0), isoLocal(13, 0))).toBe(false);
  });
  it('does not flag 05:30–07:00 as night', () => {
    expect(overlapsNightWindow(isoLocal(5, 30), isoLocal(7, 0))).toBe(false);
  });
});

describe('classifyNightGpsOnly', () => {
  it('Kristaps-scenariot: 00:01–01:58 GPS-only → suppressed', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(0, 1), endAt: isoLocal(1, 58), kind: 'work' },
      emptyEvidence,
    );
    expect(result.decision).toBe('raw_only_night_gps');
  });

  it('00:01–01:58 men har LTE → visas i huvudvy', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(0, 1), endAt: isoLocal(1, 58), kind: 'work' },
      {
        ...emptyEvidence,
        locationEntryWindows: [
          { startIso: isoLocal(0, 0), endIso: isoLocal(2, 0) },
        ],
      },
    );
    expect(result.decision).toBe('main');
    expect(result.reason).toBe('has_hard_evidence');
  });

  it('00:01–01:58 men har time_report → visas', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(0, 1), endAt: isoLocal(1, 58), kind: 'work' },
      {
        ...emptyEvidence,
        timeReportWindows: [
          { startIso: isoLocal(0, 0), endIso: isoLocal(2, 0) },
        ],
      },
    );
    expect(result.decision).toBe('main');
  });

  it('00:01–01:58 med manuell workday → visas', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(0, 1), endAt: isoLocal(1, 58), kind: 'work' },
      {
        ...emptyEvidence,
        manualWorkdayWindow: { startIso: isoLocal(0, 0), endIso: isoLocal(3, 0) },
      },
    );
    expect(result.decision).toBe('main');
  });

  it('12:00–13:00 (utanför natt) → visas oavsett evidens', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(12, 0), endAt: isoLocal(13, 0), kind: 'work' },
      emptyEvidence,
    );
    expect(result.decision).toBe('main');
    expect(result.reason).toBe('outside_night_window');
  });

  it('transport-block under natten → aldrig suppressed', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(2, 0), endAt: isoLocal(3, 0), kind: 'transport' },
      emptyEvidence,
    );
    expect(result.decision).toBe('main');
    expect(result.reason).toContain('transport');
  });

  it('needs_review-block under natten → aldrig suppressed', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(1, 0), endAt: isoLocal(2, 0), kind: 'needs_review' },
      emptyEvidence,
    );
    expect(result.decision).toBe('main');
  });

  it('04:30–06:30 partial natt utan evidens → suppressed (hela blocket)', () => {
    const result = classifyNightGpsOnly(
      { startAt: isoLocal(4, 30), endAt: isoLocal(6, 30), kind: 'work' },
      emptyEvidence,
    );
    expect(result.decision).toBe('raw_only_night_gps');
  });
});
