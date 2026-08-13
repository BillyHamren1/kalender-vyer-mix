/**
 * STEG 4G — Operations- och incident guards för syncen.
 *
 * Verifierar:
 *  - global kill switch blockerar muterande sync (default = igång)
 *  - dry-run/read-only fungerar under paus
 *  - worker markerar ALDRIG completed vid paus, cursorn står still
 *  - request kan aldrig styra kill switchen
 *  - per-org metrics + anomaly flags, med strikt org-isolering
 *  - blockeringsaudit innehåller org/booking/reason/job/batch men inga secrets
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMutatingSyncPause,
  buildSyncBlockAudit,
  parsePausedOrgs,
  isGlobalPauseValue,
  MUTATING_SYNC_PAUSED,
  KILL_SWITCH_NOT_REQUEST_CONTROLLABLE,
} from '../../supabase/functions/_shared/syncKillSwitch.ts';
import {
  OrgMetricsRegistry,
  createOrgSafetyMetrics,
  recordSyncOutcome,
  detectOrgAnomalies,
  buildOrgMetricsLog,
  ANOMALY_THRESHOLDS,
} from '../../supabase/functions/_shared/syncOpsMetrics.ts';
import { validateSingleBookingResult } from '../../supabase/functions/_shared/singleBookingResult.ts';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

const PAUSED = { globalPaused: true, pausedOrgs: [] as string[] };
const RUNNING = { globalPaused: false, pausedOrgs: [] as string[] };

describe('STEG 4G — global kill switch', () => {
  it('default (ingen flagga) = sync körs, oförändrat beteende', () => {
    const d = resolveMutatingSyncPause({ organizationId: ORG_A, state: RUNNING });
    expect(d.paused).toBe(false);
    expect(d.scope).toBe('none');
  });

  it('endast exakt "true" pausar globalt', () => {
    expect(isGlobalPauseValue('true')).toBe(true);
    for (const v of ['True', 'TRUE', '1', 'yes', '', null, undefined]) {
      expect(isGlobalPauseValue(v as any)).toBe(false);
    }
  });

  it('global paus blockerar muterande sync', () => {
    const d = resolveMutatingSyncPause({ organizationId: ORG_A, state: PAUSED });
    expect(d.paused).toBe(true);
    expect(d.scope).toBe('global');
    expect(d.reason).toBe(MUTATING_SYNC_PAUSED);
  });

  it('org-scoped paus träffar endast angiven organisation', () => {
    const state = { globalPaused: false, pausedOrgs: parsePausedOrgs(`${ORG_A}`) };
    expect(resolveMutatingSyncPause({ organizationId: ORG_A, state }).paused).toBe(true);
    expect(resolveMutatingSyncPause({ organizationId: ORG_B, state }).paused).toBe(false);
  });

  it('parsePausedOrgs hanterar komma, semikolon och whitespace', () => {
    expect(parsePausedOrgs(` ${ORG_A}, ${ORG_B} ;`)).toEqual([ORG_A, ORG_B]);
    expect(parsePausedOrgs(null)).toEqual([]);
  });

  it('dry-run / read-only diagnostik fungerar under paus', () => {
    const d = resolveMutatingSyncPause({ organizationId: ORG_A, dryRun: true, state: PAUSED });
    expect(d.paused).toBe(false);
    expect(d.readOnlyAllowed).toBe(true);
  });

  it('request kan ALDRIG slå av pausen', () => {
    for (const key of ['pause', 'resume', 'kill_switch', 'force_sync', 'ignore_pause', 'override_pause']) {
      const d = resolveMutatingSyncPause({ organizationId: ORG_A, body: { [key]: false }, state: RUNNING });
      expect(d.paused).toBe(true);
      expect(d.reason).toBe(KILL_SWITCH_NOT_REQUEST_CONTROLLABLE);
    }
  });

  it('request kan ALDRIG slå på pausen för andras räkning heller (fail-closed)', () => {
    const d = resolveMutatingSyncPause({ organizationId: ORG_A, body: { NORMAL_MUTATING_SYNC_PAUSED: 'true' }, state: RUNNING });
    expect(d.paused).toBe(true);
    expect(d.scope).toBe('request_tamper');
  });

  it('tamper-check gäller även i dry-run', () => {
    const d = resolveMutatingSyncPause({ organizationId: ORG_A, dryRun: true, body: { resume: true }, state: RUNNING });
    expect(d.paused).toBe(true);
    expect(d.readOnlyAllowed).toBe(false);
  });
});

describe('STEG 4G — worker: ingen completion, ingen cursorflytt vid paus', () => {
  const expected = { bookingId: 'B-1', organizationId: ORG_A };

  it('outcome mutating_sync_paused ger completed=false och retriable', () => {
    const res = validateSingleBookingResult(
      {
        success: false,
        queued: false,
        completed: false,
        sync_mode: 'single',
        booking_id: 'B-1',
        organization_id: ORG_A,
        outcome: 'mutating_sync_paused',
        error: MUTATING_SYNC_PAUSED,
      },
      expected,
      { ok: true, status: 200 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.permanent).toBe(false);
      expect(res.reason).toBe('mutating_sync_paused');
    }
  });

  it('ett pausat svar kan aldrig maskeras som applied', () => {
    const res = validateSingleBookingResult(
      {
        success: true,
        queued: false,
        completed: true,
        sync_mode: 'single',
        booking_id: 'B-1',
        organization_id: ORG_A,
        outcome: 'applied',
        error: MUTATING_SYNC_PAUSED,
      },
      expected,
      { ok: true, status: 200 },
    );
    expect(res.ok).toBe(false);
  });

  it('paus-svar för fel organisation avvisas (org isolation)', () => {
    const res = validateSingleBookingResult(
      {
        success: false,
        queued: false,
        completed: false,
        sync_mode: 'single',
        booking_id: 'B-1',
        organization_id: ORG_B,
        outcome: 'mutating_sync_paused',
      },
      expected,
      { ok: true, status: 200 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.permanent).toBe(true);
  });
});

describe('STEG 4G — per-organization safety metrics', () => {
  it('räknar imports/applied/partial/failed/stale/conflicts/lease/retries/breaker/candidates', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'a', outcome: 'applied' });
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'b', outcome: 'partial' });
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'c', outcome: 'failed', retries: 2, lease_loss: true, circuit_breaker: true });
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'd', outcome: 'stale' });
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'e', outcome: 'conflict' });
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'f', outcome: 'cancellation_candidate' });

    expect(m.imports).toBe(6);
    expect(m.applied).toBe(1);
    expect(m.partial).toBe(1);
    expect(m.failed).toBe(1);
    expect(m.stale).toBe(1);
    expect(m.conflicts).toBe(1);
    expect(m.cancellation_candidates).toBe(1);
    expect(m.lease_losses).toBe(1);
    expect(m.retries).toBe(2);
    expect(m.circuit_breaker).toBe(1);
  });

  it('paus räknas som import men aldrig som fel', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'a', outcome: 'paused' });
    expect(m.imports).toBe(1);
    expect(m.failed).toBe(0);
    expect(detectOrgAnomalies(m).flags).toEqual([]);
  });

  it('organisationer hålls strikt isolerade', () => {
    const reg = new OrgMetricsRegistry();
    reg.record({ organization_id: ORG_A, booking_id: 'a', outcome: 'failed' });
    reg.record({ organization_id: ORG_B, booking_id: 'b', outcome: 'applied' });
    const a = reg.for(ORG_A);
    const b = reg.for(ORG_B);
    expect(a.failed).toBe(1);
    expect(a.applied).toBe(0);
    expect(b.failed).toBe(0);
    expect(b.applied).toBe(1);
    expect(reg.all()).toHaveLength(2);
  });
});

describe('STEG 4G — anomaly flags', () => {
  it('high_failure_rate kräver minst min_sample importer', () => {
    const small = createOrgSafetyMetrics(ORG_A);
    for (let i = 0; i < ANOMALY_THRESHOLDS.min_sample - 1; i++) {
      recordSyncOutcome(small, { organization_id: ORG_A, booking_id: `b${i}`, outcome: 'failed' });
    }
    expect(detectOrgAnomalies(small).flags).not.toContain('high_failure_rate');

    const big = createOrgSafetyMetrics(ORG_A);
    for (let i = 0; i < ANOMALY_THRESHOLDS.min_sample; i++) {
      recordSyncOutcome(big, { organization_id: ORG_A, booking_id: `b${i}`, outcome: 'failed' });
    }
    expect(detectOrgAnomalies(big).flags).toContain('high_failure_rate');
  });

  it('många product/calendar delete candidates flaggas', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, {
      organization_id: ORG_A,
      booking_id: 'a',
      outcome: 'applied',
      product_delete_candidates: ANOMALY_THRESHOLDS.product_delete_candidates,
      calendar_delete_candidates: ANOMALY_THRESHOLDS.calendar_delete_candidates,
    });
    const flags = detectOrgAnomalies(m).flags;
    expect(flags).toContain('many_product_delete_candidates');
    expect(flags).toContain('many_calendar_delete_candidates');
  });

  it('repeated_retry_same_booking flaggas per bokning', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    for (let i = 0; i < ANOMALY_THRESHOLDS.retries_same_booking; i++) {
      recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'same', outcome: 'failed', retries: 1 });
    }
    const a = detectOrgAnomalies(m);
    expect(a.flags).toContain('repeated_retry_same_booking');
    expect(a.details.repeated_retry_bookings).toEqual(['same']);
  });

  it('revision_went_backwards flaggas', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'x', outcome: 'stale', revision_went_backwards: true });
    expect(detectOrgAnomalies(m).flags).toContain('revision_went_backwards');
  });

  it('sudden_source_count_drop flaggas vid halverat källantal', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, outcome: 'applied', source_count: 20, previous_source_count: 100 });
    expect(detectOrgAnomalies(m).flags).toContain('sudden_source_count_drop');

    const stable = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(stable, { organization_id: ORG_A, outcome: 'applied', source_count: 98, previous_source_count: 100 });
    expect(detectOrgAnomalies(stable).flags).not.toContain('sudden_source_count_drop');
  });

  it('anomali pausar aldrig automatiskt — endast rekommendation', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'x', outcome: 'stale', revision_went_backwards: true });
    const a = detectOrgAnomalies(m);
    expect(a.recommend_pause).toBe(true);
    expect(resolveMutatingSyncPause({ organizationId: ORG_A, state: RUNNING }).paused).toBe(false);
  });
});

describe('STEG 4G — blockeringsaudit', () => {
  it('loggar org, booking, reason, job, batch och revision', () => {
    const audit = buildSyncBlockAudit({
      organization_id: ORG_A,
      booking_id: 'B-1',
      reason: MUTATING_SYNC_PAUSED,
      scope: 'global',
      job_id: 'job-1',
      batch_id: 'batch-1',
      source_revision: '2026-01-01T00:00:00.000Z',
      applied_revision: '2025-12-31T00:00:00.000Z',
      caller: 'import-bookings',
    });
    expect(audit).toMatchObject({
      organization_id: ORG_A,
      booking_id: 'B-1',
      reason: MUTATING_SYNC_PAUSED,
      job_id: 'job-1',
      batch_id: 'batch-1',
      mutations: 0,
      cursor_moved: false,
      job_completed: false,
    });
  });

  it('innehåller aldrig tokens eller secrets', () => {
    const audit = buildSyncBlockAudit({
      organization_id: ORG_A,
      booking_id: 'B-1',
      reason: MUTATING_SYNC_PAUSED,
      caller: 'import-bookings',
      // @ts-expect-error medvetet skräp för att bevisa filtreringen
      worker_token: 'secret-token',
      authorization: 'Bearer abc',
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('Bearer');
  });

  it('metrics-loggen innehåller endast räknare och flaggor', () => {
    const m = createOrgSafetyMetrics(ORG_A);
    recordSyncOutcome(m, { organization_id: ORG_A, booking_id: 'a', outcome: 'applied' });
    const log = buildOrgMetricsLog(m);
    expect(log.organization_id).toBe(ORG_A);
    expect(log.imports).toBe(1);
    expect(Object.keys(log).some((k) => /token|secret|key|password/i.test(k))).toBe(false);
  });
});
