import { describe, it, expect } from 'vitest';
import {
  createExitTracker,
  recordExitPing,
  evaluateStableExit,
  buildExitMetadata,
  EXIT_PING_MIN_SPAN_MS,
} from '../stableExit';

const SECOND = 1000;

describe('stableExit gate', () => {
  it('a single bad GPS ping outside radius does NOT trigger stop', () => {
    const t = createExitTracker();
    const now = Date.now();
    recordExitPing(t, { ts: now, distance: 500, accuracy: 30 });
    const ev = evaluateStableExit(t, now, 1000);
    expect(ev.status).toBe('insufficient');
  });

  it('3 stable outside-pings spanning ≥2min stops activity (but NOT workday)', () => {
    const t = createExitTracker();
    const t0 = Date.now();
    recordExitPing(t, { ts: t0, distance: 400, accuracy: 25 });
    recordExitPing(t, { ts: t0 + 70 * SECOND, distance: 600, accuracy: 25 });
    recordExitPing(t, { ts: t0 + EXIT_PING_MIN_SPAN_MS + SECOND, distance: 800, accuracy: 25 });
    const ev = evaluateStableExit(t, t0 + EXIT_PING_MIN_SPAN_MS + SECOND, 5_000);
    expect(ev.status).toBe('stable');
    // Module is not allowed to touch workdays — test guarantees we only
    // expose 'stable' as the activity-stop signal.
  });

  it('3 outside-pings with bad accuracy → unstable (no auto-stop)', () => {
    const t = createExitTracker();
    const t0 = Date.now();
    recordExitPing(t, { ts: t0, distance: 400, accuracy: 200 });
    recordExitPing(t, { ts: t0 + 70 * SECOND, distance: 600, accuracy: 250 });
    recordExitPing(t, { ts: t0 + 130 * SECOND, distance: 800, accuracy: 300 });
    const ev = evaluateStableExit(t, t0 + 130 * SECOND, 5_000);
    expect(ev.status).toBe('unstable');
  });

  it('no recent ping → no_signal, never stops anything', () => {
    const t = createExitTracker();
    const now = Date.now();
    recordExitPing(t, { ts: now - 60 * SECOND, distance: 400, accuracy: 25 });
    const ev = evaluateStableExit(t, now, /*lastPingAge*/ 10 * 60 * SECOND);
    expect(ev.status).toBe('no_signal');
  });

  it('null lastPingAge → no_signal', () => {
    const t = createExitTracker();
    const ev = evaluateStableExit(t, Date.now(), null);
    expect(ev.status).toBe('no_signal');
  });

  it('auto-stop metadata captures ping count, span and distances', () => {
    const t = createExitTracker();
    const t0 = Date.now();
    recordExitPing(t, { ts: t0, distance: 400, accuracy: 25 });
    recordExitPing(t, { ts: t0 + 70 * SECOND, distance: 600, accuracy: 30 });
    recordExitPing(t, { ts: t0 + 130 * SECOND, distance: 850, accuracy: 20 });
    const ev = evaluateStableExit(t, t0 + 130 * SECOND, 5_000);
    const meta = buildExitMetadata(ev);
    expect(meta.exit_status).toBe('stable');
    expect(meta.exit_ping_count).toBe(3);
    expect(meta.exit_distance_min_m).toBe(400);
    expect(meta.exit_distance_max_m).toBe(850);
    expect(meta.exit_accuracy_min_m).toBe(20);
    expect(meta.exit_first_at).toBeDefined();
    expect(meta.exit_last_at).toBeDefined();
  });
});
