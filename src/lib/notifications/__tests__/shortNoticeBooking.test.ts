import { describe, it, expect } from 'vitest';
import {
  evaluateShortNotice,
  formatDaysUntil,
  SHORT_NOTICE_DAYS,
  SHORT_NOTICE_NOTIFY_ROLES,
} from '../shortNoticeBooking';

const NOW = new Date('2026-05-28T10:00:00Z');

describe('evaluateShortNotice', () => {
  it('returnerar inte short notice när varken rigdaydate eller eventdate finns', () => {
    expect(evaluateShortNotice({ now: NOW })).toEqual({
      isShortNotice: false,
      daysUntilRig: null,
      effectiveDate: null,
    });
  });

  it('flaggar bokning med rigdag inom 7 dagar', () => {
    const r = evaluateShortNotice({ rigdaydate: '2026-06-03', now: NOW });
    expect(r.isShortNotice).toBe(true);
    expect(r.daysUntilRig).toBe(6);
  });

  it('flaggar bokning med rigdag exakt på dag 7', () => {
    const r = evaluateShortNotice({ rigdaydate: '2026-06-04', now: NOW });
    expect(r.isShortNotice).toBe(true);
    expect(r.daysUntilRig).toBe(SHORT_NOTICE_DAYS);
  });

  it('flaggar INTE bokning med rigdag dag 8', () => {
    const r = evaluateShortNotice({ rigdaydate: '2026-06-05', now: NOW });
    expect(r.isShortNotice).toBe(false);
    expect(r.daysUntilRig).toBe(8);
  });

  it('flaggar bokning som redan passerat (kort varsel i extrem grad)', () => {
    const r = evaluateShortNotice({ rigdaydate: '2026-05-25', now: NOW });
    expect(r.isShortNotice).toBe(true);
    expect(r.daysUntilRig).toBe(-3);
  });

  it('faller tillbaka till eventdate när rigdaydate saknas', () => {
    const r = evaluateShortNotice({ rigdaydate: null, eventdate: '2026-05-30', now: NOW });
    expect(r.isShortNotice).toBe(true);
    expect(r.daysUntilRig).toBe(2);
  });

  it('exponerar SHORT_NOTICE_DAYS = 7', () => {
    expect(SHORT_NOTICE_DAYS).toBe(7);
  });

  it('definierar admin/projekt/forsaljning som mottagare', () => {
    expect(SHORT_NOTICE_NOTIFY_ROLES).toEqual(['admin', 'projekt', 'forsaljning']);
  });
});

describe('formatDaysUntil', () => {
  it.each([
    [null, 'okänt datum'],
    [0, 'idag'],
    [1, 'imorgon'],
    [3, 'om 3 dagar'],
    [-2, 'för 2 dagar sedan'],
  ])('formaterar %s → %s', (days, expected) => {
    expect(formatDaysUntil(days as number | null)).toBe(expected);
  });
});
