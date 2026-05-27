import { describe, it, expect } from 'vitest';
import { stockholmDayWindowUtc } from '../../../../supabase/functions/_shared/staff-gps/dayWindow.ts';

describe('stockholmDayWindowUtc', () => {
  it('CEST: 2026-05-26 → 2026-05-25T22:00Z..2026-05-26T21:59:59.999Z', () => {
    const w = stockholmDayWindowUtc('2026-05-26');
    expect(w.startIso).toBe('2026-05-25T22:00:00.000Z');
    expect(w.endIso).toBe('2026-05-26T21:59:59.999Z');
  });
  it('CET: 2026-01-15 → 2026-01-14T23:00Z..2026-01-15T22:59:59.999Z', () => {
    const w = stockholmDayWindowUtc('2026-01-15');
    expect(w.startIso).toBe('2026-01-14T23:00:00.000Z');
    expect(w.endIso).toBe('2026-01-15T22:59:59.999Z');
  });
});
