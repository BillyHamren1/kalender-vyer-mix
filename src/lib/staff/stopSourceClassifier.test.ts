import { describe, it, expect } from 'vitest';
import {
  classifyStopSource,
  inlineStopSuffix,
  isStopConfident,
} from './stopSourceClassifier';

const base = { exitedAt: '2026-05-05T12:25:00Z', lteId: 'lte-1' };

function classify(source: string | null, metadata: Record<string, any> | null) {
  return classifyStopSource({ ...base, source, metadata });
}

describe('stopSourceClassifier', () => {
  it('1. user stop → "av användare", confident', () => {
    const cls = classify('mobile_app', { stop_source: 'user', stop_reason: 'user_pressed_stop' });
    expect(cls.key).toBe('user_manual');
    expect(inlineStopSuffix(cls, { stop_source: 'user' })).toBe(' · av användare');
    expect(isStopConfident(cls)).toBe(true);
  });

  it('2. admin stop → "av admin", confident', () => {
    const cls = classify('admin_ui', { stop_source: 'admin_manual', stopped_by: 'admin:42' });
    expect(cls.key).toBe('admin');
    expect(inlineStopSuffix(cls, { stop_source: 'admin_manual' })).toBe(' · av admin');
    expect(isStopConfident(cls)).toBe(true);
  });

  it('3. server auto-switch → "auto-switch till <next>", confident', () => {
    const meta = {
      stop_source: 'server_auto_switch',
      switch: { next_target: { label: 'Workman Event AB' }, departure_at: base.exitedAt },
      run_id: 'run-1',
    };
    const cls = classify('geofence_auto_switch_server', meta);
    expect(cls.key).toBe('server_auto_switch');
    expect(inlineStopSuffix(cls, meta)).toBe(' · auto-switch till Workman Event AB');
    expect(isStopConfident(cls)).toBe(true);
  });

  it('3b. server auto-switch utan next label → generisk auto-switch', () => {
    const meta = { stop_source: 'server_auto_switch', switch: {} };
    const cls = classify('geofence_auto_switch_server', meta);
    expect(inlineStopSuffix(cls, meta)).toBe(' · auto-switch (server)');
  });

  it('4. geofence foreground exit → "lämnade plats", confident', () => {
    const meta = { stop_source: 'geofence_auto', stop_reason: 'stable_exit' };
    const cls = classify('auto_geofence', meta);
    expect(cls.key).toBe('geofence_foreground');
    expect(inlineStopSuffix(cls, meta)).toBe(' · lämnade plats');
    expect(isStopConfident(cls)).toBe(true);
  });

  it('5. time report save → "sparad tidrapport", confident', () => {
    const meta = { stop_source: 'time_report_save', linked_time_report_id: 'tr-9' };
    const cls = classify('save_then_stop', meta);
    expect(cls.key).toBe('time_report_save');
    expect(inlineStopSuffix(cls, meta)).toBe(' · sparad tidrapport');
    expect(isStopConfident(cls)).toBe(true);
  });

  it('6. legacy row utan stop_source → "källa okänd", OSÄKER', () => {
    const cls = classify(null, null);
    expect(cls.key).toBe('unknown');
    expect(inlineStopSuffix(cls, null)).toBe(' · källa okänd');
    expect(isStopConfident(cls)).toBe(false);
  });

  it('6b. legacy backfill stop_source="legacy_unknown" → OSÄKER', () => {
    const cls = classify('legacy', { stop_source: 'legacy_unknown', stop_reason: 'unknown' });
    expect(isStopConfident(cls)).toBe(false);
  });

  it('7. watchdog/stale stop räknas som confident men ej "användare"', () => {
    const cls = classify('watchdog', { stop_source: 'watchdog', stop_reason: 'stale_timer_closed' });
    expect(cls.key).toBe('watchdog');
    expect(inlineStopSuffix(cls, { stop_source: 'watchdog' })).toBe(' · stale / auto-stängd');
    expect(isStopConfident(cls)).toBe(true);
  });
});
