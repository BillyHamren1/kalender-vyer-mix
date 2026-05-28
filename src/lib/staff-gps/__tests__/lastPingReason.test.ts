import { describe, it, expect } from 'vitest';
import { inferLastPingReason } from '../lastPingReason';
import type { DaySegment } from '../dayPartition';

function seg(type: DaySegment['type'], endIso: string): DaySegment {
  return {
    type,
    label: type,
    start: endIso,
    end: endIso,
    minutes: 10,
  };
}

describe('inferLastPingReason', () => {
  it('returnerar null utan input', () => {
    expect(inferLastPingReason(null, null)).toBeNull();
    expect(inferLastPingReason(seg('work', '2026-05-28T20:00:00Z'), null)).toBeNull();
  });

  it('private = hem → avslutad dag, ingen varning', () => {
    const r = inferLastPingReason(seg('private', '2026-05-28T18:00:00Z'), '2026-05-28T18:00:00Z', 'Raivis Berzins');
    expect(r?.kind).toBe('home_end_of_day');
    expect(r?.warn).toBe(false);
    expect(r?.text).toContain('Raivis');
  });

  it('gps_gap → signalförlust, varning', () => {
    const r = inferLastPingReason(seg('gps_gap', '2026-05-28T15:00:00Z'), '2026-05-28T15:00:00Z');
    expect(r?.kind).toBe('signal_lost');
    expect(r?.warn).toBe(true);
  });

  it('travel cutoff → varning', () => {
    const r = inferLastPingReason(seg('travel', '2026-05-28T14:00:00Z'), '2026-05-28T14:00:00Z');
    expect(r?.kind).toBe('travel_cutoff');
    expect(r?.warn).toBe(true);
  });

  it('work sent på kvällen → normalt slut, ingen varning', () => {
    // 23:00 lokal tid
    const iso = new Date(2026, 4, 28, 23, 0).toISOString();
    const r = inferLastPingReason(seg('work', iso), iso);
    expect(r?.kind).toBe('normal_end_of_day');
    expect(r?.warn).toBe(false);
  });

  it('work mitt på dagen → batteri/app, varning', () => {
    const iso = new Date(2026, 4, 28, 14, 0).toISOString();
    const r = inferLastPingReason(seg('work', iso), iso);
    expect(r?.kind).toBe('battery_or_app_closed');
    expect(r?.warn).toBe(true);
  });
});
