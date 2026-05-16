import { describe, it, expect } from 'vitest';
import {
  computeBatteryDiagnostics,
  EMPTY_BATTERY_DIAGNOSTICS,
  type BatteryPingInput,
} from '../batteryDiagnostics';

function ping(
  iso: string,
  pct: number | null,
  charging: boolean | null = null,
  level: number | null = null,
): BatteryPingInput {
  return {
    recorded_at: iso,
    battery_percent: pct,
    battery_level: level,
    is_charging: charging,
    battery_source: pct === null && level === null ? null : 'capacitor_device',
  };
}

const END = new Date('2026-05-16T20:00:00Z').getTime();

describe('computeBatteryDiagnostics', () => {
  it('returns EMPTY for no pings', () => {
    expect(computeBatteryDiagnostics([], END)).toEqual(EMPTY_BATTERY_DIAGNOSTICS);
  });

  it('counts missing samples when no battery columns present', () => {
    const out = computeBatteryDiagnostics(
      [ping('2026-05-16T08:00:00Z', null), ping('2026-05-16T08:30:00Z', null)],
      END,
    );
    expect(out.batterySamplesCount).toBe(0);
    expect(out.missingBatterySamplesCount).toBe(2);
    expect(out.likelyBatteryRelatedSignalLoss).toBe(false);
  });

  it('computes first/last/min/max + charging', () => {
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 80, false),
        ping('2026-05-16T10:00:00Z', 60, false),
        ping('2026-05-16T12:00:00Z', 55, true),
      ],
      END,
    );
    expect(out.firstBatteryPercent).toBe(80);
    expect(out.lastBatteryPercent).toBe(55);
    expect(out.minBatteryPercent).toBe(55);
    expect(out.maxBatteryPercent).toBe(80);
    expect(out.latestIsCharging).toBe(true);
    expect(out.batterySamplesCount).toBe(3);
  });

  it('derives percent from level when percent missing', () => {
    const out = computeBatteryDiagnostics(
      [ping('2026-05-16T08:00:00Z', null, false, 0.42)],
      END,
    );
    expect(out.firstBatteryPercent).toBe(42);
    expect(out.batterySamplesCount).toBe(1);
  });

  it('flags fast drop over the day (>30 pp total)', () => {
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 90),
        ping('2026-05-16T18:00:00Z', 50),
      ],
      END,
    );
    expect(out.batteryDroppedFast).toBe(true);
  });

  it('flags fast drop in a 60-min rolling window (>15 pp)', () => {
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 80),
        ping('2026-05-16T08:30:00Z', 60), // -20 pp in 30 min
        ping('2026-05-16T09:00:00Z', 58),
      ],
      END,
    );
    expect(out.batteryDroppedFast).toBe(true);
  });

  it('does not flag fast drop for a normal day', () => {
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 95),
        ping('2026-05-16T12:00:00Z', 85),
        ping('2026-05-16T17:00:00Z', 75),
      ],
      END,
    );
    expect(out.batteryDroppedFast).toBe(false);
  });

  it('flags likelyBatteryRelatedSignalLoss when last ping <=10% and window still open', () => {
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 60),
        ping('2026-05-16T12:00:00Z', 25),
        ping('2026-05-16T14:00:00Z', 8, false),
      ],
      END, // 20:00 — 6 h silence after last low ping
    );
    expect(out.likelyBatteryRelatedSignalLoss).toBe(true);
  });

  it('does not flag signal loss if last low ping is at very end of window', () => {
    const lastTs = '2026-05-16T19:50:00Z'; // only 10 min before END
    const out = computeBatteryDiagnostics(
      [
        ping('2026-05-16T08:00:00Z', 60),
        ping(lastTs, 8),
      ],
      END,
    );
    expect(out.likelyBatteryRelatedSignalLoss).toBe(false);
  });
});
