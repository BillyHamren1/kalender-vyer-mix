// ─────────────────────────────────────────────────────────────────────────────
// Contract: HOME WINS OVER WORK
//
// Verifies that when a candidate stay segment sits inside a staff
// private zone (staff_private_zones / staff_inferred_home_locations),
// processGpsTimelineForAutoStart:
//   • does NOT insert an active_time_registration
//   • emits decision.reason === 'blocked_inside_private_residence'
//   • populates homeWinsDiagnostics with matchedPrivateResidence,
//     privateResidenceDistanceMeters, competingWorkTarget,
//     homeWonOverWorkTarget, suppressedAutoStartBecauseHome
//   • returns privateResidenceLock summary
//
// Mobile app owns only day start/stop.
// Timeline allocation is owned by Time Engine.
// GPS/geofence is evidence only, not a project timer.
// ─────────────────────────────────────────────────────────────────────────────

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { processGpsTimelineForAutoStart } from './processGpsTimelineForAutoStart.ts';
import type { GpsDayTimelineResult } from './buildGpsDayTimeline.ts';
import type { ResolvedWorkTarget } from './resolveWorkTargets.ts';

// ── Fake admin client ────────────────────────────────────────────────────────

interface FakeRow { table: string; row: any }

function makeFakeAdmin(opts: {
  privateZones?: Array<{ lat: number; lng: number; radius_m: number; zone_kind: string }>;
  inferredHomes?: Array<{ lat: number; lng: number }>;
}) {
  const inserts: FakeRow[] = [];

  const fromBuilder = (table: string) => {
    const state: any = {
      _filters: [] as Array<[string, string, any]>,
      _isFilters: [] as Array<[string, any]>,
      _limit: null as number | null,
      _order: null as string | null,
      select(_cols: string) { return state; },
      eq(col: string, val: any) { state._filters.push([col, 'eq', val]); return state; },
      gte(col: string, val: any) { state._filters.push([col, 'gte', val]); return state; },
      lte(col: string, val: any) { state._filters.push([col, 'lte', val]); return state; },
      gt(col: string, val: any) { state._filters.push([col, 'gt', val]); return state; },
      lt(col: string, val: any) { state._filters.push([col, 'lt', val]); return state; },
      is(col: string, val: any) { state._isFilters.push([col, val]); return state; },
      order(col: string) { state._order = col; return state; },
      limit(n: number) { state._limit = n; return state; },
      maybeSingle() { return state.then(); },
      insert(row: any) {
        inserts.push({ table, row });
        return {
          select() { return this; },
          maybeSingle() { return Promise.resolve({ data: { id: 'new-reg' }, error: null }); },
        };
      },
      then(resolve?: any) {
        let data: any = null;
        if (table === 'active_time_registrations') data = null;
        else if (table === 'time_auto_start_suppressions') data = null;
        else if (table === 'staff_inferred_home_locations') {
          data = (opts.inferredHomes ?? []).map((h) => ({ lat: h.lat, lng: h.lng }));
        } else if (table === 'staff_private_zones') {
          data = (opts.privateZones ?? []).map((p) => ({
            lat: p.lat, lng: p.lng, radius_m: p.radius_m, zone_kind: p.zone_kind,
          }));
        } else { data = null; }
        const result = { data, error: null };
        return resolve ? resolve(result) : Promise.resolve(result);
      },
    };
    return state;
  };

  return {
    inserts,
    client: { from: (table: string) => fromBuilder(table) } as any,
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const STAFF = '00000000-0000-0000-0000-000000000002';
const PROJECT_ID = '00000000-0000-0000-0000-000000000010';
const DATE = '2026-05-13';

// Home and project at SAME spot (worst-case: project right at staff home).
const HOME = { lat: 59.3293, lng: 18.0686 };

function makeTimeline(): GpsDayTimelineResult {
  return {
    staffId: STAFF,
    organizationId: ORG,
    date: DATE,
    segments: [
      {
        id: 'seg-1',
        kind: 'stay',
        type: 'known_site',
        startTs: '2026-05-13T18:00:00Z',
        endTs: '2026-05-13T18:30:00Z',
        durationMin: 30,
        pingCount: 12,
        confidence: 0.9 as any,
        centerLat: HOME.lat,
        centerLng: HOME.lng,
        matchedTargetId: PROJECT_ID,
        matchedTargetType: 'project',
        matchedTargetName: 'Project Near Home',
        targetDiagnostics: {} as any,
        isStaleOrCached: false,
      } as any,
    ],
    diagnostics: {} as any,
  } as any;
}

function makeProjectTarget(): ResolvedWorkTarget {
  return {
    id: PROJECT_ID,
    type: 'project',
    name: 'Project Near Home',
    latitude: HOME.lat,
    longitude: HOME.lng,
    radiusMeters: 100,
    targetValidity: 'valid',
    timeTrackingAllowed: true,
    targetSource: 'planned_today',
    diagnostics: { notes: [] },
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

Deno.test('home wins over work — staff_private_zones suppresses auto-start at nearby project', async () => {
  const fake = makeFakeAdmin({
    privateZones: [{ lat: HOME.lat, lng: HOME.lng, radius_m: 150, zone_kind: 'private_residence' }],
  });

  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG,
    staffId: STAFF,
    date: DATE,
    gpsDayTimeline: makeTimeline(),
    targets: [makeProjectTarget()],
    supabaseAdmin: fake.client,
    localTime: '2026-05-13T18:30:00Z',
  });

  assertEquals(fake.inserts.length, 0, 'no active_time_registration may be inserted');
  assertEquals(result.createdRegistrationId, null);
  assertEquals(result.decisions.length, 1);

  const d = result.decisions[0];
  assertEquals(d.decision.allowed, false);
  assertEquals(d.decision.reason, 'blocked_inside_private_residence');
  assertEquals(d.skippedReason, 'inside_private_residence');

  assert(d.homeWinsDiagnostics, 'homeWinsDiagnostics must be populated');
  assertEquals(d.homeWinsDiagnostics!.matchedPrivateResidence, true);
  assertEquals(d.homeWinsDiagnostics!.suppressedAutoStartBecauseHome, true);
  assertEquals(d.homeWinsDiagnostics!.homeWonOverWorkTarget, true);
  assertEquals(d.homeWinsDiagnostics!.privateResidenceZoneKind, 'private_residence');
  assert(
    d.homeWinsDiagnostics!.privateResidenceDistanceMeters >= 0,
    'distance must be >= 0',
  );
  assertEquals(d.homeWinsDiagnostics!.competingWorkTarget?.id, PROJECT_ID);

  assert(result.privateResidenceLock, 'privateResidenceLock must be set');
  assertEquals(result.privateResidenceLock!.suppressedSegmentsCount, 1);
  assertEquals(result.privateResidenceLock!.homeWonOverWorkTargetCount, 1);
  assertEquals(result.privateResidenceLock!.nearestZoneKind, 'private_residence');
});

Deno.test('inferred home (without explicit private_zone row) also suppresses auto-start', async () => {
  const fake = makeFakeAdmin({
    inferredHomes: [{ lat: HOME.lat, lng: HOME.lng }],
  });

  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG,
    staffId: STAFF,
    date: DATE,
    gpsDayTimeline: makeTimeline(),
    targets: [makeProjectTarget()],
    supabaseAdmin: fake.client,
    localTime: '2026-05-13T18:30:00Z',
  });

  assertEquals(fake.inserts.length, 0);
  assertEquals(result.decisions[0].decision.reason, 'blocked_inside_private_residence');
  assertEquals(result.privateResidenceLock?.nearestZoneKind, 'inferred_home');
});

Deno.test('no private zone configured → project auto-start proceeds (still inserted)', async () => {
  const fake = makeFakeAdmin({});

  const result = await processGpsTimelineForAutoStart({
    organizationId: ORG,
    staffId: STAFF,
    date: DATE,
    gpsDayTimeline: makeTimeline(),
    targets: [makeProjectTarget()],
    supabaseAdmin: fake.client,
    localTime: '2026-05-13T18:30:00Z',
  });

  assertEquals(result.privateResidenceLock, null);
  // Note: we don't assert insert here — the decideAutoStart layer has its own
  // dwell/ping policy that may still deny. The contract verified by THIS test
  // is only "home suppression is OFF when no zones exist".
  const d = result.decisions[0];
  assert(
    d.decision.reason !== 'blocked_inside_private_residence',
    'must not be blocked by home when no zones configured',
  );
  assert(!d.homeWinsDiagnostics, 'no home diagnostics when no zones configured');
});
