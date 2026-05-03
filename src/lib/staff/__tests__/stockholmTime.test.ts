// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stockholmWallClockToIso } from '../stockholmTime';

describe('stockholmWallClockToIso', () => {
  it('CEST: 2026-05-03 05:06:35 lokal → 03:06:35 UTC', () => {
    expect(stockholmWallClockToIso('2026-05-03', '05:06:35')).toBe('2026-05-03T03:06:35.000Z');
  });

  it('CEST: 2026-05-03 12:10:20 lokal → 10:10:20 UTC', () => {
    expect(stockholmWallClockToIso('2026-05-03', '12:10:20')).toBe('2026-05-03T10:10:20.000Z');
  });

  it('CET (vinter): 2026-01-15 08:00 lokal → 07:00 UTC', () => {
    expect(stockholmWallClockToIso('2026-01-15', '08:00')).toBe('2026-01-15T07:00:00.000Z');
  });

  it('Dagen FÖRE DST-övergång (våren 2026, 27 mars): 12:00 lokal → 11:00 UTC (CET)', () => {
    expect(stockholmWallClockToIso('2026-03-28', '12:00')).toBe('2026-03-28T11:00:00.000Z');
  });

  it('Dagen EFTER DST-övergång (våren 2026, 29 mars): 12:00 lokal → 10:00 UTC (CEST)', () => {
    expect(stockholmWallClockToIso('2026-03-29', '12:00')).toBe('2026-03-29T10:00:00.000Z');
  });

  it('Hanterar HH:mm utan sekunder', () => {
    expect(stockholmWallClockToIso('2026-05-03', '05:06')).toBe('2026-05-03T03:06:00.000Z');
  });
});
