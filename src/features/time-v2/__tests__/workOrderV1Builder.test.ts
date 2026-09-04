/**
 * Adapter tests for the Planning → Time `work-order.v1` builder with a
 * REAL-SHAPED Planning fixture (same column names/nesting as production rows:
 * package parent + "  -- " prefixed components with parent_product_id /
 * parent_package_id / inventory_package_id, timestamptz phase fields,
 * establishment_tasks.visible_in_time_app + assigned_to_ids, etc.).
 *
 * Proves: booking/product/package lines, rig-event-teardown phases with
 * Stockholm offsets, worker-only tasks, team/contact/file mapping, omission
 * (never fabrication) on missing source, and that cost/price/margin/internal
 * fields present on the source rows never leak.
 */
import { describe, expect, it } from 'vitest';
import {
  buildWorkOrderV1,
  mergeWorkOrderGaps,
  type WorkOrderBuildInput,
} from '../../../../supabase/functions/_shared/time-v2/workOrderV1Builder';
import { WORK_ORDER_FORBIDDEN_KEY_TERMS } from '../../../../supabase/functions/_shared/time-v2/workOrderV1';

const WORKER = '11111111-1111-4111-8111-111111111111';
const COLLEAGUE = '22222222-2222-4222-8222-222222222222';
const OTHER_DAY_COLLEAGUE = '33333333-3333-4333-8333-333333333333';
const LEADER = '44444444-4444-4444-8444-444444444444';
const BOOKING = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_BOOKING = 'bbbbbbbb-0000-4000-8000-000000000002';
const PROJECT = 'pppppppp-0000-4000-8000-000000000001';
const INVENTORY_PKG = '8b647f99-5a30-4070-8980-afde28fb41ca';

const PARENT_1 = '2913259a-ab57-4122-ac8d-d076b909c14b';
const COMP_FRAME = 'db5bc2ff-14a9-4619-a0b4-1ed8de61fc43';
const COMP_ROOF = 'fa21898d-d07c-423a-a208-c17be852d88e';
const COMP_BAG = '53df5a16-aa1d-47da-9761-3351e1f71c21';
const STANDALONE = '0aab1cbd-e08c-45ae-ab46-1d35d9027ce6';
const REMOVED = '75716684-b904-4505-8bb8-c9654c3fab28';

/** Cost/price/internal columns exactly as they exist on production rows. */
const COST_NOISE = {
  unit_price: 1250,
  total_price: 2500,
  labor_cost: 400,
  material_cost: 300,
  external_cost: 0,
  assembly_cost: 120,
  handling_cost: 80,
  purchase_cost: 900,
  cost_notes: 'HEMLIG MARGINAL 42%',
  discount: 10,
  vat_rate: 25,
};

