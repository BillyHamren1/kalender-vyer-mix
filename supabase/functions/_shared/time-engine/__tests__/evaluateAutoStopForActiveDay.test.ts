// Tests for evaluateAutoStopForActiveDay (pure module).
//
// Run with:
//   bunx vitest run supabase/functions/_shared/time-engine/__tests__/evaluateAutoStopForActiveDay
//
// or via Deno test runner.

import { describe, it, expect } from 'vitest';
import {
  evaluateAutoStopForActiveDay,
  type EvaluateAutoStopInput,
} from '../evaluateAutoStopForActiveDay.ts';

const NOW = '2026-05-13T18:00:00Z';

function baseReg(overrides: Partial<EvaluateAutoStopInput['registration']> = {}) {
  return {
    id: 'reg-1',
    staffId: 'staff-1',
    organizationId: 'org-1',
    startedAtIso: '2026-05-13T07:00:00Z',
    status: 'active',
    stoppedAtIso: null,
    startSource: 'user_timer',
    ...overrides,
  };
}

describe('evaluateAutoStopForActiveDay', () => {
  it('rejects when registration is already stopped', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg({ status: 'stopped', stoppedAtIso: '2026-05-13T17:00:00Z' }),
      workAnchors: [],
      pingsAfterLastAnchor: [],
      homeZones: [],
      nowIso: NOW,
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('already_stopped');
  });

  it('rejects when staff is still inside a work anchor', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'project',
        targetId: 'p1',
        label: 'Projekt A',
        enteredAtIso: '2026-05-13T08:00:00Z',
        exitedAtIso: null,
        lat: 59.33, lng: 18.06,
      }],
      pingsAfterLastAnchor: [],
      homeZones: [],
      nowIso: NOW,
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('still_inside_work_anchor');
  });

  it('stops with gps_home_auto_stop after home dwell ≥ threshold', () => {
    // Senaste arbete: lager-exit 17:10. Hem-pings börjar 17:15. Now 19:00 → dwell 105 min.
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'warehouse',
        targetId: 'loc-1',
        label: 'Lager',
        enteredAtIso: '2026-05-13T16:00:00Z',
        exitedAtIso: '2026-05-13T17:10:00Z',
        lat: 59.40, lng: 17.95,
      }],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T17:15:00Z', lat: 59.30, lng: 18.10 },
        { recordedAtIso: '2026-05-13T17:45:00Z', lat: 59.30, lng: 18.10 },
        { recordedAtIso: '2026-05-13T18:30:00Z', lat: 59.30, lng: 18.10 },
        { recordedAtIso: '2026-05-13T18:55:00Z', lat: 59.30, lng: 18.10 },
      ],
      homeZones: [{ lat: 59.30, lng: 18.10, radiusM: 150, kind: 'inferred_home' }],
      nowIso: '2026-05-13T19:00:00Z',
    });
    expect(r.stop).toBe(true);
    if (r.stop) {
      expect(r.stopSource).toBe('gps_home_auto_stop');
      // Backdatas till firstHomeHit = 17:15 (efter exit 17:10).
      expect(r.stopAtIso).toBe('2026-05-13T17:15:00Z');
      expect(r.diagnostics.homeDetected).toBe(true);
    }
  });

  it('stops with gps_left_last_workplace after 90+ min idle with pings away from anchor', () => {
    // Lager-exit 17:10. Pings 17:30/18:15/18:30 långt borta från anchor men inte hemma.
    // Now 18:45 → idle 95 min ≥ 90.
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'warehouse',
        targetId: 'loc-1',
        label: 'Lager',
        enteredAtIso: '2026-05-13T16:00:00Z',
        exitedAtIso: '2026-05-13T17:10:00Z',
        lat: 59.40, lng: 17.95,
      }],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T17:30:00Z', lat: 59.20, lng: 18.30 },
        { recordedAtIso: '2026-05-13T18:15:00Z', lat: 59.20, lng: 18.30 },
        { recordedAtIso: '2026-05-13T18:30:00Z', lat: 59.20, lng: 18.30 },
      ],
      homeZones: [],
      nowIso: '2026-05-13T18:45:00Z',
    });
    expect(r.stop).toBe(true);
    if (r.stop) {
      expect(r.stopSource).toBe('gps_left_last_workplace_auto_stop');
      // Backdatas till exit-tiden 17:10.
      expect(r.stopAtIso).toBe('2026-05-13T17:10:00Z');
      expect(r.diagnostics.idleAfterWorkMinutes).toBe(95);
    }
  });

  it('rejects when idle < threshold', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'project',
        targetId: 'p1',
        label: 'Projekt A',
        enteredAtIso: '2026-05-13T13:00:00Z',
        exitedAtIso: '2026-05-13T17:30:00Z',
        lat: 59.33, lng: 18.06,
      }],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T17:50:00Z', lat: 59.20, lng: 18.30 },
      ],
      homeZones: [],
      nowIso: NOW, // 18:00 → idle 30 min
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('idle_below_threshold');
  });

  it('rejects when last ping is too old (stale signal)', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'project', targetId: 'p1', label: 'P', lat: 59.33, lng: 18.06,
        enteredAtIso: '2026-05-13T13:00:00Z',
        exitedAtIso: '2026-05-13T15:00:00Z',
      }],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T15:30:00Z', lat: 59.20, lng: 18.30 },
        { recordedAtIso: '2026-05-13T15:45:00Z', lat: 59.20, lng: 18.30 },
        { recordedAtIso: '2026-05-13T16:00:00Z', lat: 59.20, lng: 18.30 },
      ],
      homeZones: [],
      nowIso: '2026-05-13T19:00:00Z', // last ping 3h gammal > 60 min
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('last_ping_too_old');
  });

  it('rejects when last ping still inside work anchor radius', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [{
        kind: 'project', targetId: 'p1', label: 'P', lat: 59.33, lng: 18.06,
        enteredAtIso: '2026-05-13T13:00:00Z',
        exitedAtIso: '2026-05-13T16:00:00Z',
      }],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T17:50:00Z', lat: 59.3301, lng: 18.0601 }, // ~10m
      ],
      homeZones: [],
      nowIso: '2026-05-13T17:55:00Z',
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('still_inside_work_anchor');
  });

  it('hard caps when no work anchor exists for >18h', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg({ startedAtIso: '2026-05-12T22:00:00Z' }),
      workAnchors: [],
      pingsAfterLastAnchor: [],
      homeZones: [],
      nowIso: '2026-05-13T18:00:00Z', // 20h
    });
    expect(r.stop).toBe(true);
    if (r.stop) expect(r.stopSource).toBe('hard_cap_no_work_evidence');
  });

  it('does not hard cap when no anchors but timer is fresh', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg({ startedAtIso: '2026-05-13T15:00:00Z' }),
      workAnchors: [],
      pingsAfterLastAnchor: [],
      homeZones: [],
      nowIso: NOW, // 3h
    });
    expect(r.stop).toBe(false);
    if (!r.stop) expect(r.rejectedReason).toBe('no_work_anchors_yet');
  });

  it('respects warehouse-as-last-anchor (lager efter projekt)', () => {
    const r = evaluateAutoStopForActiveDay({
      registration: baseReg(),
      workAnchors: [
        { kind: 'project', targetId: 'p1', label: 'Projekt', lat: 59.33, lng: 18.06,
          enteredAtIso: '2026-05-13T08:00:00Z',
          exitedAtIso: '2026-05-13T15:30:00Z' },
        { kind: 'warehouse', targetId: 'loc-1', label: 'Lager', lat: 59.40, lng: 17.95,
          enteredAtIso: '2026-05-13T16:00:00Z',
          exitedAtIso: '2026-05-13T17:10:00Z' },
      ],
      pingsAfterLastAnchor: [
        { recordedAtIso: '2026-05-13T17:15:00Z', lat: 59.30, lng: 18.10 },
        { recordedAtIso: '2026-05-13T18:00:00Z', lat: 59.30, lng: 18.10 },
        { recordedAtIso: '2026-05-13T18:55:00Z', lat: 59.30, lng: 18.10 },
      ],
      homeZones: [{ lat: 59.30, lng: 18.10, radiusM: 150, kind: 'inferred_home' }],
      nowIso: '2026-05-13T19:00:00Z',
    });
    expect(r.stop).toBe(true);
    if (r.stop) {
      // Måste backdates till EFTER lager-exit, inte till projekt-exit.
      expect(new Date(r.stopAtIso).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-05-13T17:10:00Z').getTime(),
      );
      expect(r.diagnostics.lastWorkAnchor?.kind).toBe('warehouse');
    }
  });
});
