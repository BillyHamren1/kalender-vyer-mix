/**
 * Etapp 2 — Auto-start får endast skapa dagtimer.
 *
 * Verifierar att processGpsTimelineForAutoStart:
 *   • aldrig sätter start_target_type / start_target_id / current_target_*
 *     när en GPS-driven auto-start sker
 *   • alltid sätter current_kind='day_active' + current_label='Arbetsdag aktiv'
 *   • behåller matched target som metadata.evidence.evidenceTarget
 *   • returnerar de flata diagnostics-fälten (autoStartEvaluated/Created/
 *     Reason, rejectedReason, evidenceTarget, existingActiveRegistrationFound,
 *     deniedByUserToday)
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { processGpsTimelineForAutoStart } from './processGpsTimelineForAutoStart.ts';
import type { GpsDayTimelineResult } from './buildGpsDayTimeline.ts';
import type { ResolvedWorkTarget } from './resolveWorkTargets.ts';

const ORG = '11111111-1111-1111-1111-111111111111';
const STAFF = '22222222-2222-2222-2222-222222222222';
const TARGET = '33333333-3333-3333-3333-333333333333';
const DATE = '2026-05-13';

function makeAdmin(captured: { insert?: any } = {}) {
  // Generic chain proxy: every method returns a thenable that resolves to
  // { data: null, error: null } and also exposes itself as a chain target.
  // `.maybeSingle()` and `.single()` resolve immediately. Insert is captured.
  const emptyResult = { data: null, error: null };
  const arrayResult = { data: [], error: null };

  function chain(): any {
    const p: any = new Proxy(function () { /* no-op */ } as any, {
      get(_t, prop) {
        if (prop === 'then') {
          // Make awaitable → resolve with empty array (covers .gt(...).await()
          // patterns used by loadAutoStartDeclines).
          return (resolve: (v: any) => void) => resolve(arrayResult);
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return async () => emptyResult;
        }
        return chain;
      },
      apply() {
        return chain();
      },
    });
    return p;
  }

  return {
    from(_table: string) {
      return {
        select: () => chain(),
        insert: (payload: any) => {
          captured.insert = payload;
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'reg-1' }, error: null }),
            }),
          };
        },
      } as any;
    },
  } as any;
}

function makeAllowedTimeline(): GpsDayTimelineResult {
  // Lång stay (40 min) på matchat target, hög confidence → policy: allowed.
  return {
    staffId: STAFF,
    organizationId: ORG,
    date: DATE,
    segments: [
      {
        id: 'seg-1',
        startTs: '2026-05-13T07:00:00Z',
        endTs: '2026-05-13T07:40:00Z',
        durationMin: 40,
        kind: 'stay',
        type: 'known_site',
        pingCount: 12,
        confidence: 0.95,
        matchedTargetId: TARGET,
        matchedTargetType: 'project',
        matchedTargetName: 'Acme rig',
        centerLat: 59.3,
        centerLng: 18.07,
      } as any,
    ],
    diagnostics: {} as any,
  } as any;
}

function makeTargets(): ResolvedWorkTarget[] {
  return [
    {
      id: TARGET,
      type: 'project',
      name: 'Acme rig',
      lat: 59.3,
      lng: 18.07,
      radiusMeters: 200,
      timeTrackingAllowed: true,
      targetSource: 'planned_today',
      targetValidity: 'valid',
    } as any,
  ];
}

Deno.test('auto-start inserts a target-less day timer (start_target_* = null)', async () => {
  const captured: { insert?: any } = {};
  const admin = makeAdmin(captured);

  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG,
    staffId: STAFF,
    date: DATE,
    gpsDayTimeline: makeAllowedTimeline(),
    targets: makeTargets(),
    supabaseAdmin: admin,
    localTime: '2026-05-13T07:45:00Z',
  });

  assert(captured.insert, 'expected an insert into active_time_registrations');
  assertEquals(captured.insert.start_target_type, null);
  assertEquals(captured.insert.start_target_id, null);
  assertEquals(captured.insert.start_target_label, null);
  assertEquals(captured.insert.current_target_type, null);
  assertEquals(captured.insert.current_target_id, null);
  assertEquals(captured.insert.current_kind, 'day_active');
  assertEquals(captured.insert.current_label, 'Arbetsdag aktiv');
  assertEquals(captured.insert.start_source, 'gps_geofence_auto_start');
  assertEquals(captured.insert.auto_started, true);
  // Matched target survives ONLY as evidence inside metadata.
  assertEquals(captured.insert.metadata?.timerModel, 'single_day_timer');
  assertEquals(captured.insert.metadata?.evidence?.evidenceTarget?.id, TARGET);
  assertEquals(captured.insert.metadata?.evidence?.evidenceTarget?.type, 'project');

  assertEquals(result.autoStartEvaluated, true);
  assertEquals(result.autoStartCreated, true);
  assertEquals(result.rejectedReason, null);
  assertEquals(result.evidenceTarget?.id, TARGET);
  assertEquals(result.existingActiveRegistrationFound, false);
  assertEquals(result.deniedByUserToday, false);
  assert(typeof result.autoStartReason === 'string');
});

Deno.test('auto-start with no qualified segment surfaces rejectedReason', async () => {
  const captured: { insert?: any } = {};
  const admin = makeAdmin(captured);

  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG,
    staffId: STAFF,
    date: DATE,
    gpsDayTimeline: {
      staffId: STAFF,
      organizationId: ORG,
      date: DATE,
      segments: [],
      diagnostics: {} as any,
    } as any,
    targets: makeTargets(),
    supabaseAdmin: admin,
    localTime: '2026-05-13T07:45:00Z',
  });

  assertEquals(captured.insert, undefined);
  assertEquals(result.autoStartCreated, false);
  assertEquals(result.rejectedReason, 'no_qualified_segment');
  assertEquals(result.evidenceTarget, null);
});