const fixture = (): WorkOrderBuildInput => ({
  workerStaffId: WORKER,
  workDate: '2026-06-04',
  booking: {
    id: BOOKING,
    booking_number: '2604-29',
    title: 'Westmans Uthyrning - 6 juni 2026',
    rigdaydate: '2026-06-04',
    eventdate: '2026-06-06',
    rigdowndate: '2026-06-07',
    rig_start_time: '2026-06-04T05:00:00+00:00',
    rig_end_time: '2026-06-04T15:00:00+00:00',
    event_start_time: '2026-06-06T08:00:00+00:00',
    event_end_time: '2026-06-06T20:00:00+00:00',
    rigdown_start_time: '2026-06-07T06:00:00+00:00',
    rigdown_end_time: '2026-06-07T10:00:00+00:00',
    contact_name: 'Kund Kundsson',
    contact_phone: '+46 70 000 00 00',
    contact_email: 'kund@example.com',
    carry_more_than_10m: true,
    ground_nails_allowed: false,
    exact_time_needed: true,
    exact_time_info: 'Porten öppnas 07:00 prick',
    customer_pickup: null,
    rental_only: false,
    map_drawing_url: 'https://files.example.com/drawings/riddarhustorget.png',
    // Internal / economic noise that must never leak
    internalnotes: 'INTERN: kunden är svår, ta betalt i förskott',
    economics_data: { margin_pct: 42, total_revenue_ex_vat: 99000 },
  },
  project: { id: PROJECT, name: 'Westmans Uthyrning - 6 juni 2026', project_leader: LEADER, internalnotes: 'PL-notering intern' },
  products: [
    { id: PARENT_1, booking_id: BOOKING, name: 'H Mastertent - 3x3 (#1)', quantity: 1, notes: null, parent_product_id: null, parent_package_id: null, is_package_component: false, inventory_package_id: INVENTORY_PKG, package_components: [{ name: 'Ramverk' }, { name: 'Takduk' }], sort_index: 0, source_missing_since: null, ...COST_NOISE },
    { id: COMP_FRAME, booking_id: BOOKING, name: '  -- H Mastertent - Ramverk 3x3', quantity: 1, notes: null, parent_product_id: PARENT_1, parent_package_id: INVENTORY_PKG, is_package_component: true, inventory_package_id: INVENTORY_PKG, package_components: null, sort_index: 0.001, source_missing_since: null, ...COST_NOISE },
    { id: COMP_ROOF, booking_id: BOOKING, name: '  ↳ H Mastertent - Takduk 3x3', quantity: 1, notes: 'Vit duk', parent_product_id: PARENT_1, parent_package_id: INVENTORY_PKG, is_package_component: true, inventory_package_id: INVENTORY_PKG, package_components: null, sort_index: 0.002, source_missing_since: null, ...COST_NOISE },
    // Component whose parent_product_id is missing but parent_package_id resolves via inventory package
    { id: COMP_BAG, booking_id: BOOKING, name: '  -- H Mastertent - Transportväska 3x3 (Pvc tak)', quantity: 2, notes: null, parent_product_id: null, parent_package_id: INVENTORY_PKG, is_package_component: true, inventory_package_id: INVENTORY_PKG, package_components: null, sort_index: 0.003, source_missing_since: null, ...COST_NOISE },
    { id: STANDALONE, booking_id: BOOKING, name: 'Bord 180x80', quantity: 12, notes: 'Levereras till scenen', parent_product_id: null, parent_package_id: null, is_package_component: false, inventory_package_id: null, package_components: null, sort_index: 5, source_missing_since: null, ...COST_NOISE },
    // Removed in Booking — must not be exported
    { id: REMOVED, booking_id: BOOKING, name: 'Stol', quantity: 40, notes: null, parent_product_id: null, parent_package_id: null, is_package_component: false, inventory_package_id: null, package_components: null, sort_index: 6, source_missing_since: '2026-05-01T00:00:00+00:00', ...COST_NOISE },
    // Another booking — must not be exported
    { id: 'x-other', booking_id: OTHER_BOOKING, name: 'Annan bokning', quantity: 1, notes: null, parent_product_id: null, parent_package_id: null, is_package_component: false, inventory_package_id: null, package_components: null, sort_index: 0, source_missing_since: null, ...COST_NOISE },
  ],
  calendarPhases: [
    // Extra rig day saved through savePhaseDays (calendar_events)
    { id: 'ce-rig-2', booking_id: BOOKING, event_type: 'rig', start_time: '2026-06-05T05:00:00+00:00', end_time: '2026-06-05T13:00:00+00:00' },
    // Same as canonical rig day → deduped
    { id: 'ce-rig-1', booking_id: BOOKING, event_type: 'rig', start_time: '2026-06-04T05:00:00+00:00', end_time: '2026-06-04T15:00:00+00:00' },
    { id: 'ce-todo', booking_id: BOOKING, event_type: 'todo', start_time: '2026-06-03T05:00:00+00:00', end_time: '2026-06-03T06:00:00+00:00' },
    { id: 'ce-other', booking_id: OTHER_BOOKING, event_type: 'rigDown', start_time: '2026-06-09T05:00:00+00:00', end_time: '2026-06-09T06:00:00+00:00' },
  ],
  attachments: [
    { id: 'att-1', booking_id: BOOKING, url: 'https://files.example.com/att/scen.jpg', file_name: 'scen.jpg', file_type: 'image/jpeg' },
    { id: 'att-2', booking_id: BOOKING, url: 'http://insecure.example.com/plan.pdf', file_name: 'plan.pdf', file_type: 'application/pdf' },
    { id: 'att-3', booking_id: OTHER_BOOKING, url: 'https://files.example.com/att/other.jpg', file_name: 'other.jpg', file_type: 'image/jpeg' },
  ],
  projectFiles: [
    { id: 'pf-1', project_id: PROJECT, url: 'https://files.example.com/pf/lastplan.pdf', file_name: 'Lastplan.pdf', file_type: 'application/pdf' },
  ],
  establishmentTasks: [
    { id: 'et-1', booking_id: BOOKING, title: 'Bygg scen', completed: false, status: 'todo', notes: 'Börja med bakre delen', assigned_to: null, assigned_to_ids: [WORKER, COLLEAGUE], visible_in_time_app: true, sort_order: 2 },
    { id: 'et-2', booking_id: BOOKING, title: 'Koppla el', completed: false, status: 'done', notes: null, assigned_to: WORKER, assigned_to_ids: null, visible_in_time_app: true, sort_order: 1 },
    { id: 'et-3', booking_id: BOOKING, title: 'Kollegans uppgift', completed: false, status: 'todo', notes: null, assigned_to: null, assigned_to_ids: [COLLEAGUE], visible_in_time_app: true, sort_order: 0 },
    { id: 'et-4', booking_id: BOOKING, title: 'Dold adminuppgift', completed: false, status: 'todo', notes: null, assigned_to: WORKER, assigned_to_ids: [WORKER], visible_in_time_app: false, sort_order: 0 },
  ],
  projectTasks: [
    { id: 'pt-1', project_id: PROJECT, title: 'Boka lift', description: 'Senast onsdag', completed: true, is_info_only: false, assigned_to: null, assigned_to_ids: [WORKER], sort_order: 9 },
    { id: 'pt-2', project_id: PROJECT, title: 'Info till alla', description: null, completed: false, is_info_only: true, assigned_to: WORKER, assigned_to_ids: [WORKER], sort_order: 0 },
    { id: 'pt-3', project_id: PROJECT, title: 'Ledarens uppgift', description: null, completed: false, is_info_only: false, assigned_to: LEADER, assigned_to_ids: [LEADER], sort_order: 0 },
  ],
  teamRows: [
    { booking_id: BOOKING, staff_id: WORKER, assignment_date: '2026-06-04', team_id: 'team-4' },
    { booking_id: BOOKING, staff_id: COLLEAGUE, assignment_date: '2026-06-04', team_id: 'team-4' },
    { booking_id: BOOKING, staff_id: OTHER_DAY_COLLEAGUE, assignment_date: '2026-06-05', team_id: 'team-4' },
    { booking_id: OTHER_BOOKING, staff_id: LEADER, assignment_date: '2026-06-04', team_id: 'team-1' },
  ],
  staffById: new Map([
    [COLLEAGUE, { id: COLLEAGUE, name: 'Anna Ek', role: 'Tekniker', phone: null, salary: 41000, hourly_rate: 310 }],
    [OTHER_DAY_COLLEAGUE, { id: OTHER_DAY_COLLEAGUE, name: 'Björn Alm', role: null, phone: null }],
    [LEADER, { id: LEADER, name: 'Lena Ledare', role: 'Projektledare', phone: '+46 70 111 11 11', hourly_rate: 500 }],
  ]),
});

