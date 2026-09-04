/**
 * Locks how `work-order.v1` rides on the signed `worker.assignments.sync`
 * payload: the assignment binding is unchanged, `workOrder` is additive and
 * optional, the assignment `sourceVersion` re-versions when work-order content
 * changes, and the Planning reads never select cost/price/internal columns.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignmentLocation,
  assignmentVersionSeed,
  buildAssignmentPayload,
  type AssignmentShapeInput,
} from '../../../../supabase/functions/time-planning-proxy/assignmentShape';
import {
  buildAttachedWorkOrders,
  canonicalWorkOrderJson,
  type WorkOrderCandidate,
} from '../../../../supabase/functions/time-planning-proxy/workOrderAttach';
import type { WorkOrderSourceBundle } from '../../../../supabase/functions/time-planning-proxy/workOrderReads';

const WORKER = '11111111-1111-4111-8111-111111111111';
const BOOKING = 'bbbbbbbb-0000-4000-8000-000000000001';
const PROJECT = 'pppppppp-0000-4000-8000-000000000001';
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001';

const shape = (): AssignmentShapeInput => ({
  event: { id: EVENT, resource_id: 'team-4', booking_id: BOOKING, title: 'Westmans', event_type: 'rig', source_date: '2026-06-04', booking_number: '2604-29', delivery_address: null },
  booking: { id: BOOKING, status: 'CONFIRMED', version: 7, updated_at: '2026-06-01T00:00:00+00:00', booking_number: '2604-29', title: 'Westmans Uthyrning', deliveryaddress: 'Riddarhustorget 10', delivery_latitude: 59.325871, delivery_longitude: 18.065806, contact_name: 'Kund Kundsson', contact_phone: '+46700000000', rig_start_time: '2026-06-04T05:00:00+00:00', rig_end_time: '2026-06-04T15:00:00+00:00' },
  project: { id: PROJECT, name: 'Westmans Uthyrning - 6 juni 2026', updated_at: '2026-06-02T00:00:00+00:00', deliveryaddress: 'Riddarhustorget 10', delivery_latitude: 59.325871, delivery_longitude: 18.065806, address_radius_meters: 150 },
  staff: { id: WORKER, role: 'Tekniker' },
  startsAt: '2026-06-04T05:00:00+00:00',
  endsAt: '2026-06-04T15:00:00+00:00',
});

const emptySources = (): WorkOrderSourceBundle => ({
  products: [], calendarPhases: [], attachments: [], projectFiles: [], establishmentTasks: [], projectTasks: [], teamRows: [], staffById: new Map(), readFailures: [],
});

const candidate = (): WorkOrderCandidate => ({
  sourceAssignmentId: EVENT,
  workDate: '2026-06-04',
  booking: shape().booking as unknown as WorkOrderCandidate['booking'],
  project: { id: PROJECT },
});

describe('worker.assignments.sync — work-order.v1 is additive on the unchanged binding', () => {
  it('keeps the exact work-context.v1 assignment binding and attaches workOrder only when present', () => {
    const s = shape();
    const location = assignmentLocation(s);
    const without = buildAssignmentPayload(s, 'v1', location, null);
    expect(without).toEqual({
      sourceAssignmentId: EVENT,
      sourceVersion: 'v1',
      workerExternalId: WORKER,
      workDate: '2026-06-04',
      startsAt: '2026-06-04T05:00:00+00:00',
      endsAt: '2026-06-04T15:00:00+00:00',
      roleLabel: 'Tekniker',
      teamLabel: 'team-4',
      target: {
        sourceSystem: 'planning',
        kind: 'project',
        externalId: PROJECT,
        version: 'v1',
        label: 'Westmans Uthyrning - 6 juni 2026',
        bookingNumber: '2604-29',
        phase: { code: 'rig', label: 'Montering' },
        location: { address: 'Riddarhustorget 10', latitude: 59.325871, longitude: 18.065806, radiusM: 150 },
        reporting: { state: 'allowed' },
      },
      workerDetail: { address: 'Riddarhustorget 10', contactName: 'Kund Kundsson', contactPhone: '+46700000000' },
    });
    expect('workOrder' in without).toBe(false);

    const workOrder = { phases: [{ kind: 'rig' as const, startsAt: '2026-06-04T07:00:00+02:00', endsAt: '2026-06-04T17:00:00+02:00' }] };
    const withOrder = buildAssignmentPayload(s, 'v1', location, workOrder);
    const { workOrder: attached, ...rest } = withOrder as typeof withOrder & { workOrder: unknown };
    expect(attached).toEqual(workOrder);
    expect(rest).toEqual(without);
  });

  it('re-versions the assignment when the work order content changes, and not otherwise', () => {
    const s = shape();
    const location = assignmentLocation(s);
    const base = assignmentVersionSeed(s, location, null);
    expect('workOrderHash' in base).toBe(false);
    expect(assignmentVersionSeed(s, location, 'h1')).toEqual({ ...base, workOrderHash: 'h1' });
    expect(JSON.stringify(assignmentVersionSeed(s, location, 'h1'))).not.toBe(JSON.stringify(assignmentVersionSeed(s, location, 'h2')));
  });

  it('canonical JSON is key-order independent (stable hash for equal content)', () => {
    expect(canonicalWorkOrderJson({ b: 1, a: { d: 2, c: [ { z: 1, y: 2 } ] } }))
      .toBe(canonicalWorkOrderJson({ a: { c: [ { y: 2, z: 1 } ], d: 2 }, b: 1 }));
  });

  it('builds one work order per bound assignment and reports attach/omit counts + gaps', async () => {
    const sources = emptySources();
    const { byAssignment, report } = await buildAttachedWorkOrders([candidate()], WORKER, sources);
    const attached = byAssignment.get(EVENT);
    expect(attached?.workOrder?.phases).toEqual([{ kind: 'rig', startsAt: '2026-06-04T07:00:00+02:00', endsAt: '2026-06-04T17:00:00+02:00' }]);
    expect(attached?.workOrder?.contacts).toEqual([{ contactId: `booking:${BOOKING}:delivery`, role: 'Leveranskontakt', displayName: 'Kund Kundsson', phone: '+46700000000' }]);
    expect(attached?.workOrderHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report).toEqual({
      schema: 'planning-work-order-report.v1',
      attached: 1,
      omitted: 0,
      gaps: [],
      readFailures: [],
    });
  });

  it('omits the work order (no fabrication) when nothing field-relevant exists and surfaces read failures as gaps', async () => {
    const bare: WorkOrderCandidate = { sourceAssignmentId: EVENT, workDate: '2026-06-04', booking: { id: BOOKING }, project: null };
    const { byAssignment, report } = await buildAttachedWorkOrders([bare], WORKER, { ...emptySources(), readFailures: ['booking_products'] });
    expect(byAssignment.get(EVENT)?.workOrder).toBeNull();
    expect(byAssignment.get(EVENT)?.workOrderHash).toBeNull();
    expect(report.attached).toBe(0);
    expect(report.omitted).toBe(1);
    expect(report.gaps).toEqual([
      { code: 'source_read_failed:booking_products', count: 1 },
      { code: 'work_order_empty', count: 1 },
    ]);
  });
});

describe('worker.assignments.sync — Planning reads exclude cost/price/internal columns at the query', () => {
  const root = resolve(__dirname, '../../../../supabase/functions/time-planning-proxy');
  const reads = readFileSync(resolve(root, 'workOrderReads.ts'), 'utf8');
  const sync = readFileSync(resolve(root, 'workerAssignmentSync.ts'), 'utf8');
  const FORBIDDEN_COLUMNS = [
    'unit_price', 'total_price', 'labor_cost', 'material_cost', 'external_cost', 'assembly_cost', 'handling_cost',
    'purchase_cost', 'cost_notes', 'discount', 'vat_rate', 'economics_data', 'internalnotes', 'salary', 'hourly_rate', 'overtime_rate',
  ];

  it('never selects a forbidden column', () => {
    const selects = [...reads.matchAll(/select\(\s*['"`]([^'"`]+)['"`]/g), ...reads.matchAll(/const PRODUCT_COLUMNS =\s*\n?\s*'([^']+)'/g)]
      .map((m) => m[1]);
    const syncSelects = [...sync.matchAll(/const (BOOKING|PROJECT)_COLUMNS = \[([\s\S]*?)\]\.join/g)].map((m) => m[2]);
    expect(selects.length).toBeGreaterThanOrEqual(7);
    expect(syncSelects.length).toBe(2);
    for (const select of [...selects, ...syncSelects]) {
      for (const column of FORBIDDEN_COLUMNS) {
        expect(select, `${column} in "${select.slice(0, 60)}…"`).not.toMatch(new RegExp(`\\b${column}\\b`));
      }
    }
  });

  it('scopes every table read to the organization', () => {
    const fromCalls = (reads.match(/\.from\('/g) ?? []).length;
    const orgFilters = (reads.match(/\.eq\('organization_id', organizationId\)/g) ?? []).length;
    expect(fromCalls).toBeGreaterThanOrEqual(8);
    expect(orgFilters).toBe(fromCalls);
  });

  it('worker tasks are pre-filtered to the requesting worker and visible_in_time_app at the query', () => {
    expect(reads).toMatch(/\.eq\('visible_in_time_app', true\)/);
    expect(reads).toMatch(/assigned_to_ids\.cs\.\{\$\{staffId\}\},assigned_to\.eq\.\$\{staffId\}/);
  });
});
