/**
 * Focused contract tests for the additive Planning→Time Lager projection
 * (`planning-lager-context.v1`).
 *
 * Covers: transport/Lager applicability, exact warehouse assignment projection,
 * absence behaviour (no fabricated location), org scoping, and no source writes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildLagerContextProjection,
  isLagerTeamId,
  PLANNING_LAGER_CONTEXT_SCHEMA,
  resolveCanonicalLagerLocation,
  type LagerProjectionInput,
} from '../../../../supabase/functions/_shared/time-v2/lagerProjection';

const ORG = 'org-1';
const OTHER = 'org-2';

const location = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'loc-1',
  organization_id: ORG,
  name: 'FA Warehouse',
  address: 'Testgatan 1',
  latitude: 59.49,
  longitude: 17.85,
  radius_meters: 200,
  geofence_mode: 'polygon',
  location_type: 'warehouse',
  is_active: true,
  ...over,
}) as never;

const internalProject = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'proj-lager',
  organization_id: ORG,
  name: 'Lager',
  is_internal: true,
  location_id: 'loc-1',
  ...over,
}) as never;

const base = (over: Partial<LagerProjectionInput> = {}): LagerProjectionInput => ({
  organizationId: ORG,
  from: '2026-09-01',
  to: '2026-09-30',
  staffIds: null,
  locations: [location()],
  internalProjects: [internalProject()],
  staffAssignments: [],
  warehouseAssignments: [],
  warehouseCalendarEvents: [],
  ...over,
});

describe('isLagerTeamId', () => {
  it('accepts legacy transport/warehouse and lager-* columns only', () => {
    expect(isLagerTeamId('transport')).toBe(true);
    expect(isLagerTeamId('warehouse')).toBe(true);
    expect(isLagerTeamId('lager-2')).toBe(true);
    expect(isLagerTeamId('team-1')).toBe(false);
    expect(isLagerTeamId(null)).toBe(false);
  });
});

describe('canonical Lager location', () => {
  it('projects the exact Planning-owned record linked from the internal Lager project', () => {
    const p = buildLagerContextProjection(base());
    expect(p.schema).toBe(PLANNING_LAGER_CONTEXT_SCHEMA);
    expect(p.location).toMatchObject({
      kind: 'internal_location',
      targetKey: 'planning:location:loc-1',
      locationId: 'loc-1',
      internalProjectId: 'proj-lager',
      label: 'FA Warehouse',
      address: 'Testgatan 1',
      latitude: 59.49,
      longitude: 17.85,
      radiusMeters: 200,
      isExact: true,
    });
    expect(p.location?.provenance).toEqual({
      sourceTable: 'organization_locations',
      sourceRecordId: 'loc-1',
      contextType: 'schedule_context',
      isWorkEvidence: false,
    });
  });

  it('reports missing human-supplied fields instead of guessing them', () => {
    const p = buildLagerContextProjection(
      base({ locations: [location({ address: null, location_type: 'other' })] }),
    );
    expect(p.location?.isExact).toBe(false);
    expect(p.location?.address).toBeNull();
    expect(p.location?.missingFields).toContain('organization_locations.address');
    expect(p.configuration.missingFields).toContain("organization_locations.location_type = 'warehouse'");
  });

  it('absence: no canonical record → null location, never a fabricated coordinate', () => {
    const p = buildLagerContextProjection(
      base({ locations: [], internalProjects: [internalProject({ location_id: null })] }),
    );
    expect(p.location).toBeNull();
    expect(p.configuration.missingFields.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).not.toMatch(/59\.4[0-9]/);
  });

  it('does not resolve a location owned by another organization', () => {
    const r = resolveCanonicalLagerLocation(
      ORG,
      [location({ organization_id: OTHER })],
      [internalProject({ organization_id: OTHER })],
    );
    expect(r.location).toBeNull();
  });
});

describe('applicability (schedule context only)', () => {
  const assignments = [
    { id: 'a1', organization_id: ORG, staff_id: 's1', team_id: 'transport', assignment_date: '2026-09-02' },
    { id: 'a2', organization_id: ORG, staff_id: 's2', team_id: 'lager-1', assignment_date: '2026-09-03' },
    { id: 'a3', organization_id: ORG, staff_id: 's3', team_id: 'team-4', assignment_date: '2026-09-03' },
    { id: 'a4', organization_id: OTHER, staff_id: 's4', team_id: 'transport', assignment_date: '2026-09-03' },
    { id: 'a5', organization_id: ORG, staff_id: 's1', team_id: 'transport', assignment_date: '2026-10-05' },
  ] as never;

  it('derives worker/date applicability from staff_assignments, org- and range-scoped', () => {
    const p = buildLagerContextProjection(base({ staffAssignments: assignments }));
    expect(p.applicability.map((a) => `${a.staffId}@${a.date}:${a.teamId}`)).toEqual([
      's1@2026-09-02:transport',
      's2@2026-09-03:lager-1',
    ]);
    expect(p.applicability.every((a) => a.provenance.isWorkEvidence === false)).toBe(true);
    expect(p.applicability.every((a) => a.provenance.contextType === 'schedule_context')).toBe(true);
  });

  it('honours the optional staff filter', () => {
    const p = buildLagerContextProjection(base({ staffAssignments: assignments, staffIds: ['s2'] }));
    expect(p.applicability).toHaveLength(1);
    expect(p.applicability[0].staffId).toBe('s2');
  });
});

describe('warehouse assignment targets', () => {
  it('projects warehouse_assignments and warehouse_calendar_events exactly', () => {
    const p = buildLagerContextProjection(
      base({
        warehouseAssignments: [{
          id: 'wa-1',
          organization_id: ORG,
          staff_id: 's1',
          assignment_date: '2026-09-04',
          assignment_type: 'packing',
          status: 'planned',
          title: 'Packa 2605-43',
          description: null,
          start_time: '07:00:00',
          end_time: '11:00:00',
          booking_id: 'b1',
          booking_number: '2605-43',
          delivery_address: 'Kundgatan 2',
          customer_name: 'Kund AB',
          warehouse_event_id: 'wce-1',
          packing_id: 'p1',
          source: 'packing_project',
        }] as never,
        warehouseCalendarEvents: [{
          id: 'wce-1',
          organization_id: ORG,
          title: 'Packning 2605-43',
          start_time: '2026-09-04T07:00:00Z',
          end_time: '2026-09-04T11:00:00Z',
          resource_id: 'lager-1',
          event_type: 'packing',
          booking_id: 'b1',
          booking_number: '2605-43',
          delivery_address: 'Kundgatan 2',
          warehouse_project_id: 'wp-1',
        }, {
          id: 'wce-2',
          organization_id: OTHER,
          title: 'Annan org',
          start_time: '2026-09-04T07:00:00Z',
          end_time: null,
          resource_id: 'lager-1',
          event_type: 'packing',
          booking_id: null,
          booking_number: null,
          delivery_address: null,
          warehouse_project_id: null,
        }] as never,
      }),
    );

    expect(p.warehouseAssignments.map((w) => w.targetKey)).toEqual([
      'planning:warehouse_assignment:wa-1',
      'planning:warehouse_event:wce-1',
    ]);
    expect(p.warehouseAssignments[0]).toMatchObject({
      staffId: 's1',
      title: 'Packa 2605-43',
      bookingNumber: '2605-43',
      startTime: '07:00:00',
      address: 'Kundgatan 2',
    });
    expect(p.warehouseAssignments[1]).toMatchObject({
      staffId: null,
      resourceId: 'lager-1',
      warehouseProjectId: 'wp-1',
    });
    expect(p.warehouseAssignments.every((w) => w.provenance.contextType === 'planning_assignment')).toBe(true);
    expect(p.warehouseAssignments.every((w) => w.provenance.isWorkEvidence === false)).toBe(true);
  });

  it('returns an empty list when no warehouse rows exist', () => {
    expect(buildLagerContextProjection(base()).warehouseAssignments).toEqual([]);
  });
});

describe('no source writes', () => {
  const fn = fs.readFileSync(
    path.join(process.cwd(), 'supabase/functions/planning-lager-context/index.ts'),
    'utf8',
  );
  const lib = fs.readFileSync(
    path.join(process.cwd(), 'supabase/functions/_shared/time-v2/lagerProjection.ts'),
    'utf8',
  );

  it('the edge function only selects — no insert/update/upsert/delete/rpc', () => {
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(fn).not.toContain(forbidden);
    }
    expect(fn).toContain(".select(");
  });

  it('the projection library is pure (no client, no fetch)', () => {
    expect(lib).not.toContain('createClient');
    expect(lib).not.toContain('fetch(');
  });

  it('the tenant is resolved server-side, never taken from the request body', () => {
    expect(fn).toContain('const organizationId = access.organizationId;');
    expect(fn).not.toContain('body.organizationId');
  });
});