const collectKeys = (value: unknown, out: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(k);
      collectKeys(v, out);
    }
  }
  return out;
};

describe('work-order.v1 builder — real-shaped Planning fixture', () => {
  const { workOrder, gaps } = buildWorkOrderV1(fixture());
  if (!workOrder) throw new Error('expected a work order');

  it('maps rig / event / teardown from saved Planning time fields with Stockholm offsets, plus extra calendar days, deduped', () => {
    expect(workOrder.phases).toEqual([
      { kind: 'rig', startsAt: '2026-06-04T07:00:00+02:00', endsAt: '2026-06-04T17:00:00+02:00' },
      { kind: 'rig', startsAt: '2026-06-05T07:00:00+02:00', endsAt: '2026-06-05T15:00:00+02:00' },
      { kind: 'event', startsAt: '2026-06-06T10:00:00+02:00', endsAt: '2026-06-06T22:00:00+02:00' },
      { kind: 'teardown', startsAt: '2026-06-07T08:00:00+02:00', endsAt: '2026-06-07T12:00:00+02:00' },
    ]);
  });

  it('keeps package parent, components with parentLineId, quantity, note and cleaned labels; drops removed/other-booking rows', () => {
    const lines = workOrder.lines ?? [];
    expect(lines.map((l) => l.id)).toEqual([PARENT_1, COMP_FRAME, COMP_ROOF, COMP_BAG, STANDALONE]);
    expect(lines[0]).toEqual({ id: PARENT_1, kind: 'package', label: 'H Mastertent - 3x3 (#1)', quantity: 1 });
    expect(lines[1]).toEqual({ id: COMP_FRAME, kind: 'product', label: 'H Mastertent - Ramverk 3x3', quantity: 1, parentLineId: PARENT_1 });
    expect(lines[2]).toEqual({ id: COMP_ROOF, kind: 'product', label: 'H Mastertent - Takduk 3x3', quantity: 1, note: 'Vit duk', parentLineId: PARENT_1 });
    // parent resolved through parent_package_id → inventory package → parent row
    expect(lines[3]).toEqual({ id: COMP_BAG, kind: 'product', label: 'H Mastertent - Transportväska 3x3 (Pvc tak)', quantity: 2, parentLineId: PARENT_1 });
    expect(lines[4]).toEqual({ id: STANDALONE, kind: 'product', label: 'Bord 180x80', quantity: 12, note: 'Levereras till scenen' });
    expect(lines.some((l) => l.id === REMOVED)).toBe(false);
    expect(lines.some((l) => l.id === 'x-other')).toBe(false);
    // Planning has no unit source → omitted and reported, never invented
    expect(lines.every((l) => l.unit === undefined)).toBe(true);
    expect(gaps.line_unit_unavailable).toBe(5);
  });

  it('emits only practical instructions from real booking flags — never internal notes', () => {
    expect(workOrder.instructions).toEqual([
      'Exakt tid behövs: Porten öppnas 07:00 prick',
      'Bär mer än 10 m',
      'Markpinnar ej tillåtet',
    ]);
    expect(JSON.stringify(workOrder)).not.toContain('INTERN');
    expect(JSON.stringify(workOrder)).not.toContain('PL-notering');
  });

  it('exports only the receiving worker\'s tasks (establishment visible_in_time_app + assigned, project non-info assigned)', () => {
    expect(workOrder.tasks).toEqual([
      { id: 'et-2', title: 'Koppla el', completed: true },
      { id: 'et-1', title: 'Bygg scen', completed: false, note: 'Börja med bakre delen' },
      { id: 'pt-1', title: 'Boka lift', completed: true, note: 'Senast onsdag' },
    ]);
  });

  it('exports only https files: booking attachments, project files and the map drawing; http is dropped and reported', () => {
    expect(workOrder.files).toEqual([
      { url: 'https://files.example.com/att/scen.jpg', name: 'scen.jpg', kind: 'image' },
      { url: 'https://files.example.com/pf/lastplan.pdf', name: 'Lastplan.pdf', kind: 'document' },
      { url: 'https://files.example.com/drawings/riddarhustorget.png', name: 'riddarhustorget.png', kind: 'image' },
    ]);
    expect(gaps.file_not_https).toBe(1);
  });

  it('team = colleagues on the same booking and day, never the worker themself', () => {
    expect(workOrder.team).toEqual([{ name: 'Anna Ek', role: 'Tekniker' }]);
  });

  it('contacts = delivery contact + resolved project leader', () => {
    expect(workOrder.contacts).toEqual([
      { name: 'Kund Kundsson', role: 'Leveranskontakt', phone: '+46 70 000 00 00', email: 'kund@example.com' },
      { name: 'Lena Ledare', role: 'Projektledare', phone: '+46 70 111 11 11' },
    ]);
  });

  it('never leaks cost, price, margin, salary/rate, VAT/discount or internal notes', () => {
    const keys = collectKeys(workOrder).map((k) => k.toLowerCase());
    for (const term of WORK_ORDER_FORBIDDEN_KEY_TERMS) {
      expect(keys.some((k) => k.includes(term)), `key containing "${term}"`).toBe(false);
    }
    const serialized = JSON.stringify(workOrder);
    for (const needle of ['1250', '2500', 'HEMLIG', '42', '99000', '41000', '310', '500', 'economics', 'salary', 'hourly']) {
      expect(serialized, `value "${needle}"`).not.toContain(needle);
    }
  });

  it('is deterministic for identical input', () => {
    expect(buildWorkOrderV1(fixture())).toEqual(buildWorkOrderV1(fixture()));
  });
});

