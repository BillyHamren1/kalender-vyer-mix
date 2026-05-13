/**
 * Contract: buildTimerOwnershipDiagnostics is READ-ONLY and surfaces
 * the keys promised by the spec, even when the underlying tables are
 * missing data or throw. Used to verify Single Timer Policy at runtime.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildTimerOwnershipDiagnostics } from './buildTimerOwnershipDiagnostics.ts';

function makeAdmin(rows: Record<string, any>) {
  return {
    from(table: string) {
      const ctx: any = { table };
      const chain: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          ctx.head = !!opts?.head;
          return chain;
        },
        eq() { return chain; },
        gt() { return chain; },
        gte() { return chain; },
        lte() { return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
        then(resolve: (v: any) => void) {
          if (ctx.head) {
            return resolve({ count: rows[`${table}.count`] ?? 0, error: null });
          }
          return resolve({ data: rows[table] ?? [], error: null });
        },
      };
      return chain;
    },
  } as any;
}

Deno.test('returns full diagnostics shape with no data', async () => {
  const d = await buildTimerOwnershipDiagnostics({
    admin: makeAdmin({}),
    organizationId: 'org', staffId: 'staff', date: '2026-05-13',
  });
  assertEquals(d.activeRegistrationStatus, 'none');
  assertEquals(d.autoStarted, null);
  assertEquals(d.autoStopped, null);
  assertEquals(d.homeDetected, false);
  assertEquals(d.userDeclinedToday.count, 0);
  assertEquals(d.legacyTimerSourcesDetected.currentTimeRegistrationOpen, 0);
  assertEquals(d.legacyTimerSourcesDetected.locationTimeEntriesOpen, 0);
  assertEquals(d.legacyTimerSourcesDetected.workdaysOpenToday, 0);
  assert(typeof d.generatedAt === 'string');
});

Deno.test('surfaces active registration + auto_stopped flag', async () => {
  const d = await buildTimerOwnershipDiagnostics({
    admin: makeAdmin({
      active_time_registrations: {
        id: 'reg-1', status: 'stopped',
        started_at: '2026-05-13T07:00:00Z',
        stopped_at: '2026-05-13T16:00:00Z',
        start_source: 'gps_geofence_auto_start', stop_source: 'auto_workday_close',
        auto_started: true,
        current_target_type: 'project', current_target_id: 'p1', current_label: 'Projekt A',
      },
    }),
    organizationId: 'org', staffId: 'staff', date: '2026-05-13',
  });
  assertEquals(d.activeRegistrationId, 'reg-1');
  assertEquals(d.activeRegistrationStatus, 'stopped');
  assertEquals(d.autoStarted, true);
  assertEquals(d.autoStopped, true);
  assertEquals(d.startSource, 'gps_geofence_auto_start');
  assertEquals(d.stopSource, 'auto_workday_close');
  assertEquals(d.lastWorkAnchor?.targetLabel, 'Projekt A');
});

Deno.test('flags legacy timer leakage when counts are non-zero', async () => {
  const d = await buildTimerOwnershipDiagnostics({
    admin: makeAdmin({
      'current_time_registration.count': 1,
      'location_time_entries.count': 2,
      'workdays.count': 0,
    }),
    organizationId: 'org', staffId: 'staff', date: '2026-05-13',
  });
  assertEquals(d.legacyTimerSourcesDetected.currentTimeRegistrationOpen, 1);
  assertEquals(d.legacyTimerSourcesDetected.locationTimeEntriesOpen, 2);
  assertEquals(d.legacyTimerSourcesDetected.workdaysOpenToday, 0);
});
