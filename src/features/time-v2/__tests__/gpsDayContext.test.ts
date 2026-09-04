import { describe, expect, it } from 'vitest';
import {
  buildGpsDayContext,
  canonicalGpsDayContextJson,
  PLANNING_GPS_DAY_CONTEXT_SCHEMA,
  type GpsDayContextInput,
} from '../../../../supabase/functions/_shared/time-v2/gpsDayContext';
import type { InternalLagerLocationTarget } from '../../../../supabase/functions/_shared/time-v2/lagerProjection';

const ORG = 'f5e5cade-f08b-4833-a105-56461f15b191';
const OTHER_ORG = '00000000-0000-4000-8000-000000012ee2';
const STAFF = 'staff_1775736348370_e5mua0yum';
const DATE = '2026-06-04';

const lager: InternalLagerLocationTarget = {
  kind: 'internal_location',
  targetKey: 'planning:lager:0b9d94df-e46e-4987-8b7f-ef04b663dac5',
  organizationId: ORG,
  locationId: '0b9d94df-e46e-4987-8b7f-ef04b663dac5',
  internalProjectId: null,
  label: 'FA Warehouse',
  address: null,
  latitude: 59.4914494330173,
  longitude: 17.8553564370097,
  radiusMeters: 200,
  geofenceMode: null,
  isExact: true,
  missingFields: [],
  recommendedFields: ['address'],
  provenance: { source: 'organization_locations', recordId: '0b9d94df-e46e-4987-8b7f-ef04b663dac5' } as never,
};

function baseInput(overrides: Partial<GpsDayContextInput> = {}): GpsDayContextInput {
  return {
    organizationId: ORG,
    staffId: STAFF,
    staffName: 'Raivis Minalto',
    date: DATE,
    staffAssignments: [
      { organization_id: ORG, staff_id: STAFF, team_id: 'team-4', assignment_date: DATE },
      { organization_id: ORG, staff_id: STAFF, team_id: 'team-3', assignment_date: '2026-06-05' },
    ],
    calendarEvents: [
      {
        id: 'cdd54fe4-3eb5-4f16-8893-b1f55e74cc3f',
        organization_id: ORG,
        resource_id: 'team-4',
        source_date: DATE,
        event_type: 'rig',
        title: '3st 4x9  +5x5 – Westmans Uthyrning',
        booking_id: '7f843bf5-0aee-48fb-9469-2d77fba2c553',
        booking_number: '2604-29',
        delivery_address: 'Riddarhustorget 10',
        start_time: '2026-06-04 07:00:00+00',
        end_time: '2026-06-04 17:00:00+00',
      },
      {
        id: 'other-team-event',
        organization_id: ORG,
        resource_id: 'team-1',
        source_date: DATE,
        event_type: 'rig',
        title: 'Ej Raivis team',
        booking_id: 'b-other',
        booking_number: '2605-24',
        delivery_address: 'Spelmanshöjden 24',
        start_time: null,
        end_time: null,
      },
    ],
    bookings: [
      {
        id: '7f843bf5-0aee-48fb-9469-2d77fba2c553',
        organization_id: ORG,
        booking_number: '2604-29',
        deliveryaddress: 'Riddarhustorget 10',
        delivery_latitude: 59.325871,
        delivery_longitude: 18.065806,
      },
    ],
    projects: [
      {
        id: 'bc9a73e7-8235-4973-a13f-c6fa1a904343',
        organization_id: ORG,
        booking_id: '7f843bf5-0aee-48fb-9469-2d77fba2c553',
        name: 'Westmans Uthyrning - 6 juni 2026',
        deliveryaddress: 'Riddarhustorget 10',
        delivery_latitude: 59.325871,
        delivery_longitude: 18.065806,
        address_radius_meters: null,
        is_internal: false,
      },
    ],
    lagerLocation: lager,
    ...overrides,
  };
}

describe('planning-gps-day-context.v1', () => {
  it('projects exactly the targets for the staff team that date', () => {
    const ctx = buildGpsDayContext(baseInput());
    expect(ctx.schema).toBe(PLANNING_GPS_DAY_CONTEXT_SCHEMA);
    expect(ctx.teams).toEqual(['team-4']);
    expect(ctx.projectTargets).toHaveLength(1);
    const target = ctx.projectTargets[0];
    expect(target.projectId).toBe('bc9a73e7-8235-4973-a13f-c6fa1a904343');
    expect(target.bookingNumber).toBe('2604-29');
    expect(target.latitude).toBeCloseTo(59.325871, 6);
    expect(target.longitude).toBeCloseTo(18.065806, 6);
    expect(target.isExact).toBe(true);
    expect(target.requiresEvidence).toBe(true);
    expect(target.isWorkEvidence).toBe(false);
  });

  it('binds the Lager target to the same organization only', () => {
    const ctx = buildGpsDayContext(baseInput());
    expect(ctx.lagerTarget?.locationId).toBe('0b9d94df-e46e-4987-8b7f-ef04b663dac5');
    expect(ctx.lagerTarget?.organizationId).toBe(ORG);

    const crossOrg = buildGpsDayContext(
      baseInput({ lagerLocation: { ...lager, organizationId: OTHER_ORG } }),
    );
    expect(crossOrg.lagerTarget).toBeNull();
    expect(crossOrg.warnings).toContain('lager_location_rejected_wrong_organization');
  });

  it('never projects rows from another organization', () => {
    const input = baseInput();
    const ctx = buildGpsDayContext({
      ...input,
      calendarEvents: input.calendarEvents.map((e) => ({ ...e, organization_id: OTHER_ORG })),
    });
    expect(ctx.projectTargets).toHaveLength(0);
    expect(ctx.warnings).toContain('no_planning_project_targets_for_date');
  });

  it('flags missing coordinates instead of fabricating them', () => {
    const input = baseInput();
    const ctx = buildGpsDayContext({
      ...input,
      bookings: input.bookings.map((b) => ({ ...b, delivery_latitude: null, delivery_longitude: null })),
      projects: input.projects.map((p) => ({ ...p, delivery_latitude: null, delivery_longitude: null })),
    });
    expect(ctx.projectTargets[0].isExact).toBe(false);
    expect(ctx.projectTargets[0].missingFields).toContain('coordinates');
    expect(ctx.warnings).toContain('project_target_missing_exact_location');
  });

  it('is deterministic (same input → byte-identical document)', () => {
    expect(canonicalGpsDayContextJson(buildGpsDayContext(baseInput()))).toBe(
      canonicalGpsDayContextJson(buildGpsDayContext(baseInput())),
    );
  });

  it('reports no lager when Planning has none configured', () => {
    const ctx = buildGpsDayContext(baseInput({ lagerLocation: null }));
    expect(ctx.lagerTarget).toBeNull();
    expect(ctx.warnings).toContain('no_org_bound_lager_location');
  });
});