describe('work-order.v1 builder — omission instead of fabrication', () => {
  it('returns null (omit workOrder) when the booking has no field data at all', () => {
    const result = buildWorkOrderV1({ workerStaffId: WORKER, workDate: '2026-06-04', booking: { id: BOOKING } });
    expect(result.workOrder).toBeNull();
    expect(result.gaps).toEqual({ work_order_empty: 1 });
  });

  it('omits a phase whose saved times are missing and reports exactly which one', () => {
    const input = fixture();
    const result = buildWorkOrderV1({
      ...input,
      calendarPhases: [],
      booking: { ...input.booking, event_start_time: null, event_end_time: null, rigdown_end_time: null },
    });
    expect(result.workOrder?.phases?.map((p) => p.kind)).toEqual(['rig']);
    expect(result.gaps['phase_times_missing:event']).toBe(1);
    expect(result.gaps['phase_times_missing:teardown']).toBe(1);
  });

  it('omits a phase whose saved times are inverted rather than guessing', () => {
    const input = fixture();
    const result = buildWorkOrderV1({
      ...input,
      calendarPhases: [],
      booking: { ...input.booking, rig_start_time: '2026-06-04T15:00:00+00:00', rig_end_time: '2026-06-04T05:00:00+00:00' },
    });
    expect(result.workOrder?.phases?.some((p) => p.kind === 'rig')).toBe(false);
    expect(result.gaps['phase_invalid:rig']).toBe(1);
  });

  it('never exports another worker\'s tasks even when the worker has none', () => {
    const input = fixture();
    const result = buildWorkOrderV1({ ...input, workerStaffId: OTHER_DAY_COLLEAGUE, workDate: '2026-06-05' });
    expect(result.workOrder?.tasks).toBeUndefined();
    // and team on 2026-06-05 is empty (only the worker themself was assigned that day)
    expect(result.workOrder?.team).toBeUndefined();
  });

  it('drops contacts without a name and unresolved leader ids (no placeholder names)', () => {
    const input = fixture();
    const result = buildWorkOrderV1({
      ...input,
      booking: { ...input.booking, contact_name: '   ' },
      project: { id: PROJECT, project_leader: '99999999-9999-4999-8999-999999999999' },
      staffById: new Map(),
    });
    expect(result.workOrder?.contacts).toBeUndefined();
    expect(result.gaps.contact_name_missing).toBe(1);
    expect(result.gaps.project_leader_unresolved).toBe(1);
  });

  it('keeps a free-text project leader (not a staff id) as a named contact', () => {
    const input = fixture();
    const result = buildWorkOrderV1({ ...input, project: { id: PROJECT, project_leader: 'Kalle Kula' }, staffById: new Map() });
    expect(result.workOrder?.contacts?.find((c) => c.role === 'Projektledare')).toEqual({ name: 'Kalle Kula', role: 'Projektledare' });
  });

  it('merges per-assignment gaps into one sorted PII-free report', () => {
    expect(mergeWorkOrderGaps([{ b: 2, a: 1 }, { a: 3 }])).toEqual([{ code: 'a', count: 4 }, { code: 'b', count: 2 }]);
  });
});
