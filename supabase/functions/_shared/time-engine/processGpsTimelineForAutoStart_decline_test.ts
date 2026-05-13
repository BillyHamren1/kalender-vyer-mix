/**
 * Contract: Auto-start decline log MUST hard-block GPS auto-start for the
 * same staff/local-day/target (or geographic point) until expires_at.
 *
 * Manual start (start_time_registration) bypasses this engine entirely
 * and is therefore always allowed — this test asserts only the GPS path.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { processGpsTimelineForAutoStart } from './processGpsTimelineForAutoStart.ts';
import type { ResolvedWorkTarget } from './resolveWorkTargets.ts';
import type { GpsDayTimelineResult } from './buildGpsDayTimeline.ts';

const ORG = '00000000-0000-0000-0000-000000000001';
const STAFF = '00000000-0000-0000-0000-000000000010';
const PROJECT = '00000000-0000-0000-0000-000000000100';
const DATE = '2026-05-13';

function makeAdmin(opts: {
  declines?: Array<Record<string, unknown>>;
  privateZones?: Array<Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      const ctx: any = { table, filters: [] as Array<[string, unknown]> };
      const chain: any = {
        select() { return chain; },
        eq(col: string, val: unknown) { ctx.filters.push([col, val]); return chain; },
        gt() { return chain; },
        lte() { return chain; },
        gte() { return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() {
          if (table === 'active_time_registrations') return { data: null, error: null };
          if (table === 'time_auto_start_suppressions') return { data: null, error: null };
          return { data: null, error: null };
        },
        then(resolve: (v: any) => void) {
          if (table === 'auto_start_decline_log') {
            return resolve({ data: opts.declines ?? [], error: null });
          }
          if (table === 'staff_inferred_home_locations' || table === 'staff_private_zones') {
            return resolve({ data: opts.privateZones ?? [], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  } as any;
}

function makeTimeline(): GpsDayTimelineResult {
  return {
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [{
      id: 'seg-1', startTs: '2026-05-13T07:30:00.000Z', endTs: '2026-05-13T08:00:00.000Z',
      durationMin: 30, kind: 'stay', type: 'known_site',
      pingCount: 6, confidence: 0.9, isStaleOrCached: false,
      matchedTargetId: PROJECT, matchedTargetType: 'project', matchedTargetName: 'Projekt A',
      centerLat: 59.33, centerLng: 18.06,
    } as any],
    diagnostics: {} as any,
  } as any;
}

const target: ResolvedWorkTarget = {
  id: PROJECT, type: 'project', name: 'Projekt A',
  lat: 59.33, lng: 18.06, radiusMeters: 100,
  targetValidity: 'valid', timeTrackingAllowed: true,
  targetSource: 'planned_today',
} as any;

Deno.test('decline by target_id suppresses GPS auto-start', async () => {
  const admin = makeAdmin({
    declines: [{
      id: 'd1', target_type: 'project', target_id: PROJECT,
      lat: null, lng: null, radius_m: null,
      expires_at: '2026-05-13T23:59:59.000Z',
    }],
  });
  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG, staffId: STAFF, date: DATE,
    localTime: '2026-05-13T08:05:00.000Z',
    gpsDayTimeline: makeTimeline(),
    targets: [target], supabaseAdmin: admin,
  });
  assertEquals(result.createdRegistrationId, null);
  assert(result.declineLock, 'expected declineLock');
  assertEquals(result.declineLock!.suppressedSegmentsCount, 1);
  assertEquals(result.declineLock!.matchedByTargetCount, 1);
  const d = result.decisions[0];
  assertEquals(d.decision.allowed, false);
  assertEquals(d.decision.reason, 'blocked_user_declined_today');
  assertEquals(d.skippedReason, 'user_declined_today');
  assertEquals(d.declineDiagnostics?.declineMatchedTarget, true);
});

Deno.test('decline by lat/lng radius suppresses GPS auto-start', async () => {
  const admin = makeAdmin({
    declines: [{
      id: 'd2', target_type: null, target_id: null,
      lat: 59.3301, lng: 18.0601, radius_m: 200,
      expires_at: '2026-05-13T23:59:59.000Z',
    }],
  });
  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG, staffId: STAFF, date: DATE,
    localTime: '2026-05-13T08:05:00.000Z',
    gpsDayTimeline: makeTimeline(),
    targets: [target], supabaseAdmin: admin,
  });
  assertEquals(result.createdRegistrationId, null);
  assert(result.declineLock);
  assertEquals(result.declineLock!.matchedByRadiusCount, 1);
  assertEquals(result.decisions[0].decision.reason, 'blocked_user_declined_today');
});

Deno.test('no decline → engine proceeds normally (no decline lock)', async () => {
  const admin = makeAdmin({ declines: [] });
  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG, staffId: STAFF, date: DATE,
    localTime: '2026-05-13T08:05:00.000Z',
    gpsDayTimeline: makeTimeline(),
    targets: [target], supabaseAdmin: admin, dryRun: true,
  });
  assertEquals(result.declineLock, null);
});
